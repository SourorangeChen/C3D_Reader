"""Deterministic, synthetic walking trial. Contains no participant data."""

import struct
from pathlib import Path

import c3d
import numpy as np

# Change the generated filename when the fixture changes, so existing installs
# receive the new demo without touching any user recordings.
DEMO_REVISION = 2
STRIDE_HZ = 0.9
STANCE = 0.62


def gait_phase(time, side):
    # The first left/right strikes occur at 0.56/1.11 s, as in EVENT.
    return (np.asarray(time) * STRIDE_HZ - 0.5 + (0.5 if side == "R" else 0)) % 1


def walking_pose(time):
    """Illustrative treadmill gait in mm, with fixed-length limb segments.

    This is a deterministic animation fixture, not measured or clinical gait.
    X is lateral, Y is forward and Z is up. Feet travel backward in stance;
    the knee is solved from hip/ankle positions in the sagittal plane.
    """
    cycle = 2 * np.pi * time * STRIDE_HZ
    pelvis = np.array([10 * np.sin(cycle), 0, 920 - 12 * np.cos(2 * cycle)])
    pose = {}
    for name, offset in {
        "LASI": [-120, 35, 0],
        "RASI": [120, 35, 0],
        "LPSI": [-95, -95, 0],
        "RPSI": [95, -95, 0],
        "C7": [0, -60, 550],
        "T10": [0, -65, 300],
        "CLAV": [0, 65, 540],
        "STRN": [0, 70, 350],
        "LFHD": [-70, 65, 770],
        "RFHD": [70, 65, 770],
        "LBHD": [-70, -65, 770],
        "RBHD": [70, -65, 770],
    }.items():
        pose[name] = pelvis + offset

    for side, sign in (("L", -1), ("R", 1)):
        phase = float(gait_phase(time, side))
        swing = np.clip((phase - STANCE) / (1 - STANCE), 0, 1)
        if phase < STANCE:
            foot_y = 210 * (1 - 2 * phase / STANCE)
        else:
            # Zero vertical velocity at toe-off/landing; no foot below the floor.
            foot_y = 210 * (-1 + 2 * (3 * swing**2 - 2 * swing**3))
        pitch = np.deg2rad(-20 * np.sin(2 * np.pi * swing))
        foot_rotation = np.array(
            [
                [1, 0, 0],
                [0, np.cos(pitch), -np.sin(pitch)],
                [0, np.sin(pitch), np.cos(pitch)],
            ]
        )
        ankle = np.array([pelvis[0] + sign * 120, foot_y, 85 + 115 * np.sin(np.pi * swing) ** 2])
        hip = pose[side + "ASI"]
        delta = ankle[1:] - hip[1:]
        distance = np.linalg.norm(delta)
        # Equal 445 mm thigh/shank lengths, choosing the forward-bending knee.
        bend = np.sqrt(445**2 - (distance / 2) ** 2)
        knee = np.array(
            [ankle[0], *(hip[1:] + delta / 2 + bend * np.array([-delta[1], delta[0]]) / distance)]
        )
        pose[side + "KNE"] = knee
        pose[side + "THI"] = (hip + knee) / 2 + [sign * 25, 0, 0]
        pose[side + "TIB"] = (knee + ankle) / 2 + [sign * 20, 0, 0]
        pose[side + "ANK"] = ankle
        pose[side + "HEE"] = ankle + foot_rotation @ np.array([0, -75, -45])
        pose[side + "TOE"] = ankle + foot_rotation @ np.array([0, 170, -55])

        # Arms counter-swing to the ipsilateral leg. Elbows and wrists rotate
        # with their parent segment instead of translating as one rigid column.
        shoulder = pelvis + [sign * 200, 0, 530]
        angle = np.deg2rad(-22 * np.cos(2 * np.pi * phase))
        flex = np.deg2rad(22 + 8 * np.sin(2 * np.pi * phase))
        elbow = shoulder + [sign * 25, 300 * np.sin(angle), -300 * np.cos(angle)]
        direction = np.array([0, np.sin(angle + flex), -np.cos(angle + flex)])
        wrist = elbow + 260 * direction
        pose[side + "SHO"] = shoulder
        pose[side + "ELB"] = elbow
        pose[side + "WRA"] = wrist + [-12, 0, 0]
        pose[side + "WRB"] = wrist + [12, 0, 0]
        pose[side + "FIN"] = wrist + 75 * direction
    pose["LSHO2"] = pose["LSHO"] + [-10, -20, -10]
    return pose


