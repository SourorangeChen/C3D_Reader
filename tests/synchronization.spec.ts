import { test, expect } from "@playwright/test";
import {
  commonRange,
  indexImages,
  nearestSample,
  readAlignment,
  readImagePTS,
  readSignalCSV,
  timestampBaseline,
} from "../frontend/src/synchronization";
import type { Acquisition } from "../frontend/src/types";

const meta = {
  name: "WT01.c3d",
  firstFrame: 101,
  frameCount: 800,
  pointRate: 100,
} as Acquisition;
test("timestamp baseline includes crop, timezone and signed measured clock difference", () => {
  expect(
    timestampBaseline(
      "2026-10-28T09:00:00+08:00",
      "2026-10-28T01:00:03Z",
      "2",
      101,
      100,
    ),
  ).toBe(2);
  expect(
    timestampBaseline(
      "2026-10-28T09:00:05+08:00",
      "2026-10-28T01:00:03Z",
      "2",
      101,
      100,
    ),
  ).toBe(-3);
  expect(() =>
    timestampBaseline(
      "2026-10-28T09:00:00",
      "2026-10-28T01:00:03Z",
      "2",
      101,
      100,
    ),
  ).toThrow();
  expect(() =>
    timestampBaseline(
      "2026-10-28T09:00:00+08:00",
      "2026-10-28T01:00:03Z",
      "",
      101,
      100,
    ),
  ).toThrow();
});
test("COM import freezes one accepted-trial median while preserving each baseline", () => {
  const rows = [
    {
      trial: "WT01",
      timestamp_only_start_s: 10,
      residual_correction_s: 0.4,
      status: "accepted",
    },
    {
      trial: "WT02",
      timestamp_only_start_s: 20,
      residual_correction_s: 0.6,
      status: "accepted",
    },
    {
      trial: "WT03",
      timestamp_only_start_s: 30,
      residual_correction_s: 99,
      status: "rejected",
    },
  ];
  const result = readAlignment(JSON.stringify({ trials: rows }), meta);
  expect(result.map((r) => r.lag)).toEqual([0.5, 0.5, 0.5]);
  expect(result.map((r) => r.baseline)).toEqual([10, 20, 30]);
  expect(
    readAlignment(JSON.stringify({ overall_lag_s: 0.7, trials: rows }), meta)[0]
      .lag,
  ).toBe(0.7);
  expect(() =>
    readAlignment(
      JSON.stringify({
        trials: rows.map((r) => ({ ...r, status: "rejected" })),
      }),
      meta,
    ),
  ).toThrow();
  expect(() =>
    readAlignment(
      JSON.stringify({ overall_lag_s: 1, trials: [{ trial: "WT01" }] }),
      meta,
    ),
  ).toThrow();
});
test("saved alignment rejects another acquisition and preserves negative offsets", () => {
  const saved = {
    format: "c3d-reader-sync",
    version: 1,
    acquisition: meta,
    baseline: -2,
    overall_lag_s: 0.3,
  };
  expect(readAlignment(JSON.stringify(saved), meta)[0].baseline).toBe(-2);
  expect(() =>
    readAlignment(JSON.stringify(saved), { ...meta, firstFrame: 102 }),
  ).toThrow();
});
test("image sequence keeps source frame gaps and rejects duplicates", () => {
  const frames = indexImages([
    new File([""], "frame_0100.png"),
    new File([""], "frame_0002.png"),
    new File([""], "frame_0010.png"),
  ]);
  expect(frames.map((f) => f.frame)).toEqual([2, 10, 100]);
  expect(() =>
    indexImages([new File([""], "frame_2.jpg"), new File([""], "frame_2.png")]),
  ).toThrow();
  expect(() => indexImages([new File([""], "unknown.jpg")])).toThrow();
  expect(
    readImagePTS("frame,video_pts_s\n2,0.08\n10,0.41\n100,4.2", frames),
  ).toEqual([0.08, 0.41, 4.2]);
  expect(() =>
    readImagePTS("frame,video_pts_s\n2,0.08\n10,0.41", frames),
  ).toThrow();
  expect(
    readImagePTS("frame,video_pts_s\n1,0.08\n9,0.41\n99,4.2", frames, 1),
  ).toEqual([0.08, 0.41, 4.2]);
});
test("video signal import preserves missing and invalid evaluation intervals", () => {
  const csv =
    '\uFEFFvideo_pts_s,"height, m",evaluation_valid,frame\n' +
    Array.from(
      { length: 10 },
      (_, i) =>
        `${i / 10},${i === 3 ? "" : i},${i === 5 ? "False" : "True"},${i}`,
    ).join("\r\n");
  const data = readSignalCSV(csv);
  expect(data.columns["height, m"][3]).toBeNull();
  expect(data.columns["height, m"][5]).toBeNull();
  expect(data.columns.frame).toBeUndefined();
  expect(() => readSignalCSV(csv.replace("0.2,", "0.1,"))).toThrow();
});
test("coverage intersects without clamping unmatched media into valid time", () => {
  expect(commonRange(meta, [0, 799], 0, 3, -1)).toEqual([100, 400]);
  expect(commonRange(meta, [0, 799], 0, 3, 4)).toBeNull();
  expect(nearestSample([0, 0.1, 1], 0.08)).toBe(1);
  expect(nearestSample([0, 0.1, 1], 0.8)).toBe(2);
});
