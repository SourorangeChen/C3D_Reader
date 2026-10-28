import type { Acquisition } from "./types";

export type MediaClock = {
  mode: "video" | "images" | null;
  range: [number, number] | null;
};
export type SyncMapping = {
  baseline: number;
  lag: number;
  source: string;
  evidence?: Record<string, unknown>;
};
export type MediaIdentity =
  | { kind: "video"; name: string; size: number }
  | {
      kind: "images";
      files: { name: string; size: number; frame: number }[];
      times: number[];
    };
export type ImageFrame = { file: File; frame: number };
export type AlignmentChoice = SyncMapping & { trial: string };
export type SignalTable = {
  times: number[];
  columns: Record<string, (number | null)[]>;
};
export type AlignmentEstimate = {
  status: "accepted" | "rejected";
  reason: string;
  lag: number | null;
  correlation: number | null;
  coverage: number;
  peakMargin: number | null;
  competingPeaks: { lag: number; correlation: number }[];
  curve: { lag: number; correlation: number | null; coverage: number }[];
};
export const EMPTY_CLOCK: MediaClock = { mode: null, range: null };
export const isVideo = (file: File) =>
  /\.(mp4|m4v|mov|webm|ogv)$/i.test(file.name);
export const isImage = (file: File) =>
  /\.(jpe?g|png|webp|bmp)$/i.test(file.name);

export function indexImages(files: File[]): ImageFrame[] {
  const frames = files
    .map((file) => {
      const match = file.name.match(/(\d+)(?=\.[^.]+$)/);
      if (!match || !isImage(file))
        throw new Error("图片文件名需包含原始帧号，例如 frame_000123.jpg。");
      const frame = Number(match[1]);
      if (!Number.isSafeInteger(frame)) throw new Error("图片帧号无效。");
      return { file, frame };
    })
    .sort((a, b) => a.frame - b.frame);
  if (new Set(frames.map((f) => f.frame)).size !== frames.length)
    throw new Error("图片序列中存在重复帧号。");
  return frames;
}

export function nearestSample(times: number[], time: number): number {
  if (!times.length) return -1;
  let lo = 0,
    hi = times.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (times[mid] < time) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 && time - times[lo - 1] <= times[lo] - time ? lo - 1 : lo;
}

export function commonRange(
  meta: Acquisition,
  roi: [number, number],
  firstTime: number,
  lastTime: number,
  offset: number,
): [number, number] | null {
  const start = Math.max(
    roi[0],
    Math.ceil((firstTime - offset) * meta.pointRate - 1e-8),
  );
  const end = Math.min(
    roi[1],
    Math.floor((lastTime - offset) * meta.pointRate + 1e-8),
  );
  return start <= end ? [start, end] : null;
}

export function timestampBaseline(
  videoStart: string,
  captureStart: string,
  advance: string,
  firstFrame: number,
  rate: number,
): number {
  const zoned = /(Z|[+-]\d{2}:\d{2})$/i;
  if (!zoned.test(videoStart) || !zoned.test(captureStart))
    throw new Error("拍摄时间和 Capture 时间必须包含时区，例如 +08:00。");
  if (!advance.trim() || !Number.isFinite(Number(advance)))
    throw new Error("设备时差未知时，请使用手动定点或已确认的时间基线。");
  const video = Date.parse(videoStart),
    capture = Date.parse(captureStart);
  if (!Number.isFinite(video + capture)) throw new Error("拍摄时间格式无效。");
  return (capture - video) / 1000 - Number(advance) + (firstFrame - 1) / rate;
}

function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error("对齐文件包含无效时间值。");
  return value;
}

