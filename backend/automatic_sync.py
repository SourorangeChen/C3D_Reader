"""Cancellable local media-to-C3D matching jobs for the macOS desktop viewer."""

import json
import math
import secrets
import subprocess
import sys
import threading
import time
from pathlib import Path

import numpy as np

from .motion_alignment import candidates, finish, observations, read_reference, search


def worker_path():
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS) / "native" / "c3d-pose-worker"
    return Path(__file__).resolve().parents[1] / "build/pose-worker/c3d-pose-worker"


def fingerprint(path):
    stat = path.stat()
    return stat.st_size, stat.st_mtime_ns, stat.st_ino


def merge_windows(windows):
    merged = []
    for start, end in sorted(windows):
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(end, merged[-1][1])
        else:
            merged.append([start, end])
    return merged


class AutomaticAlignment:
    def __init__(self, acquisition, paths, start, stop, image_times=None, origin=0, subject_x=0.5):
        if not worker_path().is_file() or sys.platform != "darwin":
            raise ValueError("自动对齐组件不可用，请使用包含动作识别组件的 macOS 桌面版。")
        self.reference = read_reference(acquisition, start, stop)
        self.paths = [Path(path).expanduser().resolve() for path in paths]
        video = len(paths) == 1 and self.paths[0].suffix.lower() in {
            ".mp4",
            ".m4v",
            ".mov",
            ".webm",
            ".ogv",
        }
        if (
            not self.paths
            or len(self.paths) > 50000
            or any(not p.is_file() or p.name.startswith("._") for p in self.paths)
        ):
            raise ValueError("无法读取自动对齐素材，请重新导入本机文件。")
        if not math.isfinite(origin) or not math.isfinite(subject_x) or not 0 <= subject_x <= 1:
            raise ValueError("无效的自动对齐参数。")
        if video:
            self.input = {"kind": "video", "path": str(self.paths[0])}
        else:
            times = np.asarray(image_times, dtype=float)
            if (
                any(
                    p.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
                    for p in self.paths
                )
                or times.shape != (len(paths),)
                or len(times) < 8
                or not np.isfinite(times).all()
                or np.any(np.diff(times) <= 0)
            ):
                raise ValueError("自动对齐需要至少 8 张带有效 FPS 或 PTS 的连续动作图片。")
            self.input = {
                "kind": "images",
                "paths": [str(p) for p in self.paths],
                "times": times.tolist(),
            }
        self.input["subjectX"] = subject_x
        self.origin = origin if video else 0
        # Adapt to sparse image sequences without bridging larger timestamp gaps.
        self.fine_gap = max(0.12, float(np.median(np.diff(times))) * 1.5) if not video else 0.12
        self.fine_gap = min(self.fine_gap, 0.5)
        self.acquisition_path = acquisition.path
        self.sources = [(p, fingerprint(p)) for p in [acquisition.path, *self.paths]]
        self.id = secrets.token_hex(16)
        self.lock = threading.RLock()
        self.cancelled = threading.Event()
        self.process = None
        self.started = time.monotonic()
        self.data = {
            "id": self.id,
            "status": "running",
            "phase": "extracting",
            "progress": 0,
            "frames": 0,
            "result": None,
            "error": None,
        }

    def snapshot(self):
        with self.lock:
            return {**self.data, "elapsed": round(time.monotonic() - self.started, 1)}

    def update(self, **values):
        with self.lock:
            self.data.update(values)

    def cancel(self):
        self.cancelled.set()
        with self.lock:
            if self.process and self.process.poll() is None:
                self.process.terminate()

    def extract(self, settings, begin, span):
        if self.cancelled.is_set():
            raise InterruptedError()
        process = subprocess.Popen(
            [str(worker_path())],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
        )
        with self.lock:
            self.process = process
        rows, metadata = [], {}
        try:
            process.stdin.write(json.dumps({**self.input, **settings}))
            process.stdin.close()
            for line in process.stdout:
                if self.cancelled.is_set():
                    raise InterruptedError()
                item = json.loads(line)
                if item["type"] == "meta":
                    metadata = item
                    if not math.isfinite(item["duration"]) or item["duration"] > 3600:
                        raise ValueError("自动对齐目前支持一小时以内的素材，请先选取相关片段。")
                elif item["type"] == "error":
                    raise ValueError(
                        "无法识别此素材中的动作，请检查格式、人物可见性或选择另一视角。"
                    )
                elif item["type"] == "frame":
                    item["time"] += self.origin
                    rows.append(item)
                    lo = settings.get("start", self.input.get("times", [0])[0])
                    hi = settings.get(
                        "end", self.input.get("times", [metadata.get("duration", 1)])[-1]
                    )
                    fraction = min(1, max(0, (item["time"] - self.origin - lo) / max(hi - lo, 1)))
                    self.update(frames=len(rows), progress=round(begin + span * fraction, 1))
                    if len(rows) > 30000:
                        raise ValueError("动作采样过多，请缩短素材范围。")
            process.wait(timeout=10)
            if self.cancelled.is_set():
                raise InterruptedError()
            if process.returncode != 0:
                raise ValueError("动作识别组件未正常完成，请检查素材并重试。")
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
            with self.lock:
                self.process = None
        return rows, metadata

    def run(self):
        try:
            rows, meta = self.extract({"rate": 6}, 0, 55)
            aspect = meta.get("width", 1) / meta.get("height", 1)
            times, points = observations(rows, aspect)
            ref = self.reference
            low = times[0] - ref["times"][0]
            high = times[-1] - ref["times"][-1]
            if high < low:
                raise ValueError("素材短于所选 Vicon 动作区间，请缩小观察区间。")
            self.update(phase="matching", progress=55)
            curve = search(
                ref,
                times,
                points,
                low,
                high,
                cancelled=self.cancelled.is_set,
                progress=lambda fraction: self.update(progress=round(55 + 10 * fraction, 1)),
            )
            peaks = candidates(curve)
            if not peaks:
                self.update(
                    status="complete",
                    phase="complete",
                    progress=100,
                    result={
                        "status": "rejected",
                        "reason": "no_motion_coverage",
                        "candidates": [],
                        "curve": curve,
                    },
                )
                return
            dense, fine_curve = [], []
            windows = merge_windows(
                [
                    [
                        max(times[0], peak["offset"] + ref["times"][0] - 0.35),
                        min(times[-1], peak["offset"] + ref["times"][-1] + 0.35),
                    ]
                    for peak in peaks
                ]
            )
            self.update(phase="refining", progress=65)
            for i, (start, end) in enumerate(windows):
                sampled, _ = self.extract(
                    {"rate": 30, "start": start - self.origin, "end": end - self.origin},
                    65 + 25 * i / len(windows),
                    25 / len(windows),
                )
                dense.extend(sampled)
            dense = sorted(
                {round(row["time"], 8): row for row in dense}.values(), key=lambda row: row["time"]
            )
            times, points = observations(dense, aspect)
            self.update(phase="matching", progress=92)
            for peak in peaks:
                fine_curve.extend(
                    search(
                        ref,
                        times,
                        points,
                        max(low, peak["offset"] - 0.25),
                        min(high, peak["offset"] + 0.25),
                        step=0.01,
                        max_gap=self.fine_gap,
                        cancelled=self.cancelled.is_set,
                    )
                )
            fine_curve.sort(key=lambda row: row["offset"])
            result = finish(ref, times, points, fine_curve, low, high, max_gap=self.fine_gap)
            if self.cancelled.is_set():
                raise InterruptedError()
            if any(fingerprint(path) != before for path, before in self.sources):
                raise ValueError("对齐过程中源文件发生变化，请重新打开素材。")
            result.update(
                sourceName=self.paths[0].name
                if len(self.paths) == 1
                else f"{len(self.paths)} images",
                subjectX=self.input["subjectX"],
                samples=len(rows) + len(dense),
                coarseCurve=curve,
            )
            self.update(status="complete", phase="complete", progress=100, result=result)
        except InterruptedError:
            self.update(status="cancelled", phase="cancelled")
        except (ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError) as error:
            self.update(
                status="failed",
                phase="failed",
                error=str(error)
                if isinstance(error, ValueError)
                else "自动对齐失败，请检查源文件或重新导入。",
            )


class AutomaticAlignments:
    def __init__(self):
        self.lock = threading.RLock()
        self.jobs = {}

    def start(self, acquisition, paths, start, stop, image_times=None, origin=0, subject_x=0.5):
        job = AutomaticAlignment(acquisition, paths, start, stop, image_times, origin, subject_x)
        with self.lock:
            for previous in self.jobs.values():
                if previous.snapshot()["status"] == "running":
                    previous.cancel()
            self.jobs[job.id] = job
            if len(self.jobs) > 8:
                self.jobs.pop(next(iter(self.jobs)))
        threading.Thread(target=job.run, daemon=True, name="media-alignment").start()
        return job.snapshot()

    def get(self, key):
        with self.lock:
            if key not in self.jobs:
                raise KeyError(key)
            return self.jobs[key]

    def shutdown(self):
        with self.lock:
            for job in self.jobs.values():
                job.cancel()
