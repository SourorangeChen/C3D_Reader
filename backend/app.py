import json
import os
import secrets
import struct
import threading
from collections import OrderedDict
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import numpy as np
from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .acquisition import Acquisition, clean_json
from .alignment import estimate_lag
from .automatic_sync import AutomaticAlignments
from .batch_export import BatchExports
from .demo import DEMO_REVISION, create_demo

ROOT = Path(__file__).resolve().parents[1]
CONFIG_DIR = Path(os.environ.get("C3D_READER_CONFIG_DIR", Path.home() / ".config" / "c3d-reader"))
CONFIG_DIR.mkdir(parents=True, exist_ok=True)
automatic_alignments = AutomaticAlignments()


@asynccontextmanager
async def lifespan(_app):
    yield
    automatic_alignments.shutdown()


app = FastAPI(title="C3D Reader", version="0.4.1", docs_url=None, redoc_url=None, lifespan=lifespan)
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["localhost", "127.0.0.1", "[::1]", "testserver"],
)
cache = OrderedDict()
cache_lock = threading.RLock()
library = {"root": os.environ.get("C3D_READER_DATA", "")}
if not library["root"]:
    try:
        library["root"] = json.loads((CONFIG_DIR / "settings.json").read_text())["folder"]
    except (OSError, KeyError, ValueError):
        pass
demo_path = CONFIG_DIR / f"synthetic-walking-v{DEMO_REVISION}.c3d"
if not demo_path.exists():
    create_demo(demo_path)
files = {"demo": demo_path}
batch_exports = BatchExports()


@app.middleware("http")
async def local_origin(request: Request, call_next):
    origin = request.headers.get("origin")
    # Protect the local file API from arbitrary websites and DNS rebinding.
    if request.url.path.startswith("/api/") and origin:
        parsed = urlparse(origin)
        if parsed.netloc != request.headers.get("host") or parsed.scheme not in (
            "http",
            "https",
        ):
            return JSONResponse(
                {"detail": "Cross-origin requests are not allowed."}, status_code=403
            )
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    return response


def get_acq(key):
    with cache_lock:
        if key in cache:
            acquisition = cache[key]
            try:
                stat = acquisition.path.stat()
            except OSError as exc:
                cache.pop(key, None)
                raise HTTPException(
                    404, "Source file is unavailable. Check the disk connection."
                ) from exc
            if (stat.st_size, stat.st_mtime_ns, stat.st_ino) != acquisition.fingerprint:
                cache.pop(key, None)
                raise HTTPException(
                    409, "The source file changed. Open it again to refresh the acquisition."
                )
            cache.move_to_end(key)
            return cache[key]
        if key not in files:
            raise HTTPException(404, "File is no longer registered. Refresh the library.")
        try:
            acquisition = Acquisition(files[key])
        except (
            OSError,
            ValueError,
            TypeError,
            AssertionError,
            EOFError,
            IndexError,
            struct.error,
        ) as exc:
            raise HTTPException(422, f"Cannot read C3D: {exc}") from exc
        cache[key] = acquisition
        while len(cache) > 3:
            cache.popitem(last=False)
        return acquisition


def frame_range(acq, start, stop):
    if stop is None:
        stop = acq.count
    if start < 0 or stop > acq.count or stop <= start:
        raise HTTPException(
            400,
            "Frame range must satisfy 0 ≤ start < stop ≤ frameCount (stop is exclusive).",
        )
    return start, stop


def indices_for(acq, kind, ids, maximum=32):
    try:
        indices = list(dict.fromkeys(int(v) for v in ids.split(",")))
    except ValueError as exc:
        raise HTTPException(400, "Channel IDs must be comma-separated integers.") from exc
    total = acq.npoints if kind == "point" else acq.nanalog
    if not indices or len(indices) > maximum or any(i < 0 or i >= total for i in indices):
        raise HTTPException(400, f"Select between 1 and {maximum} valid channels.")
    return indices


class Folder(BaseModel):
    path: str


def require_desktop(token):
    expected = os.environ.get("C3D_READER_DESKTOP_TOKEN", "")
    if not expected or not secrets.compare_digest(token or "", expected):
        raise HTTPException(403, "This operation is available only to the desktop application.")


