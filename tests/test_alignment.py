import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.alignment import estimate_lag, interpolate
from backend.app import app, get_acq


def motion(t):
    return np.sin(2.1 * t + 0.7 * t**2) + 0.6 * np.exp(-(((t - 2.2) / 0.23) ** 2))


def signals():
    reference_time = np.arange(0.2, 4, 0.01)
    video_time = np.arange(0, 8, 0.01)
    return reference_time, motion(reference_time), video_time, motion(video_time - 2.35)


def test_positive_lag_selects_later_video_with_timestamp_baseline():
    result = estimate_lag(*signals(), baseline=1.7, low=0.2, high=1.1)
    assert result["status"] == "accepted"
    assert result["lag"] == pytest.approx(0.65)
    assert result["correlation"] > 0.999
    assert result["coverage"] == 1


def test_interpolation_preserves_exact_samples_and_missing_windows():
    times = np.array([0.0, 0.1, 0.2, 1.0, 1.1])
    values = np.array([1.0, 2.0, np.nan, 4.0, 5.0])
    result = interpolate(
        np.array([-0.1, 0, 0.05, 0.1, 0.15, 0.2, 0.5, 1, 1.05, 1.2]), times, values, 0.11
    )
    np.testing.assert_allclose(
        result, [np.nan, 1, 1.5, 2, np.nan, np.nan, np.nan, 4, 4.5, np.nan], equal_nan=True
    )


def test_boundary_and_stationary_signals_are_not_accepted():
    result = estimate_lag(*signals(), baseline=1.7, low=0.65, high=1.1)
    assert result["reason"] == "search_or_coverage_boundary"
    t, target, vt, values = signals()
    result = estimate_lag(t, np.ones(len(target)), vt, values)
    assert result["reason"] == "no_usable_signal_or_coverage"


def test_coverage_and_missing_values_are_not_filled_to_improve_score():
    t, target, vt, values = signals()
    values[(vt > 3) & (vt < 4)] = np.nan
    result = estimate_lag(t, target, vt, values, baseline=1.7, low=0.5, high=0.8)
    assert result["status"] == "rejected"
    assert result["lag"] is None


def test_repeated_gait_competing_peaks_are_rejected():
    t = np.arange(1, 5, 0.01)
    vt = np.arange(0, 7, 0.01)
    result = estimate_lag(t, np.cos(2 * np.pi * t), vt, np.cos(2 * np.pi * vt), low=-1.2, high=1.2)
    assert result["status"] == "rejected"
    assert result["reason"] == "ambiguous_competing_peak"
    assert result["competingPeaks"]


def test_signed_correlation_does_not_accept_opposite_motion():
    t, target, vt, values = signals()
    result = estimate_lag(t, -target, vt, values, baseline=1.7, low=0.64, high=0.66, step=0.001)
    assert result["status"] == "rejected"
    assert all(row["correlation"] < -0.99 for row in result["curve"])


@pytest.mark.parametrize("change", ["duplicate", "nan", "short", "mismatch", "large", "overflow"])
def test_invalid_or_unbounded_alignment_requests_fail(change):
    t, target, vt, values = signals()
    kwargs = {}
    if change == "duplicate":
        vt[2] = vt[1]
    elif change == "nan":
        vt[2] = np.nan
    elif change == "short":
        vt, values = vt[:3], values[:3]
    elif change == "mismatch":
        values = values[:-1]
    elif change == "overflow":
        kwargs["step"] = 1e-320
    else:
        kwargs["step"] = 0.000001
    with pytest.raises(ValueError):
        estimate_lag(t, target, vt, values, **kwargs)


def test_api_reads_full_source_channel_and_retains_original_time():
    acq = get_acq("demo")
    xyz, _ = acq.points(0, acq.count)
    body = dict(
        times=(np.arange(acq.count) / acq.rate + 0.12).tolist(),
        values=xyz[:, 26, 2].tolist(),
        channel=26,
        axis=2,
        start=100,
        stop=400,
        low=-0.3,
        high=0.3,
        step=0.01,
    )
    with TestClient(app) as client:
        response = client.post("/api/files/demo/alignment", json=body)
        assert response.status_code == 200
        result = response.json()
        assert result["status"] == "accepted"
        assert result["lag"] == pytest.approx(0.12)
        assert result["reference"]["start"] == 100
        assert (
            client.post("/api/files/demo/alignment", json={**body, "direction": 0}).status_code
            == 400
        )
        assert (
            client.post("/api/files/demo/alignment", json={**body, "channel": 999}).status_code
            == 400
        )
        assert (
            client.post(
                "/api/files/demo/alignment", json={**body, "times": body["times"][:-1]}
            ).status_code
            == 400
        )
