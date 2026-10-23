import csv
import hashlib
import io
import json
import threading
import time
import zipfile

import pytest
from fastapi.testclient import TestClient

from backend.acquisition import Acquisition
from backend.app import app, batch_exports
from backend.demo import create_demo


@pytest.fixture
def client():
    with TestClient(app) as client:
        yield client
    # All tests wait for worker completion before the temporary directory is removed.
    batch_exports.close()


def wait_done(client, key):
    for _ in range(300):
        job = client.get(f"/api/library/exports/{key}").json()
        if job["status"] != "running":
            return job
        time.sleep(0.01)
    pytest.fail("Batch export did not finish")


def test_folder_export_full_resolution_and_failure_manifest(client, tmp_path):
    paths = [create_demo(tmp_path / "合成 walking.C3D"), create_demo(tmp_path / "second.c3d")]
    fingerprints = [hashlib.sha256(p.read_bytes()).digest() for p in paths]
    (tmp_path / "broken.c3d").write_bytes(b"invalid")
    (tmp_path / "._hidden.c3d").write_bytes(b"excluded")
    (tmp_path / "directory.c3d").mkdir()
    create_demo(tmp_path / "directory.c3d" / "nested.c3d")
    listing = client.post("/api/library", json={"path": str(tmp_path)}).json()
    assert len(listing["files"]) == 3
    job = client.post("/api/library/exports").json()
    key = job["id"]
    assert wait_done(client, key)["status"] == "ready"
    job = client.get(f"/api/library/exports/{key}").json()
    assert (job["completed"], job["succeeded"], job["failed"]) == (3, 2, 1)
    assert job["errors"] == ["broken.c3d"]
    response = client.get(f"/api/library/exports/{key}/download")
    assert response.status_code == 200
    assert "c3d-folder-csv.zip" in response.headers["content-disposition"]
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        assert archive.testzip() is None
        assert len(archive.namelist()) == 5
        manifest_text = archive.read("manifest.json").decode()
        assert str(tmp_path) not in manifest_text
        manifest = json.loads(manifest_text)
        assert [item["status"] for item in manifest["files"]] == ["error", "ok", "ok"]
        for item in manifest["files"][1:]:
            prefix = item["directory"]
            points = list(
                csv.reader(io.StringIO(archive.read(prefix + "/points.csv").decode("utf-8-sig")))
            )
            analogs = list(
                csv.reader(io.StringIO(archive.read(prefix + "/analog.csv").decode("utf-8-sig")))
            )
            assert len(points) == 801  # All 35 points, exceeding the single-export channel limit.
            assert len(points[0]) == 2 + 35 * 4
            assert len(analogs) == 8001
            assert len(analogs[0]) == 3 + 4
            assert float(analogs[-1][2]) == 7.999
            assert item["pointRate"] == 100 and item["analogRate"] == 1000
            # Missing marker coordinates remain blank with residual -1.
            lelb = next(i for i, title in enumerate(points[0]) if title.startswith("LELB:X"))
            assert points[300][lelb : lelb + 4] == ["", "", "", "-1.0"]
    assert fingerprints == [hashlib.sha256(p.read_bytes()).digest() for p in paths]


def test_cancelled_export_cleans_up_and_can_restart(client, tmp_path, monkeypatch):
    create_demo(tmp_path / "walking.c3d")
    client.post("/api/library", json={"path": str(tmp_path)})
    entered, release = threading.Event(), threading.Event()
    original = Acquisition.csv_rows

    def paused(self, *args, **kwargs):
        entered.set()
        assert release.wait(5)
        yield from original(self, *args, **kwargs)

    monkeypatch.setattr(Acquisition, "csv_rows", paused)
    job = client.post("/api/library/exports").json()
    assert entered.wait(5)
    assert client.post("/api/library/exports").status_code == 409
    # The job uses its original directory even if the UI switches folders.
    empty = tmp_path / "empty"
    empty.mkdir()
    client.post("/api/library", json={"path": str(empty)})
    key = job["id"]
    directory = batch_exports.folder
    assert client.get(f"/api/library/exports/{key}/download").status_code == 409
    client.delete(f"/api/library/exports/{key}")
    release.set()
    assert wait_done(client, key)["status"] == "cancelled"
    # State is published after file handles close; allow the final cleanup turn.
    for _ in range(50):
        if not directory.exists():
            break
        time.sleep(0.01)
    assert not directory.exists()
    assert client.post("/api/library/exports").status_code == 400
    client.post("/api/library", json={"path": str(tmp_path)})
    next_job = client.post("/api/library/exports").json()
    assert wait_done(client, next_job["id"])["status"] == "ready"
    assert client.get(f"/api/library/exports/{key}").status_code == 404
    with batch_exports.lock:
        batch_exports.job["updated"] -= 1801
    assert client.get(f"/api/library/exports/{next_job['id']}").json()["status"] == "expired"
    assert not batch_exports.folder.exists()


