"""Local, cancellable full-resolution folder exports with bounded memory."""

import atexit
import errno
import json
import re
import shutil
import tempfile
import threading
import time
import zipfile
from pathlib import Path

from fastapi import HTTPException

from .acquisition import Acquisition


class Cancelled(Exception):
    pass


class BatchExports:
    # One worker keeps disk pressure predictable. Completed downloads expire after
    # 30 minutes; a new batch replaces the previous one once downloads finish.
    def __init__(self):
        self.lock = threading.RLock()
        self.job = None
        self.folder = None
        self.readers = 0
        self.expiry_timer = None
        atexit.register(self.close)

    def close(self):
        with self.lock:
            if self.expiry_timer:
                self.expiry_timer.cancel()
            if self.job:
                self.job["cancel"].set()
            if self.folder:
                shutil.rmtree(self.folder, ignore_errors=True)

    def start(self, sources):
        import secrets

        with self.lock:
            if (self.job and self.job["status"] == "running") or self.readers:
                raise HTTPException(409, "A folder export or download is already in progress.")
            if not sources:
                raise HTTPException(400, "This folder contains no C3D files.")
            # Allocate before deleting a previous completed result. A full
            # temporary disk must not leave a ready task with no ZIP behind.
            try:
                folder = Path(tempfile.mkdtemp(prefix="c3d-export-"))
            except OSError as exc:
                if exc.errno in (errno.ENOSPC, errno.EDQUOT):
                    raise HTTPException(
                        507, "Not enough temporary disk space. Free space and retry."
                    ) from None
                raise HTTPException(
                    507, "Cannot create the temporary export folder. Check disk permissions."
                ) from None
            self.close()
            self.folder = folder
            self.job = dict(
                id=secrets.token_hex(16),
                folderName=sources[0].parent.name or "/",
                status="running",
                total=len(sources),
                completed=0,
                succeeded=0,
                failed=0,
                current="",
                stage="reading",
                processed=0,
                stageTotal=0,
                started=time.monotonic(),
                errorCode=None,
                errors=[],
                cancel=threading.Event(),
                updated=time.monotonic(),
            )
            threading.Thread(
                target=self._run, args=(self.job, self.folder, sources), daemon=True
            ).start()
            return self.snapshot(self.job["id"])

    def _check(self, job):
        if job["cancel"].is_set():
            raise Cancelled()

    def current(self):
        with self.lock:
            return self.snapshot(self.job["id"]) if self.job else None

    def _progress(self, job, stage, processed, total):
        self._check(job)
        with self.lock:
            job.update(stage=stage, processed=processed, stageTotal=total)

    def _run(self, job, folder, sources):
        manifest = {"formatVersion": 1, "timeOrigin": "first frame = 0 seconds", "files": []}
        try:
            with zipfile.ZipFile(
                folder / "export.zip", "w", zipfile.ZIP_DEFLATED, compresslevel=3, allowZip64=True
            ) as archive:
                for number, source in enumerate(sources, 1):
                    self._check(job)
                    with self.lock:
                        job.update(current=source.name, stage="reading", processed=0, stageTotal=0)
                    entry = {"source": source.name}
                    staging = folder / "staging"
                    staging.mkdir(exist_ok=True)
                    try:
                        acq = Acquisition(source)
                        # Numbered names prevent case-folding and normalization collisions.
                        stem = (
                            re.sub(r"[\\/:\x00-\x1f]", "_", source.stem)[:100].strip(". ")
                            or "recording"
                        )
                        prefix = f"{number:04d}-{stem}"
                        exported = []
                        for kind, count, name in [
                            ("point", acq.npoints, "points.csv"),
                            ("analog", acq.nanalog, "analog.csv"),
                        ]:
                            if not count:
                                continue
                            with (staging / name).open(
                                "w", encoding="utf-8-sig", newline=""
                            ) as stream:
                                for chunk in acq.csv_rows(
                                    kind,
                                    list(range(count)),
                                    0,
                                    acq.count,
                                    progress=lambda done, total: self._progress(
                                        job, kind, done, total
                                    ),
                                ):
                                    self._check(job)
                                    stream.write(chunk)
                            exported.append(name)
                        stat = source.stat()
                        if (stat.st_size, stat.st_mtime_ns, stat.st_ino) != acq.fingerprint:
                            raise ValueError("Source changed during export")
                        entry.update(
                            status="ok",
                            directory=prefix,
                            frameCount=acq.count,
                            firstFrame=acq.first,
                            lastFrame=acq.last,
                            pointRate=acq.rate,
                            analogRate=acq.analog_rate,
                            points=[
                                dict(label=label, unit=unit, kind=kind, role=acq.point_roles[i])
                                for i, (label, unit, kind) in enumerate(
                                    zip(acq.point_labels, acq.units, acq.kinds)
                                )
                            ],
                            analogs=[
                                dict(label=label, unit=unit)
                                for label, unit in zip(acq.analog_labels, acq.analog_units)
                            ],
                        )
                    except Cancelled:
                        raise
                    except Exception as exc:
                        if isinstance(exc, OSError) and exc.errno in (errno.ENOSPC, errno.EDQUOT):
                            raise
                        # Do not publish exception strings: OS/parser errors may contain
                        # absolute paths or arbitrary source metadata. Sources are untouched.
                        entry.update(
                            status="error",
                            error="Cannot export this C3D file. Check that it is valid, unchanged and accessible.",
                        )
                        with self.lock:
                            job["failed"] += 1
                            job["errors"].append(source.name)
                    if entry["status"] == "ok":
                        # Chunked ZIP writes remain cancellable for very large CSVs.
                        # Archive/storage failures abort the whole job, never masquerade
                        # as a valid recording with a partial CSV in the result.
                        total_bytes = sum((staging / name).stat().st_size for name in exported)
                        copied = 0
                        self._progress(job, "zip", 0, total_bytes)
                        for name in exported:
                            with (
                                (staging / name).open("rb") as source_csv,
                                archive.open(f"{prefix}/{name}", "w", force_zip64=True) as target,
                            ):
                                while True:
                                    self._check(job)
                                    chunk = source_csv.read(1024 * 1024)
                                    if not chunk:
                                        break
                                    target.write(chunk)
                                    copied += len(chunk)
                                    self._progress(job, "zip", copied, total_bytes)
                        with self.lock:
                            job["succeeded"] += 1
                    shutil.rmtree(staging, ignore_errors=True)
                    manifest["files"].append(entry)
                    with self.lock:
                        job["completed"] += 1
                self._check(job)
                archive.writestr(
                    "manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2)
                )
            with self.lock:
                self._check(job)
                job.update(status="ready", current="", updated=time.monotonic())
                self._schedule_expiry(job["id"])
        except Exception as exc:
            with self.lock:
                job.update(
                    status="cancelled" if isinstance(exc, Cancelled) else "error",
                    current="",
                    updated=time.monotonic(),
                    errorCode="diskFull"
                    if isinstance(exc, OSError) and exc.errno in (errno.ENOSPC, errno.EDQUOT)
                    else None,
                )
            shutil.rmtree(folder, ignore_errors=True)

    def _schedule_expiry(self, key):
        def expire():
            with self.lock:
                if self.job and self.job["id"] == key and self.job["status"] == "ready":
                    self._get(key)
                    if self.job["status"] == "ready":
                        self._schedule_expiry(key)

        self.expiry_timer = threading.Timer(60, expire)
        self.expiry_timer.daemon = True
        self.expiry_timer.start()

    def _get(self, key):
        if not self.job or self.job["id"] != key:
            raise HTTPException(404, "Export not found. Start a new export.")
        if (
            self.job["status"] == "ready"
            and not self.readers
            and time.monotonic() - self.job["updated"] > 1800
        ):
            self.close()
            self.job["status"] = "expired"
        return self.job

    def snapshot(self, key):
        with self.lock:
            job = self._get(key)
            end = time.monotonic() if job["status"] == "running" else job["updated"]
            return {
                **{k: v for k, v in job.items() if k not in ("cancel", "updated", "started")},
                "elapsedSeconds": max(0, int(end - job["started"])),
            }

    def cancel(self, key):
        with self.lock:
            job = self._get(key)
            if job["status"] == "running":
                job["cancel"].set()
            return self.snapshot(key)

    def download(self, key):
        with self.lock:
            job = self._get(key)
            if job["status"] != "ready":
                raise HTTPException(
                    409, "Export is not ready. Start a new export if it has expired."
                )
            self.readers += 1
            job["updated"] = time.monotonic()
            return self.folder / "export.zip"

    def release(self):
        with self.lock:
            self.readers = max(0, self.readers - 1)
