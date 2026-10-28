"""Automatic viewer synchronization from observed image joints and C3D motion.

Uses COM's normalized joint-camera fit and constant time-translation approach.
Apple Vision observations are separate from COM/PCT clinical analysis outputs.
No time warping, hardcoded trial offsets or nominal-video-FPS substitutions.
"""

import math

import numpy as np

JOINTS = [
    "leftShoulder",
    "rightShoulder",
    "leftElbow",
    "rightElbow",
    "leftWrist",
    "rightWrist",
    "leftHip",
    "rightHip",
    "leftKnee",
    "rightKnee",
    "leftAnkle",
    "rightAnkle",
]
# Plug-in Gait anatomical centers, matching COM/export_alignment_vicon.py.
MODEL_LABELS = [
    "LHUP",
    "RHUP",
    "LHUO",
    "RHUO",
    "LRAO",
    "RRAO",
    "LFEP",
    "RFEP",
    "LFEO",
    "RFEO",
    "LTIO",
    "RTIO",
]
MARKER_LABELS = [
    ["LSHO"],
    ["RSHO"],
    ["LELB"],
    ["RELB"],
    ["LWRA", "LWRB"],
    ["RWRA", "RWRB"],
    ["LASI", "LPSI"],
    ["RASI", "RPSI"],
    ["LKNE"],
    ["RKNE"],
    ["LANK"],
    ["RANK"],
]
FIT = np.array([0, 1, 6, 7, 8, 9, 10, 11])


def interpolate_pose(query, times, points, max_gap):
    """Adjacent-sample interpolation; never bridge absent points or long gaps."""
    query, times, points = map(np.asarray, (query, times, points))
    right = np.searchsorted(times, query)
    hi = np.clip(right, 0, len(times) - 1)
    lo = np.clip(right - 1, 0, len(times) - 1)
    exact = np.abs(times[hi] - query) < 1e-8
    weight = (query - times[lo]) / np.maximum(times[hi] - times[lo], 1e-12)
    result = points[lo] + weight.reshape((-1,) + (1,) * (points.ndim - 1)) * (
        points[hi] - points[lo]
    )
    result[
        (query < times[0] - 1e-8) | (query > times[-1] + 1e-8) | (times[hi] - times[lo] > max_gap)
    ] = np.nan
    result[exact] = points[hi[exact]]
    return result


def read_reference(acquisition, start, stop):
    duration = (stop - start - 1) / acquisition.rate
    if duration < 2 or duration > 60:
        raise ValueError("自动对齐需要 2–60 秒的观察区间，请先调整区间。")
    labels = {}
    for i, name in enumerate(acquisition.point_labels):
        if acquisition.kinds[i] != "marker":
            continue
        key = name.rsplit(":", 1)[-1].strip().upper()
        labels.setdefault(key, []).append(i)
    wanted = set(MODEL_LABELS + sum(MARKER_LABELS, []))
    if any(len(labels.get(name, [])) > 1 for name in wanted):
        raise ValueError("存在多个受试者的同名关节，自动对齐无法确定目标人物。")
    use_model = all(name in labels for name in MODEL_LABELS)
    groups = [[label] for label in MODEL_LABELS] if use_model else MARKER_LABELS
    if any(any(name not in labels for name in groups[j]) for j in FIT):
        raise ValueError("缺少肩、髋、膝或踝的对应通道，无法自动匹配动作。")
    units = acquisition.point_unit.strip().lower()
    factor = {"mm": 0.001, "cm": 0.01, "m": 1}.get(units)
    if factor is None:
        raise ValueError("自动对齐需要以 mm、cm 或 m 表示的空间通道。")
    # Read only source rows around the sampling grid, including their residuals.
    frame = np.linspace(
        start + acquisition.rate * 0.1,
        stop - 1 - acquisition.rate * 0.1,
        min(600, max(20, int((duration - 0.2) * 10) + 1)),
    )
    lo, hi = np.floor(frame).astype(int), np.ceil(frame).astype(int)
    weight = (frame - lo)[:, None, None]
    raw_lo = acquisition.data["points"][lo].astype(float)
    raw_hi = acquisition.data["points"][hi].astype(float)
    raw_lo[raw_lo[..., 3] < 0] = np.nan
    raw_hi[raw_hi[..., 3] < 0] = np.nan
    raw = raw_lo[..., :3] + weight * (raw_hi[..., :3] - raw_lo[..., :3])
    raw *= factor * (acquisition.scale if acquisition.scale >= 0 else 1)
    xyz = np.full((len(frame), 12, 3), np.nan)
    for j, names in enumerate(groups):
        if all(name in labels for name in names):
            xyz[:, j] = np.mean(raw[:, [labels[name][0] for name in names]], axis=1)
    if np.isfinite(xyz[:, FIT]).all(axis=-1).mean() < 0.95:
        raise ValueError("Vicon 有效关节覆盖不足，请选择完整的动作区间。")
    return {
        "times": frame / acquisition.rate,
        "xyz": xyz,
        "landmarks": "Plug-in Gait joint centers" if use_model else "skin marker proxies",
        "labels": groups,
        "firstFrame": acquisition.first + start,
        "lastFrame": acquisition.first + stop - 1,
    }