@app.post("/api/desktop/open")
def desktop_open(file: Folder, x_desktop_token: str = Header(default="")):
    require_desktop(x_desktop_token)
    path = Path(file.path).expanduser().resolve()
    if path.suffix.lower() != ".c3d" or not path.is_file() or path.name.startswith("._"):
        raise HTTPException(400, "请选择有效的 .c3d 文件。")
    with cache_lock:
        key = next((k for k, value in files.items() if value == path), None)
        key = key or secrets.token_hex(8)
        files[key] = path
    # Decode before changing the active folder: an invalid drop must preserve
    # the previous acquisition and library. Large recordings stay on disk.
    acquisition = get_acq(key)
    result = clean_json(dict(id=key, **acquisition.metadata()))
    library["root"] = str(path.parent)
    (CONFIG_DIR / "settings.json").write_text(json.dumps({"folder": str(path.parent)}))
    return dict(acquisition=result, library=list_library())


class AutomaticAlignmentRequest(BaseModel):
    acquisitionId: str
    paths: list[str] = Field(min_length=1, max_length=50000)
    start: int = 0
    stop: Optional[int] = None
    times: Optional[list[float]] = Field(default=None, max_length=50000)
    origin: float = 0
    subjectX: float = Field(default=0.5, ge=0, le=1)


@app.post("/api/desktop/auto-alignment")
def start_automatic_alignment(
    body: AutomaticAlignmentRequest, x_desktop_token: str = Header(default="")
):
    require_desktop(x_desktop_token)
    acquisition = get_acq(body.acquisitionId)
    start, stop = frame_range(acquisition, body.start, body.stop)
    try:
        return automatic_alignments.start(
            acquisition, body.paths, start, stop, body.times, body.origin, body.subjectX
        )
    except (ValueError, OSError) as error:
        raise HTTPException(
            400,
            str(error)
            if isinstance(error, ValueError)
            else "无法读取自动对齐素材，请重新导入本机文件。",
        ) from error


@app.get("/api/auto-alignment/{key}")
def automatic_alignment_status(key: str):
    try:
        return automatic_alignments.get(key).snapshot()
    except KeyError as error:
        raise HTTPException(404, "自动对齐任务已失效，请重试。") from error


@app.delete("/api/auto-alignment/{key}")
def cancel_automatic_alignment(key: str):
    try:
        job = automatic_alignments.get(key)
        job.cancel()
        return job.snapshot()
    except KeyError as error:
        raise HTTPException(404, "自动对齐任务已失效，请重试。") from error


@app.get("/api/library")
def list_library():
    root = Path(library["root"]).expanduser() if library["root"] else None
    listing = []
    if root and root.is_dir():
        try:
            paths = sorted(
                (
                    p
                    for p in root.iterdir()
                    if p.suffix.lower() == ".c3d" and not p.name.startswith(".") and p.is_file()
                ),
                key=lambda p: p.name.lower(),
            )
            with cache_lock:
                for path in paths:
                    # Opaque, stable within this process; paths never enter a URL.
                    key = next(
                        (k for k, p in files.items() if p == path), None
                    ) or secrets.token_hex(8)
                    files[key] = path
                    listing.append(dict(id=key, name=path.name, size=path.stat().st_size))
        except OSError as exc:
            raise HTTPException(400, f"Cannot list folder: {exc}") from exc
    return dict(
        folder=str(root) if root else "",
        available=bool(root and root.is_dir()),
        files=listing,
        demo=dict(id="demo", name="Synthetic walking", size=demo_path.stat().st_size),
    )


@app.post("/api/library")
def set_library(folder: Folder):
    root = Path(folder.path).expanduser().resolve()
    if not root.is_dir():
        raise HTTPException(400, "This folder does not exist or is not mounted.")
    # Validate access before persisting the selected folder.
    try:
        next(root.iterdir(), None)
    except OSError as exc:
        raise HTTPException(400, f"Cannot access folder: {exc}") from exc
    library["root"] = str(root)
    (CONFIG_DIR / "settings.json").write_text(json.dumps({"folder": str(root)}))
    return list_library()