def test_point_only_recording_and_download_lease(client, tmp_path):
    import c3d
    import numpy as np

    path = tmp_path / "point-only.c3d"
    writer = c3d.Writer(point_rate=100)
    writer.set_point_labels(["LASI"])
    writer.add_frames([(np.array([[1, 2, 3, 0.1, 7.0]]), np.empty((0, 0)))])
    with path.open("wb") as stream:
        writer.write(stream)
    client.post("/api/library", json={"path": str(tmp_path)})
    job = client.post("/api/library/exports").json()
    assert wait_done(client, job["id"])["status"] == "ready"
    with zipfile.ZipFile(batch_exports.download(job["id"])) as archive:
        assert len(archive.namelist()) == 2
        assert not any(name.endswith("analog.csv") for name in archive.namelist())
        manifest = json.loads(archive.read("manifest.json"))
        assert manifest["files"][0]["analogs"] == []
        # Active downloads prevent replacement or cleanup by expiry.
        assert client.post("/api/library/exports").status_code == 409
        with batch_exports.lock:
            batch_exports.job["updated"] -= 1801
        assert client.get(f"/api/library/exports/{job['id']}").json()["status"] == "ready"
        assert batch_exports.folder.exists()
    batch_exports.release()
    assert client.get(f"/api/library/exports/{job['id']}").json()["status"] == "expired"


def test_download_errors_release_the_lease(client, tmp_path):
    import asyncio

    from backend.app import download_folder_export

    create_demo(tmp_path / "walking.c3d")
    client.post("/api/library", json={"path": str(tmp_path)})
    job = client.post("/api/library/exports").json()
    key = job["id"]
    assert wait_done(client, key)["status"] == "ready"
    for value, status in [("bytes=999999999999-", 416), ("invalid", 400), ("bytes=0-9", 206)]:
        response = client.get(f"/api/library/exports/{key}/download", headers={"Range": value})
        assert response.status_code == status
        assert batch_exports.readers == 0

    async def disconnected():
        response = download_folder_export(key)
        assert batch_exports.readers == 1

        async def send(_message):
            raise OSError("Client disconnected")

        async def receive():
            return {"type": "http.disconnect"}

        with pytest.raises(OSError):
            await response({"type": "http", "method": "GET", "headers": []}, receive, send)
        assert batch_exports.readers == 0

    asyncio.run(disconnected())
    next_job = client.post("/api/library/exports").json()
    assert wait_done(client, next_job["id"])["status"] == "ready"


def test_folder_csv_retains_com_channels_and_roles(client, tmp_path):
    create_demo(tmp_path / "synthetic-com.c3d", include_com=True)
    client.post("/api/library", json={"path": str(tmp_path)})
    job = client.post("/api/library/exports").json()
    assert wait_done(client, job["id"])["status"] == "ready"
    response = client.get(f"/api/library/exports/{job['id']}/download")
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        record = json.loads(archive.read("manifest.json"))["files"][0]
        assert record["points"][-2]["role"] == "centerOfMass"
        assert record["points"][-1]["role"] == "centerOfMassFloor"
        rows = list(
            csv.reader(
                io.StringIO(archive.read(record["directory"] + "/points.csv").decode("utf-8-sig"))
            )
        )
        assert len(rows) == 801 and len(rows[0]) == 2 + 37 * 4
        assert "Demo:CentreOfMass:Z (mm)" in rows[0]
        assert "Demo:CentreOfMassFloor:Z (mm)" in rows[0]
        assert float(rows[1][rows[0].index("Demo:CentreOfMassFloor:Z (mm)")]) == 0