def observations(rows, aspect=1):
    times = np.array([row["time"] for row in rows], dtype=float)
    points = np.array(
        [row["points"] if row["points"] is not None else np.full((12, 3), np.nan) for row in rows],
        dtype=float,
    )
    if (
        len(times) < 8
        or points.shape != (len(times), 12, 3)
        or not np.isfinite(times).all()
        or np.any(np.diff(times) <= 0)
    ):
        raise ValueError("素材缺少可用的动作采样或时间戳。")
    # Confidence is a detector score, not a calibrated accuracy probability.
    bad = (points[..., 2] < 0.2) | (points[..., :2] < 0).any(-1) | (points[..., :2] > 1).any(-1)
    points[bad] = np.nan
    points[..., 0] *= aspect
    return times, points


def fit_camera(xyz, uv, weights):
    good = np.isfinite(xyz).all(1) & np.isfinite(uv).all(1) & np.isfinite(weights) & (weights > 0)
    x, y, w = xyz[good], uv[good], weights[good]
    if len(x) < 30:
        raise ValueError("Insufficient correspondences")
    cx, sx = x.mean(0), x.std(0).mean()
    cy, sy = y.mean(0), y.std(0).mean()
    if sx < 1e-8 or sy < 1e-8:
        raise ValueError("Degenerate camera")
    xx = np.c_[(x - cx) / sx, np.ones(len(x))]
    yy = (y - cy) / sy
    a = np.zeros((len(x), 2, 12))
    a[:, 0, :4], a[:, 1, 4:8] = xx, xx
    a[:, 0, 8:], a[:, 1, 8:] = -yy[:, :1] * xx, -yy[:, 1:] * xx
    _, _, vt = np.linalg.svd((a * np.sqrt(w[:, None, None])).reshape(-1, 12), full_matrices=False)
    tx = np.eye(4)
    tx[:3, :3] /= sx
    tx[:3, 3] = -cx / sx
    ty = np.array([[sy, 0, cy[0]], [0, sy, cy[1]], [0, 0, 1]])
    camera = ty @ vt[-1].reshape(3, 4) @ tx
    return camera / np.linalg.norm(camera)


