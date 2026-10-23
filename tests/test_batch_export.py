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

    def paused(self, *args):
        entered.set()
        assert release.wait(5)
        yield from original(self, *args)

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
