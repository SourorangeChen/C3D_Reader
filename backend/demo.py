"""Deterministic, synthetic walking trial. Contains no participant data."""

import struct
from pathlib import Path

import c3d
import numpy as np


def create_demo(path):
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
    base = np.array(
        [
            [-70, 20, 1720],
            [70, 20, 1720],
            [-70, -100, 1720],
            [70, -100, 1720],
            [0, -75, 1470],
            [0, -80, 1170],
            [0, 65, 1460],
            [0, 70, 1270],
            [-200, 0, 1450],
            [-210, -20, 1440],
            [-280, 10, 1140],
            [-300, 60, 880],
            [-320, 40, 880],
            [-310, 100, 810],
            [200, 0, 1450],
            [280, -10, 1140],
            [300, -60, 880],
            [320, -40, 880],
            [310, -100, 810],
            [-120, 70, 940],
            [120, 70, 940],
            [-95, -90, 940],
            [95, -90, 940],
            [-150, 0, 720],
            [-120, 0, 500],
            [-150, 20, 300],
            [-120, 0, 90],
            [-120, -75, 45],
            [-120, 170, 35],
            [150, 0, 720],
            [120, 0, 500],
            [150, 20, 300],
            [120, 0, 90],
            [120, -75, 45],
            [120, 170, 35],
        ],
        dtype=float,
    )
    writer = c3d.Writer(point_rate=100, analog_rate=1000, point_scale=-0.01)
    writer.set_point_labels(labels)
    writer.set_analog_labels(
        ["Left force Fz", "Right force Fz", "Left tibialis EMG", "Right tibialis EMG"]
    )
    writer.analog_group.add_str("UNITS", "", "N  N  mV mV ", 3, 4)
    frames = []
    for frame in range(800):
        time = frame / 100
        phase = time * 2 * np.pi * 0.9
        points = np.zeros((len(base), 5), dtype=np.float32)
        points[:, :3] = base
        points[:, 3], points[:, 4] = 0.3, 7
        for i, name in enumerate(labels):
            side = 1 if name.startswith("L") else -1
            if any(s in name for s in ("KNE", "TIB", "ANK", "HEE", "TOE", "THI")):
                points[i, 1] += np.sin(phase) * side * 210
                points[i, 2] += max(0, np.sin(phase) * side) * (55 if "THI" not in name else 10)
            elif any(s in name for s in ("ELB", "WRA", "WRB", "FIN")):
                points[i, 1] -= np.sin(phase) * side * 150
            points[i, 2] += 14 * np.cos(phase * 2)
        times = time + np.arange(10) / 1000
        wave = np.sin(times * 2 * np.pi * 0.9)
        analog = np.array(
            [
                np.maximum(0, wave) * 690,
                np.maximum(0, -wave) * 690,
                (np.sin(times * 390) + np.sin(times * 713)) * np.maximum(0, wave) * 0.25,
                (np.sin(times * 440) + np.sin(times * 653)) * np.maximum(0, -wave) * 0.25,
            ]
        )
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
