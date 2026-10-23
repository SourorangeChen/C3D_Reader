"""Sample a private dataset without copying it or emitting participant names.

Run: python -m scripts.validate_local /path/to/Vicon
"""

import argparse
import json
import struct
import time
from pathlib import Path

import c3d
import numpy as np

from backend.acquisition import Acquisition


def validate(folder):
    started = time.perf_counter()
    files = sorted(
        p for p in folder.iterdir() if p.suffix.lower() == ".c3d" and not p.name.startswith(".")
    )
    if not files:
        raise ValueError("No C3D files in the selected folder.")
    total_bytes = 0
    max_point_error = 0.0
    max_analog_error = 0.0
    for path in files:
        acquisition = Acquisition(path)
        with path.open("rb") as stream:
            reader = c3d.Reader(stream)

            def concatenate(key, attr, default):
                chunks = []
                for suffix in ["", *map(str, range(2, 100))]:
                    param = reader.get(key + suffix)
                    if param is None:
                        break
                    chunks.extend(np.asarray(getattr(param, attr)).ravel())
                result = np.full(reader.analog_used, default, dtype=float)
                result[: len(chunks)] = chunks
                return result

            scales = concatenate("ANALOG:SCALE", "float_array", 1.0)
            general = reader.get("ANALOG:GEN_SCALE")
            scales *= general.float_value if general else 1.0
            offsets = concatenate(
                "ANALOG:OFFSET",
                "uint16_array" if reader.analog_format_unsigned else "int16_array",
                0.0,
            )
            reader.get_analog_transform = lambda: (
                np.broadcast_to(scales[:, None], (reader.analog_used, reader.analog_per_frame)),
                np.broadcast_to(offsets[:, None], (reader.analog_used, reader.analog_per_frame)),
            )
            channels = sorted(
                {
                    c
                    for c in [0, 128, 254, 255, acquisition.nanalog - 1]
                    if 0 <= c < acquisition.nanalog
                }
            )
            for i, (_, points, analog) in enumerate(reader.read_frames()):
                xyz, residual = acquisition.points(i, i + 1)
                valid = points[:, 3] >= 0
                np.testing.assert_allclose(xyz[0, valid], points[valid, :3], rtol=1e-6, atol=1e-5)
                np.testing.assert_allclose(residual[0], points[:, 3], atol=1e-6)
                max_point_error = max(
                    max_point_error,
                    float(np.max(np.abs(xyz[0, valid] - points[valid, :3]), initial=0)),
                )
                for channel in channels:
                    values = acquisition.analog(channel, i, i + 1)
                    np.testing.assert_allclose(values, analog[channel], rtol=1e-9, atol=1e-9)
                    max_analog_error = max(
                        max_analog_error, float(np.max(np.abs(values - analog[channel]), initial=0))
                    )
                if i >= 2:
                    break
            endian = ">" if reader._dtypes.is_mips else "<"
            floating = acquisition.scale < 0
            point_format, word_bytes = ("f", 4) if floating else ("h", 2)
            analog_format = "f" if floating else ("H" if reader.analog_format_unsigned else "h")
            for i in sorted({0, acquisition.count // 2, acquisition.count - 1}):
                stream.seek(
                    (reader._header.data_block - 1) * 512 + i * acquisition.data.dtype.itemsize
                )
                raw = np.array(
                    struct.unpack(
                        endian + point_format * (acquisition.npoints * 4),
                        stream.read(acquisition.npoints * 4 * word_bytes),
                    )
                ).reshape(acquisition.npoints, 4)
                xyz, _ = acquisition.points(i, i + 1)
                valid = (raw[:, 3] >= 0) & np.isfinite(raw).all(axis=1)
                expected = raw[valid, :3] * (1 if floating else acquisition.scale)
                np.testing.assert_allclose(xyz[0, valid], expected, rtol=1e-6, atol=1e-5)
                raw_analog = np.array(
                    struct.unpack(
                        endian + analog_format * (acquisition.nanalog * acquisition.samples),
                        stream.read(acquisition.nanalog * acquisition.samples * word_bytes),
                    )
                ).reshape(acquisition.samples, acquisition.nanalog)
                for channel in channels:
                    np.testing.assert_allclose(
                        acquisition.analog(channel, i, i + 1),
                        (raw_analog[:, channel] - offsets[channel]) * scales[channel],
                        rtol=1e-9,
                        atol=1e-9,
                    )
        acquisition.metadata()
        total_bytes += path.stat().st_size
    return {
        "files": len(files),
        "bytes": total_bytes,
        "seconds": round(time.perf_counter() - started, 3),
        "max_sampled_point_difference": max_point_error,
        "max_sampled_analog_difference": max_analog_error,
        "random_record_positions": ["first", "middle", "last"],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("folder", type=Path)
    args = parser.parse_args()
    print(json.dumps(validate(args.folder), indent=2))
