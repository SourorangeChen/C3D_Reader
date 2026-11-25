// Pure rules behind the time-alignment dialog (SyncSettings).
import type { Acquisition } from "./types";
import type { AlignmentChoice, AlignmentEstimate } from "./synchronization";

/** A typed time in seconds; empty or non-numeric text is an error. */
export function timeValue(text: string) {
  if (!text.trim() || !Number.isFinite(Number(text)))
    throw new Error("请输入有效的时间数值。");
  return Number(text);
}

/**
 * The COM row to preselect for the open C3D: the only row, or the only row
 * whose trial name matches the file name; -1 when the choice is the user's.
 */
export function matchingChoice(rows: AlignmentChoice[], fileName: string) {
  if (rows.length === 1) return 0;
  const stem = fileName.replace(/\.c3d$/i, "").toLowerCase();
  const matches = rows
    .map((row, i) => ({ row, i }))
    .filter(
      ({ row }) => row.trial.replace(/\.c3d$/i, "").toLowerCase() === stem,
    );
  return matches.length === 1 ? matches[0].i : -1;
}

/** The PTS origin stored in a c3d-reader-sync file, if any. */
export function savedOrigin(text: string): number | null {
  const saved = JSON.parse(text);
  return saved.format === "c3d-reader-sync" &&
    Number.isFinite(saved.video_pts_origin_s)
    ? saved.video_pts_origin_s
    : null;
}

export const ESTIMATE_REASONS: Record<string, string> = {
  preset_signal_quality_passed: "候选通过质量检查，应用后仍需目视复核。",
  no_usable_signal_or_coverage:
    "没有足够的有效信号覆盖，请检查时间基线和区间。",
  search_or_coverage_boundary:
    "最优值位于搜索或覆盖边界，请检查基线并扩大搜索范围。",
  low_correlation: "信号相关性不足，请检查通道、方向与动作区间。",
  ambiguous_competing_peak:
    "存在相近的竞争峰，重复步态可能产生歧义，请缩小范围或更换同步动作。",
};

/**
 * SVG path of the signed correlation curve in a 340×78 box (r = 1 at the
 * top, r = −1 at the bottom); samples without a correlation break the line.
 */
export function correlationPath(curve: AlignmentEstimate["curve"]) {
  let path = "",
    disconnected = true;
  curve.forEach((point, i) => {
    if (point.correlation == null) {
      disconnected = true;
      return;
    }
    const x = 8 + (i / Math.max(1, curve.length - 1)) * 324,
      y = 8 + (1 - point.correlation) * 30;
    path += `${disconnected ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    disconnected = false;
  });
  return path;
}

export type SignalSearch = {
  column: string;
  reference: string;
  axis: string;
  direction: string;
  low: string;
  high: string;
  step: string;
  gap: string;
};

/** Body of POST /api/files/{id}/alignment for a video signal column. */
export function estimateRequest(
  signal: { times: number[]; values: (number | null)[] },
  search: SignalSearch,
  baseline: string,
  roi: [number, number],
) {
  const [kind, channel] = search.reference.split(":");
  return {
    times: signal.times,
    values: signal.values,
    kind,
    channel: Number(channel),
    axis: Number(search.axis),
    direction: Number(search.direction),
    start: roi[0],
    stop: roi[1] + 1,
    baseline: timeValue(baseline),
    low: timeValue(search.low),
    high: timeValue(search.high),
    step: timeValue(search.step),
    maxGap: timeValue(search.gap),
  };
}

/** Evidence saved with a signal-based lag. */
export function signalEvidence(
  signalFile: string,
  search: SignalSearch,
  roi: [number, number],
  meta: Pick<Acquisition, "firstFrame">,
  estimate: AlignmentEstimate,
) {
  return {
    signal_file: signalFile,
    column: search.column,
    reference: search.reference,
    axis: Number(search.axis),
    direction: Number(search.direction),
    frame_range: roi.map((frame) => frame + meta.firstFrame),
    search: {
      low: Number(search.low),
      high: Number(search.high),
      step: Number(search.step),
      max_gap: Number(search.gap),
    },
    quality: {
      min_coverage: 0.95,
      min_correlation: 0.5,
      peak_separation: 0.25,
      min_peak_margin: 0.02,
    },
    result: estimate,
  };
}
