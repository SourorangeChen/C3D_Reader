import { test, expect } from "vitest";
import {
  cameraOffset,
  isLeftMarker,
  labelPosition,
  markerShown,
  pointAt,
  sceneFrame,
  segmentPositions,
  trailPositions,
  trailWindow,
} from "../../frontend/src/sceneGeometry";
import type { Point } from "../../frontend/src/types";

const bounds = [
  [-1000, 0, 0],
  [3000, 2000, 1800],
];
const marker = (id: number, label: string, kind = "marker"): Point =>
  ({ id, label, kind, unit: "mm" }) as Point;

test("Z-up millimetres become Y-up metres centred on the volume", () => {
  const frame = sceneFrame({ pointUnit: "mm", bounds }, "Z");
  // Centre (1000, 1000, 900): X and Y are centred, height keeps the floor at 0.
  expect(frame.transform(1000, 1000, 0).toArray()).toEqual([0, 0, -0]);
  expect(frame.transform(2000, 1500, 900).toArray()).toEqual([1, 0.9, -0.5]);
  expect(frame.target.toArray()).toEqual([0, 0.9, 0]);
  expect(frame.span).toBe(4);
  expect(frame.distance).toBeCloseTo(4.6);
  expect(frame.gridSize).toBe(8);
});

test("Y-up data keeps its height and centres depth", () => {
  const frame = sceneFrame(
    {
      pointUnit: "M",
      bounds: [
        [0, 0, 0],
        [2, 1, 4],
      ],
    },
    "Y",
  );
  expect(frame.transform(1, 0.5, 2).toArray()).toEqual([0, 0.5, 0]);
  expect(frame.target.y).toBe(0.5);
  expect(frame.span).toBe(4);
  // Small volumes still get a usable camera distance and grid.
  const tiny = sceneFrame(
    {
      pointUnit: "cm",
      bounds: [
        [0, 0, 0],
        [10, 10, 1],
      ],
    },
    "Z",
  );
  expect(tiny.span).toBe(1.5);
  expect(tiny.target.y).toBe(0.3);
  expect(tiny.gridSize).toBe(6);
  // Unknown units fall back to millimetres.
  expect(sceneFrame({ pointUnit: "in", bounds }, "Z").span).toBe(4);
});

test("named views place the camera around the target", () => {
  expect(cameraOffset("front", 10).toArray()).toEqual([0, 0, 14]);
  expect(cameraOffset("side", 10).toArray()).toEqual([14, 0, 0]);
  expect(cameraOffset("top", 10).toArray()).toEqual([0, 14, 0.0001]);
  expect(cameraOffset("perspective", 10).toArray()).toEqual([9, 4.5, 10]);
  expect(cameraOffset("unknown", 10).toArray()).toEqual([9, 4.5, 10]);
});

test("markers are shown unless hidden, missing or model outputs", () => {
  const points = new Float32Array([1, 2, 3, NaN, 0, 0, 4, 5, 6]);
  expect(pointAt(points, 0)).toEqual([1, 2, 3]);
  expect(pointAt(points, 1)).toBeNull();
  expect(markerShown(marker(0, "LASI"), 0, points, new Set())).toBe(true);
  expect(markerShown(marker(0, "LASI"), 0, points, new Set([0]))).toBe(false);
  expect(markerShown(marker(1, "RASI"), 1, points, new Set())).toBe(false);
  expect(
    markerShown(marker(2, "LKneeAngles", "angle"), 2, points, new Set()),
  ).toBe(false);
  expect(isLeftMarker("Patient:LASI")).toBe(true);
  expect(isLeftMarker("RASI")).toBe(false);
  expect(isLeftMarker("Patient:")).toBe(false);
});

test("segments skip hidden or missing endpoints", () => {
  const identity = sceneFrame(
    {
      pointUnit: "m",
      bounds: [
        [0, 0, 0],
        [0, 0, 0],
      ],
    },
    "Y",
  ).transform;
  const points = new Float32Array([0, 1, 0, 1, 1, 0, NaN, 0, 0, 2, 2, 2]);
  const pairs: [number, number][] = [
    [0, 1],
    [1, 2],
    [1, 3],
  ];
  expect(segmentPositions(pairs, points, new Set(), identity)).toEqual([
    0, 1, 0, 1, 1, 0, 1, 1, 0, 2, 2, 2,
  ]);
  expect(segmentPositions(pairs, points, new Set([3]), identity)).toEqual([
    0, 1, 0, 1, 1, 0,
  ]);
});

test("trails cover the last 1.5 s and break at missing samples", () => {
  expect(trailWindow(500, 100)).toEqual({ start: 350, count: 151 });
  expect(trailWindow(20, 100)).toEqual({ start: 0, count: 21 });
  const identity = sceneFrame(
    {
      pointUnit: "m",
      bounds: [
        [0, 0, 0],
        [0, 0, 0],
      ],
    },
    "Y",
  ).transform;
  // Two points over three frames; the trail follows point 1.
  const frames = new Float32Array([
    0,
    0,
    0,
    1,
    1,
    1,
    0,
    0,
    0,
    NaN,
    NaN,
    NaN,
    0,
    0,
    0,
    3,
    3,
    3,
  ]);
  const trail = trailPositions(frames, 2, 1, identity);
  expect(trail.slice(0, 3)).toEqual([1, 1, 1]);
  expect(trail.slice(3, 6).every(Number.isNaN)).toBe(true);
  expect(trail.slice(6)).toEqual([3, 3, 3]);
});

test("labels sit beside on-screen markers", () => {
  expect(labelPosition({ x: 0, y: 0, z: 0.5 }, 400, 200)).toEqual({
    left: 209,
    top: 91,
  });
  expect(labelPosition({ x: -0.5, y: 0.5, z: 0 }, 400, 200)).toEqual({
    left: 109,
    top: 41,
  });
  expect(labelPosition({ x: 1.2, y: 0, z: 0 }, 400, 200)).toBeNull();
  expect(labelPosition({ x: 0, y: 0, z: 1 }, 400, 200)).toBeNull();
});
