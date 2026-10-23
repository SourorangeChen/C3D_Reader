import csv
import io

import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.app import app
from backend.demo import create_demo


@pytest.fixture
def client():
    return TestClient(app)


def test_metadata_binary_and_frame_agree(client):
    meta = client.get("/api/files/demo").json()
    response = client.get("/api/files/demo/frames?start=20&count=2")
    assert response.status_code == 200
    assert response.headers["x-frame-count"] == "2"
    data = np.frombuffer(response.content, dtype="<f4").reshape(2, len(meta["points"]), 3)
    frame = client.get("/api/files/demo/frame/20").json()
    np.testing.assert_allclose(data[0], frame["points"], rtol=1e-6)


@pytest.mark.parametrize(
    "path",
    [
        "/api/files/demo/frames?start=-1",
        "/api/files/demo/frames?start=800",
        "/api/files/demo/series?ids=-1",
        "/api/files/demo/series?ids=99999",
        "/api/files/demo/series?start=4&stop=4",
        "/api/files/demo/export?ids=wat",
    ],
)
def test_invalid_ranges_and_indices(client, path):
    assert client.get(path).status_code == 400


def test_series_preserves_missing_and_extrema(client):
    data = client.get("/api/files/demo/series?ids=10&limit=60").json()
    assert len(data["series"]) == 3
    assert any(v is None for v in data["series"][0]["values"])
    for i, s in enumerate(data["series"]):
        assert s["times"] == sorted(s["times"])
        assert len(s["values"]) <= 62
        full = client.get("/api/files/demo/series?ids=10&limit=1000").json()["series"][i]
        assert max(v for v in s["values"] if v is not None) == max(
            v for v in full["values"] if v is not None
        )
        assert min(v for v in s["values"] if v is not None) == min(
            v for v in full["values"] if v is not None
        )


def test_analog_time_and_export(client):
    data = client.get("/api/files/demo/series?kind=analog&ids=3&start=10&stop=11").json()
    assert data["sampleRate"] == 1000
    np.testing.assert_allclose(data["series"][0]["times"], np.arange(100, 110) / 1000)
    response = client.get("/api/files/demo/export?kind=analog&ids=3&start=10&stop=11")
    assert "attachment" in response.headers["content-disposition"]
    rows = list(csv.reader(io.StringIO(response.text)))
    assert len(rows) == 11
    assert float(rows[-1][2]) == 0.109


def test_local_origin_and_host_protection(client):
    assert client.get("/api/library", headers={"Origin": "https://evil.example"}).status_code == 403
    assert (
        client.post("/api/library", headers={"Origin": "null"}, json={"path": "/tmp"}).status_code
        == 403
    )
    assert client.get("/api/library", headers={"Host": "evil.example"}).status_code == 400
    assert client.get("/api/library", headers={"Origin": "http://testserver"}).status_code == 200


def test_folder_registration_and_missing_file(client, tmp_path):
    response = client.post("/api/library", json={"path": str(tmp_path)})
    assert response.status_code == 200
    assert response.json()["files"] == []
    assert client.post("/api/library", json={"path": str(tmp_path / "missing")}).status_code == 400
    assert client.get("/api/files/not-a-file").status_code == 404
    assert client.get("/api/files/demo/parameters").status_code == 200


def test_disk_disappearance_and_source_change_are_recoverable(client, tmp_path):
    path = create_demo(tmp_path / "source.c3d")
    library = client.post("/api/library", json={"path": str(tmp_path)}).json()
    key = library["files"][0]["id"]
    assert client.get(f"/api/files/{key}").status_code == 200
    with path.open("ab") as stream:
        stream.write(b"\0")
    assert client.get(f"/api/files/{key}/frames").status_code == 409
    assert client.get(f"/api/files/{key}").status_code == 200
    path.unlink()
    assert client.get(f"/api/files/{key}/frames").status_code == 404


def test_invalid_c3d_is_an_actionable_error(client, tmp_path):
    (tmp_path / "invalid.c3d").write_bytes(b"not a C3D recording")
    listing = client.post("/api/library", json={"path": str(tmp_path)}).json()
    response = client.get(f"/api/files/{listing['files'][0]['id']}")
    assert response.status_code == 422
    assert "Truncated C3D header" in response.json()["detail"]
