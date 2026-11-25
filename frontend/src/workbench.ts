import { isVirtual } from "./types";
import { isImage, isVideo } from "./synchronization";
import type { Acquisition, Point, Selection } from "./types";

export type FrameRange = [number, number];

// Frame reached after `elapsedMs` of playback from `initial`. Past the end it
// wraps inside `range` when looping, otherwise it stops on the last frame.
export function playbackFrame(
  initial: number,
  elapsedMs: number,
  pointRate: number,
  speed: number,
  range: FrameRange,
  loop: boolean,
) {
  const next =
    initial + Math.floor((Math.max(0, elapsedMs) / 1000) * pointRate * speed);
  if (next <= range[1]) return { frame: next, stopped: false };
  if (!loop) return { frame: range[1], stopped: true };
  return {
    frame: range[0] + ((next - range[0]) % (range[1] - range[0] + 1)),
    stopped: false,
  };
}

export const clampFrame = (index: number, [low, high]: FrameRange) =>
  Math.max(low, Math.min(high, index));

// Rounded, ordered observation range inside the acquisition, or null for
// non-finite input.
export function observationRange(
  a: number,
  b: number,
  frameCount: number,
): FrameRange | null {
  if (!Number.isFinite(a + b)) return null;
  const start = clampFrame(Math.round(a), [0, frameCount - 1]);
  return [start, clampFrame(Math.round(b), [start, frameCount - 1])];
}

// Opening an acquisition selects LANK when present, else the first real marker.
export function defaultSelection(points: Point[]): Selection {
  const preferred =
    points.find((p) => p.label.endsWith("LANK")) ||
    points.find((p) => p.kind === "marker" && !isVirtual(p)) ||
    points[0];
  return { kind: preferred ? "point" : "analog", id: preferred?.id || 0 };
}

export const virtualPointIds = (points: Point[]) =>
  new Set(points.filter(isVirtual).map((p) => p.id));

export function toggled(set: Set<number>, id: number) {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

// Shows or hides every Vicon local-coordinate point, keeping other choices.
export function withVirtualPoints(
  hidden: Set<number>,
  points: Point[],
  show: boolean,
) {
  const next = new Set(hidden);
  for (const p of points.filter(isVirtual)) {
    if (show) next.delete(p.id);
    else next.add(p.id);
  }
  return next;
}

export function channelLists(
  meta: Acquisition | null,
  tab: string,
  showVirtual: boolean,
  search: string,
) {
  const query = search.toLowerCase();
  const points = meta?.points || [];
  return {
    points: points.filter(
      (p) =>
        (tab === "marker"
          ? p.kind === "marker" && (showVirtual || !isVirtual(p))
          : p.kind !== "marker") && p.label.toLowerCase().includes(query),
    ),
    analogs: (meta?.analogs || []).filter((p) =>
      p.label.toLowerCase().includes(query),
    ),
    markerCount: points.filter((p) => p.kind === "marker" && !isVirtual(p))
      .length,
    modelCount: points.filter((p) => p.kind !== "marker").length,
  };
}

// The selected point or analog channel with its display label and unit.
export function selectedChannel(
  meta: Acquisition | null,
  selection: Selection,
) {
  const point = selection.kind === "point" ? meta?.points[selection.id] : null;
  const analog =
    selection.kind === "analog" ? meta?.analogs[selection.id] : null;
  return {
    point,
    analog,
    label: point?.label || analog?.label || "",
    unit: point?.unit || analog?.unit || "",
  };
}

// What a set of files dropped on the window is: one video or an image
// sequence for the media panel, a single C3D to open, or neither.
export function droppedFiles(
  files: File[],
): "media" | "c3d" | "invalid" | null {
  if (!files.length) return null;
  if ((files.length === 1 && isVideo(files[0])) || files.every(isImage))
    return "media";
  return files.length === 1 && /\.c3d$/i.test(files[0].name)
    ? "c3d"
    : "invalid";
}
