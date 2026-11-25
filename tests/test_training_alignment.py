from types import SimpleNamespace

import pytest
from test_motion_alignment import example

from backend.training_alignment import share_reference_result


def identity(key, first=1, rate=250):
    return dict(
        id=key,
        name=key + ".c3d",
        revision=key,
        size=1,
        firstFrame=first,
        frameCount=1250,
        pointRate=rate,
    )


def test_one_reference_lag_is_shared_without_assigning_other_trials_motion_evidence():
    reference = identity("reference", 2725)
    other = identity("no-joint-channels", 4001, 500)
    result = share_reference_result(
        dict(status="accepted", offset=13.196, correlation=0.98), reference, [reference, other]
    )
    assert result["lag"] == pytest.approx(2.3)
    a, b = result["trials"]
    assert a["status"] == "accepted"
    assert b["status"] == "shared"
    assert a["lag"] == b["lag"] == result["lag"]
    assert a["offset"] == pytest.approx(13.196)
    assert b["offset"] == pytest.approx(10.3)
    assert a["motionChecked"] is True
    assert b["motionChecked"] is False
    assert b["correlation"] is None
    assert result["referenceTrial"] == reference


def test_rejected_reference_never_produces_a_shared_lag():
    reference = identity("reference")
    result = share_reference_result(
        dict(status="rejected", offset=2.3, reason="motion_match_ambiguous"),
        reference,
        [reference, identity("other")],
    )
    assert result["lag"] is None
    assert all(t["status"] == "rejected" and t["offset"] is None for t in result["trials"])
    assert result["referenceResult"]["reason"] == "motion_match_ambiguous"


@pytest.mark.parametrize("accept", [True, False])
def test_job_reads_motion_from_selected_trial_only_and_never_tries_another_trial(
    tmp_path, monkeypatch, accept
):
    import backend.automatic_sync as sync
    from backend.app import get_acq

    worker = tmp_path / "worker"
    worker.touch()
    movie = tmp_path / "source.mov"
    movie.touch()
    monkeypatch.setattr(sync, "worker_path", lambda: worker)
    monkeypatch.setattr(sync.sys, "platform", "darwin")
    acq = get_acq("demo")
    ref, times, points = example(stationary=not accept)
    joint_reads, metadata_reads, extractions = [], [], []

    def read_reference(source, start, stop):
        assert source is acq, "Only the selected reference trial can be motion-matched"
        joint_reads.append((start, stop))
        return ref

    def load(key):
        metadata_reads.append(key)
        assert key != "reference"
        if key == "unreadable":
            raise ValueError("missing file")
        metadata = identity(key, 501)
        metadata.pop("id")
        # No joint labels/data are supplied: shared trials need only header timing.
        return SimpleNamespace(timing_metadata=lambda: metadata, fingerprint=acq.fingerprint)

    monkeypatch.setattr(sync, "read_reference", read_reference)
    targets = [(key, acq.path) for key in ("reference", "no-joints", "unreadable")]
    job = sync.TrainingAlignment(
        acq, targets, load, [str(movie)], reference_id="reference", start=100, stop=500
    )
    rows = [dict(time=float(t), points=p.tolist()) for t, p in zip(times, points)]

    def extract(settings, *_):
        extractions.append(settings)
        return rows, {"width": 1, "height": 1}

    monkeypatch.setattr(job, "extract", extract)
    job.run()
    snapshot = job.snapshot()
    assert snapshot["status"] == "complete", snapshot
    assert snapshot["checked"] == 1
    assert joint_reads == [(100, 500)]
    assert sum(s["rate"] == 6 for s in extractions) == 1
    result = snapshot["result"]
    if accept:
        assert result["lag"] == pytest.approx(2.3, abs=0.03)
        assert [t["status"] for t in result["trials"]] == ["accepted", "shared", "rejected"]
        assert result["trials"][1]["lag"] == result["lag"]
        assert result["trials"][2]["reason"] == "metadata_unavailable"
        assert metadata_reads == ["no-joints", "unreadable"]
    else:
        assert result["lag"] is None
        assert metadata_reads == []
        assert all(t["reason"] == "reference_not_matched" for t in result["trials"])


def test_training_endpoint_snapshots_targets_but_matches_only_requested_reference_roi(monkeypatch):
    import importlib

    from fastapi.testclient import TestClient

    api = importlib.import_module("backend.app")
    monkeypatch.setenv("C3D_READER_DESKTOP_TOKEN", "group-test-token")
    captured = []

    def start(acquisition, targets, load, paths, *args, **options):
        captured.append((targets, options))
        return dict(id="group", status="running", result=None)

    monkeypatch.setattr(api.automatic_alignments, "start_training", start)
    body = dict(
        acquisitionId="demo",
        acquisitionIds=["demo", "demo"],
        paths=["/tmp/movie.mov"],
        start=100,
        stop=500,
    )
    headers = {"x-desktop-token": "group-test-token"}
    with TestClient(api.app) as client:
        assert client.post("/api/desktop/auto-alignment", json=body).status_code == 403
        assert (
            client.post("/api/desktop/auto-alignment", json=body, headers=headers).status_code
            == 200
        )
        assert len(captured[0][0]) == 1
        assert captured[0][1] == dict(reference_id="demo", start=100, stop=500)
        body["acquisitionIds"] = ["demo", "unknown"]
        assert (
            client.post("/api/desktop/auto-alignment", json=body, headers=headers).status_code
            == 400
        )
