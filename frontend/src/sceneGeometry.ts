// Pure geometry behind the 3D view: C3D coordinates to scene metres, camera
// framing, which markers are drawn, segment and trail vertices and label
// placement. Viewer.tsx and viewerScene.ts own the WebGL objects.
import { Vector3 } from "three";
import type { Acquisition, Point } from "./types";

export type SceneTransform = (x: number, y: number, z: number) => Vector3;
export type Up = "Z" | "Y";

const UNIT_METRES: Record<string, number> = { mm: 0.001, cm: 0.01, m: 1 };

/**
 * Scene frame for an acquisition: metres, Y up, centred on the capture volume
 * horizontally with the floor kept at zero. Also the camera target, distance
 * and grid size that fit the volume.
 */
export function sceneFrame(
  meta: Pick<Acquisition, "pointUnit" | "bounds">,
  up: Up,
) {
  const factor = UNIT_METRES[meta.pointUnit.toLowerCase()] || 0.001;
  const center = meta.bounds[0].map((v, i) => (v + meta.bounds[1][i]) / 2);
  const transform: SceneTransform = (x, y, z) =>
    up === "Z"
      ? new Vector3(
          (x - center[0]) * factor,
          z * factor,
          -(y - center[1]) * factor,
        )
      : new Vector3(
          (x - center[0]) * factor,
          y * factor,
          (z - center[2]) * factor,
        );
  const height = Math.max(0.3, center[up === "Z" ? 2 : 1] * factor);
  const span = Math.max(
    1.5,
    ...meta.bounds[1].map((v, i) => (v - meta.bounds[0][i]) * factor),
  );
  return {
    transform,
    span,
    distance: span * 1.15,
    target: new Vector3(0, height, 0),
    gridSize: Math.max(6, Math.ceil(span * 2)),
  };
}

/** Camera position relative to the target for a named view. */
export function cameraOffset(view: string, distance: number) {
  const offsets: Record<string, [number, number, number]> = {
    perspective: [distance * 0.9, distance * 0.45, distance],
    front: [0, 0, distance * 1.4],
    side: [distance * 1.4, 0, 0],
    top: [0, distance * 1.4, 0.0001],
  };
  return new Vector3(...(offsets[view] || offsets.perspective));
}

/** Coordinates of point `i` in a frame, or null when any is missing. */
export function pointAt(points: Float32Array, i: number) {
  const x = points[i * 3],
    y = points[i * 3 + 1],
    z = points[i * 3 + 2];
  return Number.isFinite(x + y + z) ? ([x, y, z] as const) : null;
}

/** Markers are drawn unless hidden, missing in this frame, or model outputs. */
export function markerShown(
  point: Point,
  i: number,
  points: Float32Array,
  hidden: Set<number>,
) {
  return point.kind === "marker" && !hidden.has(i) && !!pointAt(points, i);
}

/** Left-side markers (label after any "Subject:" prefix starts with L). */
export function isLeftMarker(label: string) {
  return !!label.split(":").at(-1)?.startsWith("L");
}

/** Line-segment vertices for marker pairs that are visible and present. */
export function segmentPositions(
  pairs: [number, number][],
  points: Float32Array,
  hidden: Set<number>,
  transform: SceneTransform,
) {
  const positions: number[] = [];
  for (const [a, b] of pairs) {
    if (hidden.has(a) || hidden.has(b)) continue;
    const pa = pointAt(points, a),
      pb = pointAt(points, b);
    if (pa && pb)
      positions.push(
        ...transform(...pa).toArray(),
        ...transform(...pb).toArray(),
      );
  }
  return positions;
}

/** Frames of the trail ending at `frame`: the last 1.5 s of the recording. */
export function trailWindow(frame: number, pointRate: number) {
  const start = Math.max(0, frame - Math.round(pointRate * 1.5));
  return { start, count: frame - start + 1 };
}

/**
 * Trail vertices of one point over consecutive frames. Missing samples stay
 * NaN so the line breaks at gaps instead of joining across them.
 */
export function trailPositions(
  frames: Float32Array,
  pointCount: number,
  point: number,
  transform: SceneTransform,
) {
  const positions: number[] = [];
  for (let j = 0; j < frames.length / (pointCount * 3); j++) {
    const i = (j * pointCount + point) * 3;
    positions.push(
      ...transform(frames[i], frames[i + 1], frames[i + 2]).toArray(),
    );
  }
  return positions;
}

/**
 * Screen position of a label for a point projected to normalized device
 * coordinates, offset up and to the right of the marker; null off screen.
 */
export function labelPosition(
  projected: { x: number; y: number; z: number },
  width: number,
  height: number,
) {
  const { x, y, z } = projected;
  if (!(Math.abs(z) < 1 && Math.abs(x) < 1 && Math.abs(y) < 1)) return null;
  return {
    left: (x * 0.5 + 0.5) * width + 9,
    top: (-y * 0.5 + 0.5) * height - 9,
  };
}
