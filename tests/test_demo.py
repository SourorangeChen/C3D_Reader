"""The published synthetic trial must remain a coherent animation, not just valid C3D."""

import numpy as np
import pytest

from backend.acquisition import Acquisition
from backend.demo import STANCE, create_demo, gait_phase


@pytest.fixture(scope="module")
def demo(tmp_path_factory):
    return Acquisition(create_demo(tmp_path_factory.mktemp("demo") / "walking.c3d"))


@pytest.mark.parametrize("side", ["L", "R"])
def test_limbs_keep_their_length_and_feet_clear_the_floor(demo, side):
    xyz, _ = demo.points(0, demo.count)

    def point(name):
        return xyz[:, demo.point_labels.index(side + name)]

    for a, b in [("ASI", "KNE"), ("KNE", "ANK")]:
        np.testing.assert_allclose(np.linalg.norm(point(a) - point(b), axis=1), 445, atol=0.001)
    wrist = (point("WRA") + point("WRB")) / 2
    valid = np.isfinite(point("ELB")).all(axis=1)
    np.testing.assert_allclose(
        np.linalg.norm(point("ELB")[valid] - point("SHO")[valid], axis=1),
        np.hypot(300, 25),
        atol=0.001,
    )
    np.testing.assert_allclose(
        np.linalg.norm(wrist[valid] - point("ELB")[valid], axis=1),
        260,
        atol=0.001,
    )
    # A rigid foot rotates with its ankle, including during swing.
    np.testing.assert_allclose(
        np.linalg.norm(point("TOE") - point("HEE"), axis=1),
        np.hypot(245, 10),
        atol=0.001,
    )
    assert np.min(point("HEE")[:, 2]) >= 0
    assert np.min(point("TOE")[:, 2]) >= 0
    phase = gait_phase(np.arange(demo.count) / demo.rate, side)
    stance = phase < STANCE
    np.testing.assert_allclose(point("ANK")[stance, 2], 85, atol=0.001)
    assert np.max(point("ANK")[~stance, 2]) > 190


@pytest.mark.parametrize("side,channel", [("L", 0), ("R", 1)])
def test_force_matches_contact_and_has_two_loading_peaks(demo, side, channel):
    force = demo.analog(channel, 0, demo.count)
    phase = gait_phase(np.arange(len(force)) / demo.analog_rate, side)
    assert np.min(force) >= 0
    assert np.max(force[phase >= STANCE]) == 0

    # Test one complete stance: loading and push-off exceed mid-stance.
    def peak(lo, hi):
        return np.max(force[(phase > lo * STANCE) & (phase < hi * STANCE)])

    assert peak(0.1, 0.4) > 1.15 * peak(0.48, 0.52)
    assert peak(0.6, 0.9) > 1.15 * peak(0.48, 0.52)


def test_foot_strikes_align_with_landing_and_force_onset(demo):
    xyz, _ = demo.points(0, demo.count)
    for event in demo.events:
        side = event["context"][0]
        frame = round(event["time"] * demo.rate)
        ankle = xyz[frame, demo.point_labels.index(side + "ANK")]
        assert ankle[1] > 200
        assert ankle[2] == pytest.approx(85, abs=0.2)
        force = demo.analog(0 if side == "L" else 1, 0, demo.count)
        sample = round(event["time"] * demo.analog_rate)
        assert force[sample - 10] == 0
        assert force[sample + 10] > 0


def test_front_torso_and_hands_are_connected(demo):
    edges = {frozenset((demo.point_labels[a], demo.point_labels[b])) for a, b in demo.segments}
    for a, b in [
        ("CLAV", "LSHO"),
        ("STRN", "LASI"),
        ("STRN", "RASI"),
        ("LWRA", "LFIN"),
        ("RWRB", "RFIN"),
    ]:
        assert frozenset((a, b)) in edges