def test_progress_is_visible_before_the_first_file_finishes(client, tmp_path, monkeypatch):
    create_demo(tmp_path / "synthetic.c3d")
    client.post("/api/library", json={"path": str(tmp_path)})
    entered, release = threading.Event(), threading.Event()
    original = Acquisition.csv_rows

    def paused(self, *args, progress=None):
        def report(done, total):
            progress(done, total)
            if done and not entered.is_set():
                entered.set()
                assert release.wait(5)

        yield from original(self, *args, progress=report)

    monkeypatch.setattr(Acquisition, "csv_rows", paused)
    job = client.post("/api/library/exports").json()
    try:
        assert entered.wait(5)
        current = client.get("/api/library/exports").json()
        assert current["id"] == job["id"]
        assert current["status"] == "running" and current["completed"] == 0
        assert current["stage"] == "point"
        assert 0 < current["processed"] < current["stageTotal"] == 800
        assert "cancel" not in current and "started" not in current
        client.delete(f"/api/library/exports/{job['id']}")
    finally:
        release.set()
    assert wait_done(client, job["id"])["status"] == "cancelled"


def test_staging_disk_full_aborts_with_actionable_error(client, tmp_path, monkeypatch):
    import errno
    from pathlib import Path

    create_demo(tmp_path / "synthetic.c3d")
    client.post("/api/library", json={"path": str(tmp_path)})
    original = Path.open

    def no_space(path, *args, **kwargs):
        if path.name == "points.csv" and path.parent.name == "staging":
            raise OSError(errno.ENOSPC, "private path must never be returned")
        return original(path, *args, **kwargs)

    monkeypatch.setattr(Path, "open", no_space)
    job = client.post("/api/library/exports").json()
    result = wait_done(client, job["id"])
    assert result["status"] == "error" and result["errorCode"] == "diskFull"
    assert result["completed"] == 0
    assert "private path" not in json.dumps(result)
    assert client.get(f"/api/library/exports/{job['id']}/download").status_code == 409


def test_wide_analog_csv_uses_small_cancellable_blocks(tmp_path):
    import c3d
    import numpy as np

    writer = c3d.Writer(point_rate=100, analog_rate=20000)
    writer.set_point_labels(["SYNTHETIC"])
    writer.set_analog_labels([f"Synthetic {i}" for i in range(32)])
    writer.add_frames([(np.array([[1, 2, 3, 0.1, 7.0]]), np.ones((32, 200))) for _ in range(24)])
    path = tmp_path / "synthetic-wide.c3d"
    with path.open("wb") as stream:
        writer.write(stream)
    acq = Acquisition(path)
    updates = []
    chunks = list(
        acq.csv_rows(
            "analog",
            list(range(32)),
            0,
            24,
            progress=lambda done, total: updates.append((done, total)),
        )
    )
    assert updates == [(0, 24), (10, 24), (20, 24), (24, 24)]
    rows = list(csv.reader(io.StringIO("".join(chunks))))
    assert len(rows) == 4801 and len(rows[0]) == 35
    assert float(rows[-1][2]) == 4799 / 20000


def test_workspace_allocation_failure_preserves_previous_download(client, tmp_path, monkeypatch):
    import errno

    import backend.batch_export as module

    create_demo(tmp_path / "synthetic.c3d")
    client.post("/api/library", json={"path": str(tmp_path)})
    job = client.post("/api/library/exports").json()
    assert wait_done(client, job["id"])["status"] == "ready"

    def no_space(**kwargs):
        raise OSError(errno.ENOSPC, "private system path")

    monkeypatch.setattr(module.tempfile, "mkdtemp", no_space)
    response = client.post("/api/library/exports")
    assert response.status_code == 507 and "private system path" not in response.text
    current = client.get("/api/library/exports").json()
    assert current["id"] == job["id"] and current["status"] == "ready"
    response = client.get(f"/api/library/exports/{job['id']}/download")
    assert response.status_code == 200
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        assert archive.testzip() is None
