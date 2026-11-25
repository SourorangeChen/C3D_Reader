import { describe, expect, test } from "vitest";
import type { Acquisition, Point } from "../../frontend/src/types";
import {
  channelLists,
  defaultSelection,
  droppedFiles,
  observationRange,
  playbackFrame,
  toggled,
  virtualPointIds,
  withVirtualPoints,
} from "../../frontend/src/workbench";

const point = (id: number, label: string, kind = "marker"): Point => ({
  id,
  label,
  kind,
  unit: "mm",
});

describe("playbackFrame", () => {
  test("advances by recording time and speed", () => {
    expect(playbackFrame(10, 500, 100, 1, [0, 799], true)).toEqual({
      frame: 60,
      stopped: false,
    });
    expect(playbackFrame(10, 500, 100, 0.5, [0, 799], true).frame).toBe(35);
    // A first animation timestamp before the start never steps backwards.
    expect(playbackFrame(10, -16, 100, 1, [0, 799], true).frame).toBe(10);
  });

  test("wraps inside the range when looping and stops otherwise", () => {
    expect(playbackFrame(95, 100, 100, 1, [90, 99], true)).toEqual({
      frame: 95,
      stopped: false,
    });
    expect(playbackFrame(95, 100, 100, 1, [90, 99], false)).toEqual({
      frame: 99,
      stopped: true,
    });
  });
});

test("observation ranges are rounded, ordered and inside the recording", () => {
  expect(observationRange(-5, 12.6, 800)).toEqual([0, 13]);
  expect(observationRange(300, 100, 800)).toEqual([300, 300]);
  expect(observationRange(10, 5000, 800)).toEqual([10, 799]);
  expect(observationRange(NaN, 10, 800)).toBeNull();
});

test("default selection prefers LANK, then a real marker", () => {
  const virtual = point(0, "PELO");
  expect(
    defaultSelection([virtual, point(1, "LASI"), point(2, "Sub:LANK")]),
  ).toEqual({ kind: "point", id: 2 });
  expect(defaultSelection([virtual, point(1, "LASI")])).toEqual({
    kind: "point",
    id: 1,
  });
  expect(defaultSelection([])).toEqual({ kind: "analog", id: 0 });
});

test("virtual points can be shown or hidden without losing other choices", () => {
  const points = [point(0, "PELO"), point(1, "LASI"), point(2, "RFEP")];
  expect([...virtualPointIds(points)]).toEqual([0, 2]);
  const hidden = new Set([0, 1, 2]);
  expect([...withVirtualPoints(hidden, points, true)]).toEqual([1]);
  expect([...withVirtualPoints(new Set([1]), points, false)].sort()).toEqual([
    0, 1, 2,
  ]);
  expect([...toggled(new Set([1]), 1)]).toEqual([]);
  expect([...toggled(new Set([1]), 3)]).toEqual([1, 3]);
});

test("channel lists filter by tab, virtual points and search", () => {
  const meta = {
    points: [
      point(0, "LASI"),
      point(1, "PELO"),
      point(2, "LKneeAngles", "angle"),
    ],
    analogs: [
      { id: 0, label: "EMG1", unit: "V" },
      { id: 1, label: "Force.Fz", unit: "N" },
    ],
  } as unknown as Acquisition;
  const markers = channelLists(meta, "marker", false, "");
  expect(markers.points.map((p) => p.label)).toEqual(["LASI"]);
  expect(markers.markerCount).toBe(1);
  expect(markers.modelCount).toBe(1);
  expect(
    channelLists(meta, "marker", true, "pe").points.map((p) => p.label),
  ).toEqual(["PELO"]);
  expect(
    channelLists(meta, "model", false, "").points.map((p) => p.label),
  ).toEqual(["LKneeAngles"]);
  expect(
    channelLists(meta, "marker", false, "fz").analogs.map((p) => p.label),
  ).toEqual(["Force.Fz"]);
  expect(channelLists(null, "marker", false, "").points).toEqual([]);
});

test("dropped files go to the media panel, open as C3D, or are rejected", () => {
  const f = (name: string) => new File([], name);
  expect(droppedFiles([])).toBeNull();
  expect(droppedFiles([f("walk.MOV")])).toBe("media");
  expect(droppedFiles([f("a_1.jpg"), f("a_2.png")])).toBe("media");
  expect(droppedFiles([f("WT01.C3D")])).toBe("c3d");
  expect(droppedFiles([f("a.mp4"), f("b.mp4")])).toBe("invalid");
  expect(droppedFiles([f("WT01.c3d"), f("WT02.c3d")])).toBe("invalid");
  expect(droppedFiles([f("a_1.jpg"), f("WT01.c3d")])).toBe("invalid");
  expect(droppedFiles([f("notes.txt")])).toBe("invalid");
});