def project(xyz, camera):
    # einsum avoids Accelerate's spurious floating flags for tiny matrix products.
    homogeneous = np.c_[xyz.reshape(-1, 3), np.ones(xyz.size // 3)]
    with np.errstate(invalid="ignore", over="ignore", divide="ignore"):
        p = np.einsum("ij,kj->ik", homogeneous, camera)
        denominators = p[np.isfinite(p).all(axis=1), 2]
        if (
            not len(denominators)
            or not ((denominators > 0).all() or (denominators < 0).all())
            or np.min(np.abs(denominators)) < 1e-6 * np.max(np.abs(denominators))
        ):
            raise ValueError("Unstable projective camera")
        return (p[:, :2] / p[:, 2:]).reshape(*xyz.shape[:-1], 2)


def pair_mean(values):
    valid = np.isfinite(values)
    return np.nansum(values, axis=1) / np.maximum(valid.sum(axis=1), 1)


def motion_quality(uv, prediction):
    """Signed temporal checks in a common fitted image plane."""

    def relative(points):
        pelvis = pair_mean(points[:, 6:8])
        shoulders = pair_mean(points[:, :2])
        height = np.linalg.norm(shoulders - pelvis, axis=1)
        valid = np.isfinite(points[:, [0, 1, 6, 7]]).all(axis=(1, 2)) & (height > 0.03)
        result = (points[:, 8:12] - pelvis[:, None]) / np.maximum(height[:, None, None], 0.03)
        result[~valid] = np.nan
        return result

    a, b = relative(uv), relative(prediction)
    scores, motion = [], []
    for joint in range(4):
        for axis in range(2):
            x, y = a[:, joint, axis], b[:, joint, axis]
            good = np.isfinite(x) & np.isfinite(y)
            if good.sum() < 12:
                continue
            motion.append(float(np.std(x[good])))
            if np.std(x[good]) >= 0.015 and np.std(y[good]) >= 0.015:
                scores.append(float(np.corrcoef(x[good], y[good])[0, 1]))
    return (float(np.median(scores)) if len(scores) >= 2 else None, float(max(motion, default=0)))


def evaluate_offset(reference, video_times, video_points, offset, max_gap, diagnostics=False):
    observed = interpolate_pose(reference["times"] + offset, video_times, video_points, max_gap)
    uv, confidence = observed[..., :2], observed[..., 2]
    height = np.linalg.norm(pair_mean(uv[:, :2]) - pair_mean(uv[:, 6:8]), axis=1)
    weights = np.maximum(confidence[:, FIT] - 0.1, 0) ** 2 / np.maximum(height[:, None], 0.05) ** 2
    coverage = float(np.isfinite(weights).mean())
    result = {"offset": float(offset), "error": None, "coverage": coverage}
    if coverage < 0.9 or (height > 0.03).mean() < 0.95:
        return result
    xyz = reference["xyz"]
    try:
        camera = fit_camera(xyz[:, FIT].reshape(-1, 3), uv[:, FIT].reshape(-1, 2), weights.ravel())
        prediction = project(xyz, camera)
    except (ValueError, np.linalg.LinAlgError):
        return result
    error = np.linalg.norm(prediction[:, FIT] - uv[:, FIT], axis=-1) / np.maximum(
        height[:, None], 0.05
    )
    result["error"] = float(np.sqrt(np.nanmean(np.minimum(error, 1) ** 2)))
    if diagnostics:
        correlation, motion = motion_quality(uv, prediction)
        holdout = np.linalg.norm(prediction[:, 2:6] - uv[:, 2:6], axis=-1) / np.maximum(
            height[:, None], 0.05
        )
        result.update(
            camera=camera.tolist(),
            correlation=correlation,
            motion=motion,
            holdoutError=float(np.nanmedian(holdout)) if np.isfinite(holdout).any() else None,
        )
    return result


def search(
    reference,
    video_times,
    video_points,
    low,
    high,
    step=0.2,
    max_gap=0.35,
    cancelled=lambda: False,
    progress=lambda value: None,
):
    if (
        not all(math.isfinite(v) for v in [low, high, step])
        or high < low
        or step <= 0
        or (high - low) / step > 20000
    ):
        raise ValueError("自动搜索范围过大，请缩小素材范围。")
    offsets = np.linspace(low, high, max(2, math.ceil((high - low) / step) + 1))
    curve = []
    for i, offset in enumerate(offsets):
        if cancelled():
            raise InterruptedError()
        curve.append(evaluate_offset(reference, video_times, video_points, offset, max_gap))
        if i % 50 == 0:
            progress((i + 1) / len(offsets))
    return curve


def candidates(curve, limit=8, separation=0.5):
    good = sorted((row for row in curve if row["error"] is not None), key=lambda row: row["error"])
    result = []
    for row in good:
        if all(abs(row["offset"] - selected["offset"]) >= separation for selected in result):
            result.append(row)
            if len(result) >= limit:
                break
    return result


def finish(reference, video_times, video_points, curve, low, high, max_gap=0.12):
    peaks = candidates(curve, limit=5)
    if not peaks:
        return {
            "status": "rejected",
            "reason": "no_motion_coverage",
            "candidates": [],
            "curve": curve,
        }
    best = evaluate_offset(reference, video_times, video_points, peaks[0]["offset"], max_gap, True)
    second = peaks[1]["error"] if len(peaks) > 1 else None
    margin = (second - best["error"]) / max(second, 1e-8) if second is not None else None
    reason = "motion_match_found"
    if best["offset"] <= low + 0.02 or best["offset"] >= high - 0.02:
        reason = "motion_search_boundary"
    elif (
        best["error"] > 0.2
        or best["correlation"] is None
        or best["correlation"] < 0.5
        or best["motion"] < 0.03
    ):
        reason = "motion_match_weak"
    elif margin is not None and margin < 0.1:
        reason = "motion_match_ambiguous"
    return {
        "status": "accepted" if reason == "motion_match_found" else "rejected",
        "reason": reason,
        **best,
        "peakMargin": margin,
        "candidates": peaks,
        "curve": curve,
        "landmarks": reference["landmarks"],
        "frameRange": [reference["firstFrame"], reference["lastFrame"]],
        "model": "Apple Vision body pose revision 1",
        "visualReview": "pending",
        "convention": "video_pts_s = combined_offset_s + c3d_relative_time_s",
    }
