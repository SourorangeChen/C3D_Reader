import csv
import io
import struct

import c3d
import numpy as np
import pytest

from backend.acquisition import Acquisition
from backend.demo import create_demo


@pytest.fixture
def trial(tmp_path):
    return Acquisition(create_demo(tmp_path / "walking.c3d"))


@pytest.mark.parametrize("scale", [-0.01, 0.1])
def test_values_match_reference_reader(tmp_path, scale):
    path = tmp_path / "scaled.c3d"
    writer = c3d.Writer(point_rate=100, analog_rate=400, point_scale=scale, gen_scale=2.0)
    writer.set_point_labels(["LASI", "RASI", "LANK"])
    writer.set_analog_labels(["Force", "EMG"])
    writer.set_analog_scales([0.5, 0.25])
    writer.set_analog_offsets([3, -7])
    writer.set_start_frame(101)
    source = []
    for i in range(5):
        p = np.array(
            [
                [10 + i, 20 + i, 30 + i, 0.2, 7],
                [40 + i, 50 + i, 60 + i, 0.3, 3],
                [70 + i, 80 + i, 90 + i, 0.2, 7],
            ],
            dtype=float,
        )
        if i == 2:
            p[1, 3] = -1
        a = np.array([[0, 1, 2, 3], [4, 5, 6, 7]], dtype=float) + i
        source.append((p, a))
    writer.add_frames(source)
    with path.open("wb") as f:
        writer.write(f)
    acq = Acquisition(path)
    assert acq.first == 101
    assert acq.last == 105
    assert acq.count == 5
    with path.open("rb") as f:
        reference = c3d.Reader(f)
        for i, (frame, points, analog) in enumerate(reference.read_frames()):
            xyz, residual = acq.points(i, i + 1)
            valid = points[:, 3] >= 0
            np.testing.assert_allclose(xyz[0, valid], points[valid, :3], rtol=1e-6)
            np.testing.assert_allclose(residual[0], points[:, 3], atol=1e-6)
            assert np.isnan(xyz[0, ~valid]).all()
            for ch in range(2):
                np.testing.assert_allclose(acq.analog(ch, i, i + 1), analog[ch], rtol=1e-6)


def test_vicon_numbered_analog_arrays(tmp_path):
    path = tmp_path / "extended.c3d"
    n = 296
    writer = c3d.Writer(point_rate=100, analog_rate=200)
    writer.set_point_labels(["LASI"])
    writer.set_analog_labels([f"A{i:03}" for i in range(255)])
    writer.analog_group.add_str(
        "LABELS2", "", "".join(f"A{i:03}" for i in range(255, n)), 4, n - 255
    )
    scales = np.linspace(0.1, 2, n, dtype=np.float32)
    offsets = np.arange(n, dtype=np.int16) - 120
    writer.set_analog_scales(scales[:255])
    writer.set_analog_offsets(offsets[:255])
    writer.analog_group.set_array("SCALE2", "", scales[255:])
    writer.analog_group.set_array("OFFSET2", "", offsets[255:])
    writer.analog_group.add_str("DESCRIPTIONS", "", " " * 255, 1, 255)
    writer.analog_group.add_str("DESCRIPTIONS2", "", " " * (n - 255), 1, n - 255)
    # The reference writer has the same 255-element limitation. Supply its
    # transform explicitly, while retaining the real split metadata on disk.
    writer.get_analog_transform = lambda: (
        np.broadcast_to(scales[:, None], (n, 2)),
        np.broadcast_to(offsets[:, None], (n, 2)),
    )
    analog = np.arange(n * 2, dtype=float).reshape(n, 2) / 10
    writer.add_frames([(np.array([[1, 2, 3, 0.1, 7.0]]), analog)])
    with path.open("wb") as f:
        writer.write(f)
    a = Acquisition(path)
    assert len(a.analog_labels) == 296
    assert a.analog_labels[255] == "A255"
    assert a.analog_labels[-1] == "A295"
    for i in [0, 254, 255, 295]:
        np.testing.assert_allclose(a.analog(i, 0, 1), analog[i], rtol=1e-5, atol=1e-4)


def test_first_frame_above_16_bit_range(tmp_path):
    # Fix the upstream writer's getter as well, so it emits the intended
    # start value rather than silently decrementing it during write().
    class FixtureWriter(c3d.Writer):
        @property
        def first_frame(self):
            p = self.get("TRIAL:ACTUAL_START_FIELD")
            return int.from_bytes(p.bytes, "little") if p else int(self._header.first_frame)

    writer = FixtureWriter(point_rate=100)
    writer.set_start_frame(70000)
    writer.set_point_labels(["LASI"])
    writer.add_frames([(np.array([[1, 2, 3, 0.1, 7.0]]), np.zeros((0, 0))) for _ in range(3)])
    path = tmp_path / "long-counter.c3d"
    with path.open("wb") as f:
        writer.write(f)
    a = Acquisition(path)
    assert (a.first, a.last, a.count) == (70000, 70002, 3)


def test_missing_points_and_export(trial):
    xyz, residual = trial.points(290, 310)
    assert np.isnan(xyz[:, 10]).all()
    assert (residual[:, 10] == -1).all()
    rows = list(csv.reader(io.StringIO("".join(trial.csv_rows("point", [10], 290, 292)))))
    assert len(rows) == 3
    assert rows[1][0] == "291"
    assert rows[1][2:5] == ["", "", ""]
    assert float(rows[1][5]) == -1
    analog = list(csv.reader(io.StringIO("".join(trial.csv_rows("analog", [3], 10, 12)))))
    assert len(analog) == 21
    assert float(analog[1][2]) == 0.1
    assert float(analog[-1][2]) == 0.119


def test_events_segments_and_metadata(trial):
    meta = trial.metadata()
    assert meta["frameCount"] == 800
    assert meta["samplesPerFrame"] == 10
    assert meta["pointUnit"] == "mm"
    assert trial.events[0]["frame"] == 57
    assert trial.events[0]["time"] == 0.56
    assert trial.events[1]["context"] == "Right"
    assert trial.segments
    assert len(trial.parameters()) >= 4
    assert isinstance(trial.data, np.memmap)


def test_nonzero_start_event_alignment(tmp_path):
    path = tmp_path / "offset.c3d"
    writer = c3d.Writer(point_rate=100)
    writer.set_start_frame(101)
    writer.set_point_labels(["LASI"])
    writer.add_frames([(np.array([[1, 2, 3, 0.1, 7.0]]), np.zeros((0, 0))) for _ in range(100)])
    group = writer.add_group(10, "EVENT", "")
    group.add_param(
        "TIMES",
        bytes_per_element=4,
        dimensions=[2, 1],
        bytes=struct.pack("<ff", 0, 1.2),
    )
    group.add_param("LABELS", bytes_per_element=-1, dimensions=[6, 1], bytes=b"Strike")
    with path.open("wb") as f:
        writer.write(f)
    a = Acquisition(path)
    assert a.events[0]["frame"] == 121
    assert a.events[0]["time"] == 0.2


def test_rejects_truncated_data(tmp_path):
    path = create_demo(tmp_path / "broken.c3d")
    with path.open("r+b") as stream:
        stream.truncate(path.stat().st_size - 10000)
    with pytest.raises(ValueError, match="Truncated"):
        Acquisition(path)
