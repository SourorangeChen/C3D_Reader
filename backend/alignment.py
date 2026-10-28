"""Bounded, signed signal alignment, following COM's validation_signals contract.

Inputs must be independently prepared, comparable signals. This module does not
extract pose from video or establish independent synchronization accuracy.
"""

import math

import numpy as np


def interpolate(query, times, values, max_gap):
    """Interpolate only between adjacent valid samples, never over missing data."""
    right = np.searchsorted(times, query)
    out = np.full(len(query), np.nan)
    exact = (right < len(times)) & (times[np.minimum(right, len(times) - 1)] == query)
    out[exact] = values[right[exact]]
    interior = (~exact) & (right > 0) & (right < len(times))
    indices = np.flatnonzero(interior)
    hi = right[indices]
    lo = hi - 1
    valid = (times[hi] - times[lo] <= max_gap) & np.isfinite(values[lo]) & np.isfinite(values[hi])
    indices, lo, hi = indices[valid], lo[valid], hi[valid]
    weight = (query[indices] - times[lo]) / (times[hi] - times[lo])
    out[indices] = values[lo] + weight * (values[hi] - values[lo])
    return out


def estimate_lag(
    reference_times,
    reference,
    video_times,
    video_values,
    *,
    baseline=0,
    low=-2,
    high=2,
    step=0.01,
    max_gap=0.08,
    min_coverage=0.95,
    min_correlation=0.5,
    peak_separation=0.25,
    min_peak_margin=0.02,
):
    """Return a candidate and quality diagnostics; never silently apply a lag."""
    settings = [
        baseline,
        low,
        high,
        step,
        max_gap,
        min_coverage,
        min_correlation,
        peak_separation,
        min_peak_margin,
    ]
    if not all(math.isfinite(v) for v in settings):
        raise ValueError("Alignment settings must be finite.")
    if not low < high or step <= 0 or max_gap <= 0 or peak_separation <= 0:
        raise ValueError("Use increasing search bounds and positive step/gap limits.")
    if not 0 < min_coverage <= 1 or not 0 <= min_correlation <= 1 or min_peak_margin < 0:
        raise ValueError("Invalid alignment quality thresholds.")
    times = np.asarray(video_times, dtype=float)
    values = np.asarray(video_values, dtype=float)
    target = np.asarray(reference, dtype=float)
    queries = np.asarray(reference_times, dtype=float) + baseline
    if (
        times.ndim != 1
        or values.shape != times.shape
        or len(times) < 8
        or not np.isfinite(times).all()
        or not np.all(np.diff(times) > 0)
    ):
        raise ValueError(
            "Video times must be finite, strictly increasing, with at least 8 samples."
        )
    if target.shape != queries.shape or len(target) < 8 or not np.isfinite(queries).all():
        raise ValueError("The selected Vicon interval needs at least 8 samples.")
    requested_steps = (high - low) / step
    if not math.isfinite(requested_steps) or requested_steps > 10000:
        raise ValueError("Search is too large. Narrow the frame range/search or increase the step.")
    steps = math.ceil(requested_steps - 1e-9)
    if not 2 <= steps <= 10000 or (steps + 1) * len(target) > 20_000_000:
        raise ValueError("Search is too large. Narrow the frame range/search or increase the step.")
    offsets = np.linspace(low, high, steps + 1)
    scores, coverages = [], []
    for lag in offsets:
        observed = interpolate(queries + lag, times, values, max_gap)
        valid = np.isfinite(observed) & np.isfinite(target)
        coverage = float(valid.mean())
        correlation = np.nan
        if coverage >= min_coverage and valid.sum() >= 8:
            a, b = observed[valid], target[valid]
            if np.std(a) > 1e-10 and np.std(b) > 1e-10:
                correlation = float(np.clip(np.corrcoef(a, b)[0, 1], -1, 1))
        scores.append(correlation)
        coverages.append(coverage)
    finite = np.isfinite(scores)
    result = dict(
        status="rejected",
        reason="no_usable_signal_or_coverage",
        lag=None,
        correlation=None,
        coverage=0,
        peakMargin=None,
        competingPeaks=[],
        step=float(offsets[1] - offsets[0]),
        curve=[
            dict(lag=float(t), correlation=float(r) if np.isfinite(r) else None, coverage=c)
            for t, r, c in zip(offsets, scores, coverages)
        ],
    )
    if not finite.any():
        return result
    scores = np.where(finite, scores, -np.inf)
    best = int(np.argmax(scores))
    peaks = [
        i
        for i in range(len(scores))
        if finite[i]
        # Keep both search endpoints as possible truncated competing peaks,
        # matching COM even when the endpoint is not itself a local maximum.
        and (
            i in (0, len(scores) - 1) or (scores[i] >= scores[i - 1] and scores[i] >= scores[i + 1])
        )
    ]
    competitors = [i for i in peaks if abs(offsets[i] - offsets[best]) >= peak_separation]
    second = max((scores[i] for i in competitors), default=-np.inf)
    margin = float(scores[best] - second)
    result.update(
        lag=float(offsets[best]),
        correlation=float(scores[best]),
        coverage=coverages[best],
        peakMargin=margin if np.isfinite(margin) else None,
        competingPeaks=[
            dict(lag=float(offsets[i]), correlation=float(scores[i]))
            for i in sorted(competitors, key=lambda i: -scores[i])[:5]
        ],
    )
    if best in (0, len(scores) - 1) or not (finite[best - 1] and finite[best + 1]):
        result["reason"] = "search_or_coverage_boundary"
    elif scores[best] < min_correlation:
        result["reason"] = "low_correlation"
    elif margin < min_peak_margin:
        result["reason"] = "ambiguous_competing_peak"
    else:
        result.update(status="accepted", reason="preset_signal_quality_passed")
    return result
