"""Memory-mapped C3D access. Coordinates remain in the acquisition's units.

py-c3d owns metadata decoding; numpy maps the interleaved data section without
loading a trial into RAM. Vicon's numbered parameter arrays are concatenated.
"""

import csv
import io
import math
import re
from pathlib import Path

import c3d
import numpy as np


def point_role(label):
    """Recognize named, source-provided whole-body COM channels, not estimates.

    Vicon subject prefixes are retained in labels/exports. Exact normalized
    suffixes avoid matching unrelated markers or segment-specific COM labels.
    """
    name = re.sub(r"[\s_-]+", "", label.rsplit(":", 1)[-1].strip().lower())
    if name in ("centreofmass", "centerofmass", "com"):
        return "centerOfMass"
    if name in ("centreofmassfloor", "centerofmassfloor", "comfloor"):
        return "centerOfMassFloor"
    return None


def clean_json(value):
    if isinstance(value, np.ndarray):
        return clean_json(value.tolist())
    if isinstance(value, np.generic):
        return clean_json(value.item())
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, (list, tuple)):
        return [clean_json(v) for v in value]
    if isinstance(value, dict):
        return {k: clean_json(v) for k, v in value.items()}
    return value


class MetadataReader(c3d.Reader):
    @property
    def first_frame(self):
        # py-c3d 0.6 multiplies the high word by 65535. The C3D standard
        # defines two unsigned 16-bit words, so the multiplier is 65536.
        param = self.get("TRIAL:ACTUAL_START_FIELD")
        if param is not None:
            words = np.asarray(param.uint16_array).ravel()
            return int(words[0]) + (int(words[1]) << 16)
        return int(self.header.first_frame)