@app.get("/api/files/{key}")
def metadata(key: str):
    return clean_json(dict(id=key, **get_acq(key).metadata()))


@app.get("/api/library/exports")
def current_folder_export():
    return batch_exports.current()


@app.post("/api/library/exports")
def start_folder_export():
    # Snapshot the current directory; changing the library cannot redirect a job.
    listing = list_library()
    with cache_lock:
        sources = [files[item["id"]] for item in listing["files"]]
    return batch_exports.start(sources)


@app.get("/api/library/exports/{key}")
def folder_export_status(key: str):
    return batch_exports.snapshot(key)


@app.delete("/api/library/exports/{key}")
def cancel_folder_export(key: str):
    return batch_exports.cancel(key)


@app.get("/api/library/exports/{key}/download")
def download_folder_export(key: str):
    return BatchDownloadResponse(
        batch_exports.download(key),
        media_type="application/zip",
        filename="c3d-folder-csv.zip",
    )


class BatchDownloadResponse(FileResponse):
    async def __call__(self, scope, receive, send):
        # FileResponse skips background callbacks on invalid Range requests and
        # interrupted sends. A lease must be released on every response path.
        try:
            await super().__call__(scope, receive, send)
        finally:
            batch_exports.release()


@app.get("/api/files/{key}/frames")
def frames(key: str, start: int = 0, count: int = Query(500, ge=1, le=1200)):
    acq = get_acq(key)
    start, stop = frame_range(acq, start, min(acq.count, start + count))
    xyz, _ = acq.points(start, stop)
    return Response(
        xyz.astype("<f4", copy=False).tobytes(),
        media_type="application/octet-stream",
        headers={
            "X-Frame-Start": str(start),
            "X-Frame-Count": str(stop - start),
            "X-Point-Count": str(acq.npoints),
        },
    )


@app.get("/api/files/{key}/frame/{index}")
def frame(key: str, index: int):
    acq = get_acq(key)
    frame_range(acq, index, index + 1)
    xyz, residual = acq.points(index, index + 1)
    return clean_json(dict(frame=index + acq.first, points=xyz[0], residuals=residual[0]))