def walking_signals(times):
    """Contact-gated double-peak forces and deterministic EMG bursts."""
    forces, emg = [], []
    for side in ("L", "R"):
        phase = gait_phase(times, side)
        contact = phase < STANCE
        stance = np.clip(phase / STANCE, 0, 1)
        # Smooth loading/unloading, with an illustrative mid-stance trough.
        load = np.sin(np.pi * stance) ** 0.55 * (1 + 0.32 * np.cos(2 * np.pi * stance))
        forces.append(np.where(contact, 940 * load, 0))
        # Tibialis activity around heel strike and swing, not a copy of Fz.
        strike_distance = np.minimum(phase, 1 - phase)
        envelope = 0.35 * np.exp(-((strike_distance / 0.065) ** 2)) + 0.22 * np.exp(
            -(((phase - 0.80) / 0.12) ** 2)
        )
        carrier = (
            np.sin(2 * np.pi * 73 * times)
            + 0.55 * np.sin(2 * np.pi * 127 * times + 0.7)
            + 0.3 * np.sin(2 * np.pi * 191 * times + 1.2)
        )
        emg.append(envelope * carrier)
    return np.array([*forces, *emg])


def create_demo(path, include_com=False):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    labels = [
        "LFHD",
        "RFHD",
        "LBHD",
        "RBHD",
        "C7",
        "T10",
        "CLAV",
        "STRN",
        "LSHO",
        "LSHO2",
        "LELB",
        "LWRA",
        "LWRB",
        "LFIN",
        "RSHO",
        "RELB",
        "RWRA",
        "RWRB",
        "RFIN",
        "LASI",
        "RASI",
        "LPSI",
        "RPSI",
        "LTHI",
        "LKNE",
        "LTIB",
        "LANK",
        "LHEE",
        "LTOE",
        "RTHI",
        "RKNE",
        "RTIB",
        "RANK",
        "RHEE",
        "RTOE",
    ]
    marker_count = len(labels)
    if include_com:
        # Optional regression fixture only, not a biomechanical COM estimate.
        labels.extend(["Demo:CentreOfMass", "Demo:CentreOfMassFloor"])
    writer = c3d.Writer(point_rate=100, analog_rate=1000, point_scale=-0.01)
    writer.set_point_labels(labels)
    writer.set_analog_labels(
        ["Left force Fz", "Right force Fz", "Left tibialis EMG", "Right tibialis EMG"]
    )
    writer.analog_group.add_str("UNITS", "", "N  N  mV mV ", 3, 4)
    frames = []
    for frame in range(800):
        time = frame / 100
        pose = walking_pose(time)
        points = np.zeros((len(labels), 5), dtype=np.float32)
        points[:marker_count, :3] = [pose[name] for name in labels[:marker_count]]
        points[:, 3], points[:, 4] = 0.3, 7
        if include_com:
            phase = time * 2 * np.pi * STRIDE_HZ
            points[-2, :3] = [20, 30 + 40 * np.sin(phase), 1000 + 10 * np.cos(phase * 2)]
            points[-1, :3] = [*points[-2, :2], 0]
        times = time + np.arange(10) / 1000
        analog = walking_signals(times)
        if 290 <= frame < 310:
            points[10, 3] = -1
        frames.append((points, analog))
    writer.add_frames(frames)
    group = writer.add_group(10, "EVENT", "Synthetic gait events")
    event_times = np.array(
        [
            [0, t]
            for t in [
                0.56,
                1.11,
                1.67,
                2.22,
                2.78,
                3.33,
                3.89,
                4.44,
                5,
                5.56,
                6.11,
                6.67,
                7.22,
            ]
        ]
    )
    n = len(event_times)
    group.add_param("USED", bytes_per_element=2, bytes=struct.pack("<H", n))
    group.add_param(
        "TIMES",
        bytes_per_element=4,
        dimensions=[2, n],
        bytes=event_times.astype("<f4").tobytes(),
    )
    group.add_param("LABELS", bytes_per_element=-1, dimensions=[11, n], bytes=b"Foot Strike" * n)
    group.add_param(
        "CONTEXTS",
        bytes_per_element=-1,
        dimensions=[5, n],
        bytes=b"".join(b"Left " if i % 2 == 0 else b"Right" for i in range(n)),
    )
    with path.open("wb") as stream:
        writer.write(stream)
    return path