class Acquisition:
    def __init__(self, path):
        self.path = Path(path)
        stat = self.path.stat()
        self.fingerprint = (stat.st_size, stat.st_mtime_ns, stat.st_ino)
        if stat.st_size < 512:
            raise ValueError("Truncated C3D header: a complete 512-byte header is required.")
        with self.path.open("rb") as stream:
            self.reader = MetadataReader(stream)
        r = self.reader
        if r._dtypes.is_dec:
            raise ValueError("DEC/VAX C3D is not supported. Re-export as Intel/IEEE C3D.")
        self.npoints, self.nanalog = r.point_used, r.analog_used
        self.samples = int(r.analog_per_frame)
        self.rate, self.analog_rate = float(r.point_rate), float(r.analog_rate)
        self.first, self.last = int(r.first_frame), int(r.last_frame)
        self.count = self.last - self.first + 1
        self.scale = float(r.point_scale)
        if self.count < 1 or self.rate <= 0 or not math.isfinite(self.rate):
            raise ValueError("Invalid C3D frame range or sampling rate.")
        if self.nanalog and (
            self.samples < 1 or not np.isclose(self.analog_rate, self.rate * self.samples)
        ):
            raise ValueError("Analog rate must be an integer multiple of point rate.")
        is_float = self.scale < 0
        pdtype = r._dtypes.float32 if is_float else r._dtypes.int16
        adtype = (
            r._dtypes.float32
            if is_float
            else (r._dtypes.uint16 if r.analog_format_unsigned else r._dtypes.int16)
        )
        dtype = np.dtype(
            [
                ("points", pdtype, (self.npoints, 4)),
                ("analog", adtype, (self.samples, self.nanalog)),
            ]
        )
        if dtype.itemsize == 0:
            raise ValueError("The acquisition has no point or analog data.")
        offset = (r._header.data_block - 1) * 512
        if offset < 512 or offset + dtype.itemsize * self.count > self.path.stat().st_size:
            raise ValueError("Truncated C3D data: file is shorter than its declared frame range.")
        self.data = np.memmap(self.path, dtype=dtype, mode="r", offset=offset, shape=(self.count,))
        self.point_labels = self.labels("POINT:LABELS", self.npoints, "Point")
        self.point_roles = [point_role(label) for label in self.point_labels]
        self.analog_labels = self.labels("ANALOG:LABELS", self.nanalog, "Analog")
        self.point_unit = self.text("POINT:UNITS", "mm")
        self.analog_units = self.labels("ANALOG:UNITS", self.nanalog, "")
        self.scales = self.numeric("ANALOG:SCALE", self.nanalog, 1.0, "float_array")
        offset_type = "uint16_array" if r.analog_format_unsigned else "int_array"
        self.offsets = self.numeric("ANALOG:OFFSET", self.nanalog, 0.0, offset_type)
        gen = r.get("ANALOG:GEN_SCALE")
        self.scales *= float(gen.float_value) if gen else 1.0
        self.kinds = ["marker"] * self.npoints
        self.units = [self.point_unit] * self.npoints
        for plural, kind, fallback in [
            ("ANGLES", "angle", "deg"),
            ("FORCES", "force", "N"),
            ("MOMENTS", "moment", "Nmm"),
            ("POWERS", "power", "W"),
            ("SCALARS", "scalar", ""),
        ]:
            names = set(self.strings("POINT:" + plural))
            for i, label in enumerate(self.point_labels):
                if label in names:
                    self.kinds[i] = kind
                    self.units[i] = self.text("POINT:" + kind.upper() + "_UNITS", fallback)
        self.events = self.read_events()
        self.plates = self.read_plates()
        self.segments = self.infer_segments()

    def strings(self, key):
        parts = []
        for suffix in ["", *map(str, range(2, 100))]:
            p = self.reader.get(key + suffix)
            if p is None:
                break
            parts.extend(str(s).strip(" \x00") for s in np.asarray(p.string_array).ravel())
        return parts

    def labels(self, key, count, fallback):
        labels = self.strings(key)
        return [
            (
                labels[i]
                if i < len(labels) and labels[i]
                else (f"{fallback} {i + 1}" if fallback else "")
            )
            for i in range(count)
        ]

    def numeric(self, key, count, default, attr):
        values = []
        for suffix in ["", *map(str, range(2, 100))]:
            p = self.reader.get(key + suffix)
            if p is None:
                break
            values.extend(
                np.asarray(
                    getattr(p, attr)
                    if p.dimensions
                    else getattr(p, attr.replace("_array", "_value"))
                ).ravel()
            )
        out = np.full(count, default, dtype=np.float64)
        out[: min(count, len(values))] = values[:count]
        return out

    def text(self, key, fallback=""):
        p = self.reader.get(key)
        return p.string_value.strip(" \x00") if p else fallback

    def read_events(self):
        labels, contexts = self.strings("EVENT:LABELS"), self.strings("EVENT:CONTEXTS")
        times = self.reader.get("EVENT:TIMES")
        events = []
        if times and times.num_elements:
            for i, row in enumerate(times.float_array.reshape(-1, 2)):
                absolute = float(row[0] * 60 + row[1])
                # C3D event time zero corresponds to acquisition frame 1.
                frame = int(round(absolute * self.rate)) + 1
                events.append(
                    dict(
                        label=labels[i] if i < len(labels) else "Event",
                        context=contexts[i] if i < len(contexts) else "",
                        frame=frame,
                        time=(frame - self.first) / self.rate,
                    )
                )
        else:
            h = self.reader._header
            for label, time, visible in zip(h.event_labels, h.event_timings, h.event_disp_flags):
                if visible:
                    frame = int(round(float(time) * self.rate)) + 1
                    events.append(
                        dict(
                            label=str(label).strip(),
                            context="",
                            frame=frame,
                            time=(frame - self.first) / self.rate,
                        )
                    )
        return sorted(events, key=lambda e: e["frame"])

    def read_plates(self):
        corners, types = (
            self.reader.get("FORCE_PLATFORM:CORNERS"),
            self.reader.get("FORCE_PLATFORM:TYPE"),
        )
        if corners is None or not corners.num_elements:
            return []
        return [
            dict(
                id=i,
                type=int(np.asarray(types.int_array).ravel()[i]) if types else 0,
                corners=clean_json(c),
            )
            for i, c in enumerate(corners.float_array.reshape(-1, 4, 3))
        ]

    def infer_segments(self):
        # An explicitly labelled, optional display aid, never a fitted skeleton.
        pairs = [
            ("LASI", "RASI"),
            ("LASI", "LPSI"),
            ("RASI", "RPSI"),
            ("LPSI", "RPSI"),
            ("LFHD", "RFHD"),
            ("LFHD", "LBHD"),
            ("RFHD", "RBHD"),
            ("LBHD", "RBHD"),
            ("C7", "T10"),
            ("C7", "LSHO"),
            ("C7", "RSHO"),
            ("C7", "LBHD"),
            ("C7", "RBHD"),
            ("T10", "LPSI"),
            ("T10", "RPSI"),
            ("CLAV", "STRN"),
            ("CLAV", "LSHO"),
            ("CLAV", "RSHO"),
            ("STRN", "LASI"),
            ("STRN", "RASI"),
            ("LSHO", "RSHO"),
            ("LSHO", "LSHO2"),
            ("LSHO", "LELB"),
            ("LELB", "LWRA"),
            ("LELB", "LWRB"),
            ("LWRA", "LWRB"),
            ("LWRA", "LFIN"),
            ("LWRB", "LFIN"),
            ("RSHO", "RELB"),
            ("RELB", "RWRA"),
            ("RELB", "RWRB"),
            ("RWRA", "RWRB"),
            ("RWRA", "RFIN"),
            ("RWRB", "RFIN"),
            ("LASI", "LKNE"),
            ("LKNE", "LANK"),
            ("LANK", "LHEE"),
            ("LHEE", "LTOE"),
            ("LANK", "LTOE"),
            ("RASI", "RKNE"),
            ("RKNE", "RANK"),
            ("RANK", "RHEE"),
            ("RHEE", "RTOE"),
            ("RANK", "RTOE"),
        ]
        by_subject = {}
        for i, label in enumerate(self.point_labels):
            if self.kinds[i] != "marker":
                continue
            prefix, _, short = label.rpartition(":")
            by_subject.setdefault(prefix, {})[short.upper()] = i
        return [
            [group[a], group[b]]
            for group in by_subject.values()
            for a, b in pairs
            if a in group and b in group
        ]

    def points(self, start, stop, step=1):
        raw = self.data["points"][start:stop:step]
        xyz = np.array(raw[..., :3], dtype=np.float32)
        if self.scale >= 0:
            xyz *= self.scale
        word = raw[..., 3]
        valid = (word >= 0) & np.isfinite(raw).all(axis=-1)
        xyz[~valid] = np.nan
        residual = (np.nan_to_num(word).astype(np.int32) & 255) * abs(self.scale)
        residual = np.where(valid, residual, -1)
        return xyz, residual

    def analog(self, channel, start, stop):
        raw = self.data["analog"][start:stop, :, channel].astype(np.float64).reshape(-1)
        return (raw - self.offsets[channel]) * self.scales[channel]

    def bounds(self):
        ids = [i for i, k in enumerate(self.kinds) if k == "marker"]
        xyz, _ = self.points(0, self.count, max(1, self.count // 150))
        valid = xyz[:, ids, :].reshape(-1, 3)
        valid = valid[np.isfinite(valid).all(axis=1)]
        if not len(valid):
            return [[-1000, -1000, 0], [1000, 1000, 2000]]
        # Robust view fit, so one tracking outlier cannot hide the subject.
        return np.percentile(valid, [1, 99], axis=0).tolist()

    def metadata(self):
        return dict(
            name=self.path.name,
            size=self.path.stat().st_size,
            firstFrame=self.first,
            lastFrame=self.last,
            frameCount=self.count,
            pointRate=self.rate,
            analogRate=self.analog_rate,
            samplesPerFrame=self.samples,
            duration=self.count / self.rate,
            pointUnit=self.point_unit,
            points=[
                dict(
                    id=i, label=n, kind=self.kinds[i], unit=self.units[i], role=self.point_roles[i]
                )
                for i, n in enumerate(self.point_labels)
            ],
            analogs=[
                dict(id=i, label=n, unit=self.analog_units[i])
                for i, n in enumerate(self.analog_labels)
            ],
            events=self.events,
            plates=self.plates,
            segments=self.segments,
            bounds=self.bounds(),
            manufacturer=self.text("MANUFACTURER:COMPANY"),
            storage="float32" if self.scale < 0 else "int16",
        )

    def parameters(self):
        groups = []
        for name, group in self.reader.group_items():
            params = []
            for key, param in group.param_items():
                try:
                    if param.bytes_per_element == -1:
                        val = param.string_array if param.dimensions else param.string_value
                    elif param.bytes_per_element == 4:
                        val = param.float_array if param.dimensions else param.float_value
                    else:
                        val = (
                            param.int_array
                            if param.dimensions
                            else param._as(
                                param._dtypes.int16
                                if param.bytes_per_element == 2
                                else param._dtypes.int8
                            )
                        )
                    val = clean_json(val)
                except (ValueError, TypeError, AssertionError):
                    val = f"{len(param.bytes)} bytes"
                params.append(
                    dict(
                        name=key,
                        description=param.desc,
                        dimensions=param.dimensions,
                        value=val,
                    )
                )
            groups.append(dict(name=name, parameters=params))
        return groups

    def csv_rows(self, kind, indices, start, stop, progress=None):
        # Bound work per chunk by channel/sample count as well as frame count.
        # A fixed 512-frame analog block can contain millions of CSV cells.
        cells_per_frame = max(1, len(indices) * (4 if kind == "point" else self.samples))
        block_frames = max(1, min(256, 65536 // cells_per_frame))
        if progress:
            progress(0, stop - start)
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        if kind == "point":
            writer.writerow(
                ["frame", "time_s"]
                + [
                    f"{self.point_labels[i]}:{axis} ({self.units[i]})"
                    for i in indices
                    for axis in ("X", "Y", "Z", "residual")
                ]
            )
        else:
            writer.writerow(
                ["sample", "frame", "time_s"]
                + [f"{self.analog_labels[i]} ({self.analog_units[i]})" for i in indices]
            )
        yield buffer.getvalue()
        for base in range(start, stop, block_frames):
            end = min(stop, base + block_frames)
            buffer.seek(0)
            buffer.truncate(0)
            if kind == "point":
                xyz, residual = self.points(base, end)
                selected = xyz[:, indices, :]
                cells = np.empty((end - base, len(indices), 4), dtype=object)
                cells[..., :3] = selected
                cells[..., :3][~np.isfinite(selected)] = ""
                cells[..., 3] = residual[:, indices].astype(np.float64)
                for j, row in enumerate(cells.reshape(end - base, -1).tolist()):
                    writer.writerow([base + j + self.first, (base + j) / self.rate] + row)
            else:
                values = np.column_stack([self.analog(i, base, end) for i in indices])
                cells = values.astype(object)
                cells[~np.isfinite(values)] = ""
                for j, row in enumerate(cells.tolist()):
                    sample = base * self.samples + j
                    writer.writerow(
                        [
                            sample,
                            self.first + sample // self.samples,
                            sample / self.analog_rate,
                        ]
                        + row
                    )
            yield buffer.getvalue()
            if progress:
                progress(end - start, stop - start)