@app.get("/api/files/{key}/series")
def series(
    key: str,
    kind: str = Query("point", pattern="^(point|analog)$"),
    ids: str = "0",
    start: int = 0,
    stop: int = None,
    limit: int = Query(1000, ge=50, le=10000),
):
    acq = get_acq(key)
    start, stop = frame_range(acq, start, stop)
    indices = indices_for(acq, kind, ids, 8)
    result = []
    for i in indices:
        if kind == "point":
            # Only copy one point's series, even for a multi-minute trial.
            raw = acq.data["points"][start:stop, i]
            values = raw[:, :3].astype(float)
            if acq.scale >= 0:
                values *= acq.scale
            values[(raw[:, 3] < 0) | ~np.isfinite(raw).all(axis=-1)] = np.nan
            names, unit, rate, offset = ["X", "Y", "Z"], acq.units[i], acq.rate, start
        else:
            values = acq.analog(i, start, stop)[:, None]
            names, unit, rate, offset = (
                [acq.analog_labels[i]],
                acq.analog_units[i],
                acq.analog_rate,
                start * acq.samples,
            )
        for axis, name in enumerate(names):
            v = values[:, axis]
            # Extrema per time bin preserve narrow EMG/force spikes. Keep one
            # missing sample in each bin so gaps are never connected by a line.
            if len(v) > limit:
                step = max(1, int(np.ceil(len(v) / max(1, limit // 3))))
                picks = {0, len(v) - 1}
                for lo in range(0, len(v), step):
                    chunk = v[lo : lo + step]
                    finite = np.isfinite(chunk)
                    if finite.any():
                        candidates = np.flatnonzero(finite)
                        picks.add(lo + int(candidates[np.argmin(chunk[finite])]))
                        picks.add(lo + int(candidates[np.argmax(chunk[finite])]))
                    if not finite.all():
                        picks.add(lo + int(np.flatnonzero(~finite)[0]))
                selected = np.array(sorted(picks))
            else:
                selected = np.arange(len(v))
            result.append(
                dict(
                    name=name,
                    label=acq.point_labels[i] if kind == "point" else name,
                    unit=unit,
                    times=(selected + offset) / rate,
                    values=v[selected],
                )
            )
    last_time = (
        (stop * acq.samples - 1) / acq.analog_rate if kind == "analog" else (stop - 1) / acq.rate
    )
    return clean_json(
        dict(
            series=result,
            start=start / acq.rate,
            stop=last_time,
            method="min-max envelope",
            sampleRate=acq.rate if kind == "point" else acq.analog_rate,
        )
    )


@app.get("/api/files/{key}/parameters")
def parameters(key: str):
    return get_acq(key).parameters()


class AlignmentRequest(BaseModel):
    times: list[float] = Field(min_length=8, max_length=200000)
    values: list[Optional[float]] = Field(min_length=8, max_length=200000)
    kind: str = Field(default="point", pattern="^(point|analog)$")
    channel: int = Field(ge=0)
    axis: int = Field(default=2, ge=0, le=2)
    direction: int = Field(default=1, ge=-1, le=1)
    start: int = 0
    stop: Optional[int] = None
    baseline: float = 0
    low: float = -2
    high: float = 2
    step: float = 0.01
    maxGap: float = 0.08


@app.post("/api/files/{key}/alignment")
def align_signals(key: str, body: AlignmentRequest):
    acq = get_acq(key)
    start, stop = frame_range(acq, body.start, body.stop)
    indices_for(acq, body.kind, str(body.channel))
    if body.direction not in (-1, 1):
        raise HTTPException(400, "Signal direction must be +1 or -1.")
    if (stop - start) * (acq.samples if body.kind == "analog" else 1) > 200000:
        raise HTTPException(
            400, "The alignment interval is too large. Select a shorter frame range."
        )
    if body.kind == "point":
        raw = acq.data["points"][start:stop, body.channel]
        values = raw[:, body.axis].astype(float)
        if acq.scale >= 0:
            values *= acq.scale
        values[(raw[:, 3] < 0) | ~np.isfinite(raw).all(axis=-1)] = np.nan
        times = np.arange(start, stop) / acq.rate
    else:
        values = acq.analog(body.channel, start, stop)
        times = np.arange(start * acq.samples, stop * acq.samples) / acq.analog_rate
    try:
        result = estimate_lag(
            times,
            values * body.direction,
            body.times,
            body.values,
            baseline=body.baseline,
            low=body.low,
            high=body.high,
            step=body.step,
            max_gap=body.maxGap,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return dict(
        **result,
        reference=dict(
            kind=body.kind,
            channel=body.channel,
            axis=body.axis,
            direction=body.direction,
            start=start,
            stop=stop,
        ),
        convention="video_pts_s = baseline + lag + c3d_relative_time_s",
    )


@app.get("/api/files/{key}/export")
def export(
    key: str,
    kind: str = Query("point", pattern="^(point|analog)$"),
    ids: str = "0",
    start: int = 0,
    stop: int = None,
    scope: str = Query("selected", pattern="^(selected|all|com)$"),
):
    acq = get_acq(key)
    start, stop = frame_range(acq, start, stop)
    if scope == "all":
        indices = list(range(acq.npoints if kind == "point" else acq.nanalog))
        filename = "c3d-all-points.csv" if kind == "point" else "c3d-all-analog.csv"
    elif scope == "com":
        if kind != "point":
            raise HTTPException(400, "COM export requires point data.")
        indices = [i for i, role in enumerate(acq.point_roles) if role]
        filename = "c3d-com.csv"
    else:
        indices = indices_for(acq, kind, ids)
        filename = f"c3d-{kind}-export.csv"
    if not indices:
        raise HTTPException(400, "No matching source channels are available for this export.")
    return StreamingResponse(
        acq.csv_rows(kind, indices, start, stop),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "0.4.1"}


dist = ROOT / "frontend" / "dist"
if dist.is_dir():
    app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")


@app.get("/")
def index():
    if (dist / "index.html").exists():
        return FileResponse(dist / "index.html")
    return JSONResponse(
        {"detail": "Build the frontend with npm run build, or run python run.py."},
        status_code=503,
    )