export function readAlignment(
  text: string,
  meta: Acquisition,
  media?: MediaIdentity,
): AlignmentChoice[] {
  const data = JSON.parse(text);
  if (data?.format === "c3d-reader-sync") {
    if (
      data.version !== 1 ||
      data.acquisition?.name !== meta.name ||
      data.acquisition?.firstFrame !== meta.firstFrame ||
      data.acquisition?.pointRate !== meta.pointRate ||
      data.acquisition?.frameCount !== meta.frameCount
    )
      throw new Error("对齐文件与当前 C3D 不匹配。");
    if (media) {
      const saved = data.media;
      const matches =
        saved?.kind === media.kind &&
        (media.kind === "video"
          ? saved.name === media.name && saved.size === media.size
          : Array.isArray(saved.files) &&
            saved.files.length === media.files.length &&
            saved.files.every(
              (
                file: { name: string; size: number; frame: number },
                i: number,
              ) =>
                file.name === media.files[i].name &&
                file.size === media.files[i].size &&
                file.frame === media.files[i].frame,
            ) &&
            Array.isArray(saved.times) &&
            saved.times.length === media.times.length &&
            saved.times.every(
              (time: number, i: number) =>
                Number.isFinite(time) && Math.abs(time - media.times[i]) < 1e-8,
            ));
      if (!matches) throw new Error("对齐文件与当前素材不匹配。");
    }
    return [
      {
        trial: meta.name,
        baseline: number(data.baseline),
        lag: number(data.overall_lag_s),
        source: "saved",
        evidence: data.evidence,
      },
    ];
  }
  if (!Array.isArray(data?.trials) || !data.trials.length)
    throw new Error("请选择包含 trials 和 overall_lag_s 的 COM 对齐结果。");
  let lag: number;
  if (data.overall_lag_s != null) lag = number(data.overall_lag_s);
  else {
    const accepted = data.trials
      .filter((row: { status?: string }) => row.status === "accepted")
      .map((row: { residual_correction_s?: unknown }) =>
        number(row.residual_correction_s),
      )
      .sort((a: number, b: number) => a - b);
    if (!accepted.length)
      throw new Error("没有已接受的试次，不能推断共享偏移。");
    const middle = Math.floor(accepted.length / 2);
    lag =
      accepted.length % 2
        ? accepted[middle]
        : (accepted[middle - 1] + accepted[middle]) / 2;
  }
  return data.trials.map(
    (
      row: { id?: unknown; trial?: unknown; timestamp_only_start_s?: unknown },
      index: number,
    ) => ({
      trial: String(row.id ?? row.trial ?? index + 1),
      baseline: number(row.timestamp_only_start_s),
      lag,
      source: "COM",
      evidence: {
        trial: String(row.id ?? row.trial ?? index + 1),
        shared_lag_source:
          data.overall_lag_s != null
            ? "overall_lag_s"
            : "accepted_trial_median",
      },
    }),
  );
}

function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
      if (c === "\r" && text[i + 1] === "\n") i++;
    } else cell += c;
  }
  if (quoted) throw new Error("CSV 引号不完整。");
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function readSignalCSV(text: string): SignalTable {
  const [header, ...rows] = csvRows(text.replace(/^\uFEFF/, ""));
  const timeIndex = header?.indexOf("video_pts_s") ?? -1;
  if (timeIndex < 0 || rows.length < 8 || rows.length > 200000)
    throw new Error("信号 CSV 需要 video_pts_s 列和 8–200000 行数据。");
  if (
    new Set(header).size !== header.length ||
    rows.some((r) => r.length !== header.length)
  )
    throw new Error("CSV 列名重复或行宽不一致。");
  const validIndex = header.indexOf("evaluation_valid");
  const times = rows.map((row) =>
    row[timeIndex] === "" ? NaN : Number(row[timeIndex]),
  );
  if (times.some((v, i) => !Number.isFinite(v) || (i > 0 && v <= times[i - 1])))
    throw new Error("video_pts_s 必须严格递增，不能用行号代替时间。");
  const columns: Record<string, (number | null)[]> = {};
  header.forEach((name, i) => {
    if (
      i === timeIndex ||
      i === validIndex ||
      /^(frame|sample|index|time_s|algorithm_time_s)/i.test(name)
    )
      return;
    const values = rows.map((row) => {
      if (validIndex >= 0 && /^(false|0)$/i.test(row[validIndex])) return null;
      const raw = row[i];
      return raw === "" || /^(nan|null)$/i.test(raw) ? null : Number(raw);
    });
    if (
      values.some((v) => v != null && Number.isFinite(v)) &&
      values.every((v) => v == null || Number.isFinite(v))
    )
      columns[name] = values;
  });
  if (!Object.keys(columns).length)
    throw new Error("CSV 中没有可用的数值信号列。");
  return { times, columns };
}

export function readImagePTS(
  text: string,
  frames: ImageFrame[],
  frameBase = 0,
): number[] {
  const [header, ...rows] = csvRows(text.replace(/^\uFEFF/, ""));
  const fi = header?.indexOf("frame") ?? -1,
    ti = header?.indexOf("video_pts_s") ?? -1;
  if (fi < 0 || ti < 0)
    throw new Error(
      "时间表需要 frame 和 video_pts_s 列，frame 为原视频零基帧号。",
    );
  const map = new Map<number, number>();
  for (const row of rows) {
    const f = row[fi] === "" ? NaN : Number(row[fi]);
    const t = row[ti] === "" ? NaN : Number(row[ti]);
    if (!Number.isSafeInteger(f) || f < 0 || !Number.isFinite(t) || map.has(f))
      throw new Error("时间表包含无效或重复帧号。");
    map.set(f, t);
  }
  const times = frames.map(({ frame }) => map.get(frame - frameBase));
  if (times.some((v, i) => v == null || (i > 0 && v <= times[i - 1]!)))
    throw new Error("时间表未覆盖全部图片，或 PTS 顺序无效。");
  return times as number[];
}

export function saveJSON(filename: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
