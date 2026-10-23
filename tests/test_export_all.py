import csv
import io

import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.acquisition import Acquisition, point_role
from backend.app import app
from backend.demo import create_demo


@pytest.mark.parametrize(
    "label,role",
    [
        ("Demo:CentreOfMass", "centerOfMass"),
        ("Subject B:Center_Of_Mass", "centerOfMass"),
        ("Subject A:CoM", "centerOfMass"),
        ("Demo:CentreOfMassFloor", "centerOfMassFloor"),
        ("Center Of Mass Floor", "centerOfMassFloor"),
        ("COM-floor", "centerOfMassFloor"),
        ("LThighCOM", None),
        ("COMVelocity", None),
        ("CompanyMarker", None),
        ("COM1", None),
        ("COM2Floor", None),
    ],
)
def test_source_com_label_recognition(label, role):
    assert point_role(label) == role


def test_export_all_points_includes_source_com_and_projection(tmp_path):
    path = create_demo(tmp_path / "synthetic-com.c3d", include_com=True)
    acquisition = Acquisition(path)
    with TestClient(app) as client:
        listing = client.post("/api/library", json={"path": str(tmp_path)}).json()
        key = listing["files"][0]["id"]
        meta = client.get(f"/api/files/{key}").json()
        assert meta["points"][-2]["role"] == "centerOfMass"
        assert meta["points"][-1]["role"] == "centerOfMassFloor"
        response = client.get(f"/api/files/{key}/export?scope=all")
        assert response.status_code == 200
        assert 'filename="c3d-all-points.csv"' in response.headers["content-disposition"]
        rows = list(csv.reader(io.StringIO(response.text)))
        assert len(rows) == 801 and len(rows[0]) == 2 + 37 * 4
        com = rows[0].index("Demo:CentreOfMass:X (mm)")
        floor = rows[0].index("Demo:CentreOfMassFloor:X (mm)")
        raw, residual = acquisition.points(10, 11)
        np.testing.assert_allclose([float(v) for v in rows[11][com : com + 3]], raw[0, -2])
        np.testing.assert_allclose([float(v) for v in rows[11][floor : floor + 3]], raw[0, -1])
        assert float(rows[11][com + 2]) > 900 and float(rows[11][floor + 2]) == 0
        # Source COM is not substituted with the average of the markers.
        assert not np.allclose(raw[0, -2], np.nanmean(raw[0, :-2], axis=0))
        only = client.get(f"/api/files/{key}/export?scope=com&start=10&stop=12")
        com_rows = list(csv.reader(io.StringIO(only.text)))
        assert len(com_rows) == 3 and len(com_rows[0]) == 10
        assert com_rows[1][:2] == ["11", "0.1"]
        assert com_rows[0][2:] == rows[0][com:]
        missing = client.get(f"/api/files/{key}/export?scope=all&start=299&stop=300")
        missing_rows = list(csv.reader(io.StringIO(missing.text)))
        lelb = missing_rows[0].index("LELB:X (mm)")
        assert missing_rows[1][lelb : lelb + 4] == ["", "", "", "-1.0"]
        analog = client.get(f"/api/files/{key}/export?scope=all&kind=analog")
        analog_rows = list(csv.reader(io.StringIO(analog.text)))
        assert len(analog_rows) == 8001 and len(analog_rows[0]) == 7
        assert float(analog_rows[-1][2]) == 7.999


def test_no_com_is_explicit_and_no_derived_data_is_exported():
    with TestClient(app) as client:
        meta = client.get("/api/files/demo").json()
        assert not any(p["role"] for p in meta["points"])
        assert client.get("/api/files/demo/export?scope=com").status_code == 400
        assert client.get("/api/files/demo/export?scope=com&kind=analog").status_code == 400
        assert client.get("/api/files/demo/export?scope=unknown").status_code == 422
        # Old direct links still export their selected channels.
        rows = list(csv.reader(io.StringIO(client.get("/api/files/demo/export?ids=0").text)))
        assert len(rows[0]) == 6
