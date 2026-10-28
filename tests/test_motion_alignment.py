from types import SimpleNamespace

import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.app import app, get_acq
from backend.automatic_sync import AutomaticAlignment, merge_windows
from backend.motion_alignment import (
    MODEL_LABELS,
    finish,
    interpolate_pose,
    observations,
    project,
    read_reference,
    search,
)


def body(t):
    t = np.asarray(t)
    base = np.array(
        [
            [-0.22, 0, 1.5],
            [0.22, 0, 1.5],
            [-0.3, 0.05, 1.2],
            [0.3, 0.05, 1.2],
            [-0.3, 0.1, 0.9],
            [0.3, 0.1, 0.9],
            [-0.14, 0, 0.9],
            [0.14, 0, 0.9],
            [-0.15, 0.1, 0.5],
            [0.15, 0.1, 0.5],
            [-0.15, 0.05, 0.08],
            [0.15, 0.05, 0.08],
        ]
    )
    xyz = np.broadcast_to(base, (len(t), 12, 3)).copy()
    for j in range(12):
        xyz[:, j, 0] += 0.04 * np.sin((1.4 + 0.12 * j) * t + 0.09 * t**2)
        xyz[:, j, 1] += 0.12 * np.sin((1.2 + 0.13 * j) * t + 0.06 * t**2)
        xyz[:, j, 2] += 0.05 * np.cos((1.3 + 0.17 * j) * t + 0.12 * t**2)
    return xyz


def example(periodic=False, stationary=False):
    rt = np.arange(0.1, 4.9, 0.1)
    vt = np.arange(0, 10, 1 / 30)

    def motion(t):
        return body(np.zeros_like(t) if stationary else np.sin(np.pi * t) if periodic else t)

    reference = dict(
        times=rt, xyz=motion(rt), landmarks="synthetic", firstFrame=2725, lastFrame=3952
    )
    camera = np.array([[0.8, 0.2, 0, 0.7], [0, 0.1, -0.7, 1.8], [0, 0.02, 0.01, 2]])
    uv = project(motion(vt - 2.3), camera)
    points = np.dstack([uv, np.full(uv.shape[:2], 0.95)])
    return reference, vt, points


def test_matches_raw_joint_actions_and_constant_lag_without_supplied_offset():
    ref, times, points = example()
    curve = search(ref, times, points, -0.05, 4.05, step=0.05)
    result = finish(ref, times, points, curve, -0.05, 4.05)
    assert result["status"] == "accepted"
    assert result["offset"] == pytest.approx(2.3, abs=0.03)
    assert result["correlation"] > 0.99
    assert result["coverage"] == 1
    assert result["frameRange"] == [2725, 3952]
    assert result["visualReview"] == "pending"


@pytest.mark.parametrize("kind", ["periodic", "stationary", "missing", "boundary"])
def test_does_not_claim_automatic_alignment_without_unique_motion_evidence(kind):
    ref, times, points = example(periodic=kind == "periodic", stationary=kind == "stationary")
    if kind == "missing":
        points[25:200] = np.nan
    low = 2.3 if kind == "boundary" else -0.05
    curve = search(ref, times, points, low, 4.05, step=0.05)
    assert finish(ref, times, points, curve, low, 4.05)["status"] == "rejected"


def test_pose_interpolation_retains_pts_and_does_not_bridge_absence():
    values = np.array([[[1.0, 2.0, 0.9]], [[2.0, 3.0, 0.8]], [[np.nan] * 3], [[8.0, 9.0, 0.7]]])
    actual = interpolate_pose([0, 0.05, 0.1, 0.15, 0.2, 0.5, 1], [0, 0.1, 0.2, 1], values, 0.12)
    np.testing.assert_allclose(
        actual[:, 0, 0], [1, 1.5, 2, np.nan, np.nan, np.nan, 8], equal_nan=True
    )


def test_reference_uses_original_crop_and_correct_anatomical_joint_centers():
    n = 2000
    points = np.ones((n, 12, 4))
    points[:, :, :3] *= np.arange(12)[None, :, None] + 1
    acq = SimpleNamespace(
        rate=250,
        first=2725,
        point_labels=["Subject:" + label for label in MODEL_LABELS],
        kinds=["marker"] * 12,
        point_unit="mm",
        scale=-1,
        data={"points": points},
    )
    reference = read_reference(acq, 250, 1500)
    assert reference["firstFrame"] == 2975
    assert reference["lastFrame"] == 4224
    assert reference["times"][0] == pytest.approx(1.1)
    assert reference["labels"][6:12] == [
        [label] for label in ["LFEP", "RFEP", "LFEO", "RFEO", "LTIO", "RTIO"]
    ]
    np.testing.assert_allclose(reference["xyz"][0, :, 0], (np.arange(12) + 1) / 1000)
    acq.point_labels += ["Other:LFEP"]
    acq.kinds += ["marker"]
    with pytest.raises(ValueError):
        read_reference(acq, 250, 1500)


def test_pose_validation_and_cancellation():
    with pytest.raises(ValueError):
        observations([dict(time=0, points=None)] * 10)
    ref, times, points = example()
    with pytest.raises(InterruptedError):
        search(ref, times, points, 0, 5, cancelled=lambda: True)
    assert merge_windows([[3, 4], [0, 2], [1, 3.2], [5, 6]]) == [[0, 4], [5, 6]]


def test_api_requires_desktop_authorization_for_disk_media(monkeypatch):
    monkeypatch.setenv("C3D_READER_DESKTOP_TOKEN", "private-test-token")
    with TestClient(app) as client:
        assert (
            client.post(
                "/api/desktop/auto-alignment",
                json={"acquisitionId": "demo", "paths": ["/tmp/x.mov"]},
            ).status_code
            == 403
        )
        assert client.get("/api/auto-alignment/expired").status_code == 404
        assert client.delete("/api/auto-alignment/expired").status_code == 404


def test_job_rejects_changed_sources_and_reports_cancelled(tmp_path, monkeypatch):
    import backend.automatic_sync as sync

    executable = tmp_path / "worker"
    executable.touch()
    monkeypatch.setattr(sync, "worker_path", lambda: executable)
    monkeypatch.setattr(sync.sys, "platform", "darwin")
    movie = tmp_path / "source.mov"
    movie.write_bytes(b"fixture")
    acq = get_acq("demo")
    ref, times, points = example()
    job = AutomaticAlignment(acq, [str(movie)], 0, acq.count)
    job.reference = ref
    rows = [dict(time=float(t), points=p.tolist()) for t, p in zip(times, points)]
    monkeypatch.setattr(job, "extract", lambda *args: (rows, {"width": 1, "height": 1}))
    movie.write_bytes(b"changed")
    job.run()
    assert job.snapshot()["status"] == "failed"
    assert "源文件发生变化" in job.snapshot()["error"]
    cancelled = AutomaticAlignment(acq, [str(movie)], 0, acq.count)
    cancelled.cancel()
    cancelled.run()
    assert cancelled.snapshot()["status"] == "cancelled"
