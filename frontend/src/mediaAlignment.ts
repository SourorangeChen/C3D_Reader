// Pure rules behind the video / image-sequence panel: sample times, the
// media time range, which image belongs to a C3D frame, seeking, mapping
// edits, the saved sync file and the status copy. MediaPanel and its hooks
// own state and effects; everything here is a function of its arguments.
import type { Acquisition } from "./types";
import type { MediaAsset } from "./mediaSession";
import type { TrainingState } from "./trainingSession";
import { nearestSample } from "./synchronization";
import type { MediaIdentity, SyncMapping } from "./synchronization";

export const EMPTY_MAPPING: SyncMapping = {
  baseline: 0,
  lag: 0,
  source: "manual",
};

/** Media time of each image: the PTS table, or frame numbers over the FPS. */
export function imageSampleTimes(
  asset: MediaAsset | null,
  pts: number[] | null,
  fps: string,
  frameBase: string,
): number[] {
  if (asset?.kind !== "images") return [];
  if (pts) return pts;
  const rate = Number(fps);
  if (!Number.isFinite(rate) || rate <= 0 || rate > 10000) return [];
  const times = asset.frames.map(
    ({ frame }) => (frame - Number(frameBase)) / rate,
  );
  return times[0] >= 0 ? times : [];
}

/** Seconds per source frame, taken from the last PTS step when a table is used. */
export function imageSamplePeriod(
  asset: MediaAsset | null,
  pts: number[] | null,
  fps: string,
): number {
  if (!pts) return Number(fps) > 0 ? 1 / Number(fps) : 0;
  if (asset?.kind !== "images" || pts.length < 2) return 0;
  const last = pts.length - 1;
  return (
    (pts[last] - pts[last - 1]) /
    (asset.frames[last].frame - asset.frames[last - 1].frame)
  );
}

/** Whether the media is timed, and the first and last media time it covers. */
export function mediaBounds(
  asset: MediaAsset | null,
  duration: number,
  origin: number,
  imageTimes: number[],
  imagePeriod: number,
) {
  if (asset?.kind === "video")
    return {
      ready: duration > 0,
      firstTime: origin,
      lastTime: origin + duration - 0.000001,
    };
  return {
    ready: imageTimes.length > 0 && imagePeriod > 0,
    firstTime: imageTimes[0] || 0,
    lastTime: (imageTimes.at(-1) || 0) + imagePeriod / 2,
  };
}

/**
 * The image nearest to a media time, and whether that image is further away
 * than half the local sampling period (a gap in the sequence).
 */
export function imageAtTime(
  asset: MediaAsset | null,
  imageTimes: number[],
  imagePeriod: number,
  time: number,
) {
  const nearest = nearestSample(imageTimes, time);
  const neighbor = time < imageTimes[nearest] ? nearest - 1 : nearest + 1;
  const localPeriod =
    asset?.kind === "images" && neighbor >= 0 && neighbor < imageTimes.length
      ? Math.abs(
          (imageTimes[neighbor] - imageTimes[nearest]) /
            (asset.frames[neighbor].frame - asset.frames[nearest].frame),
        )
      : imagePeriod;
  const missing =
    asset?.kind === "images" &&
    nearest >= 0 &&
    Math.abs(imageTimes[nearest] - time) > localPeriod * 0.5 + 1e-8;
  return { nearest, missing };
}

export function mediaIdentity(
  asset: MediaAsset | null,
  imageTimes: number[],
): MediaIdentity | undefined {
  if (asset?.kind === "video")
    return { kind: "video", name: asset.file.name, size: asset.file.size };
  if (asset?.kind === "images")
    return {
      kind: "images",
      files: asset.frames.map(({ file, frame }) => ({
        name: file.name,
        size: file.size,
        frame,
      })),
      times: imageTimes,
    };
  return undefined;
}

/** The c3d-reader-sync file that "保存当前对齐" writes. */
export function syncExport(
  meta: Pick<Acquisition, "name" | "firstFrame" | "pointRate" | "frameCount">,
  asset: MediaAsset,
  setup: {
    mapping: SyncMapping;
    origin: number;
    pts: number[] | null;
    fps: string;
    frameBase: string;
    imageTimes: number[];
  },
) {
  const { mapping, origin, pts, fps, frameBase, imageTimes } = setup;
  return {
    format: "c3d-reader-sync",
    version: 1,
    acquisition: {
      name: meta.name,
      firstFrame: meta.firstFrame,
      pointRate: meta.pointRate,
      frameCount: meta.frameCount,
    },
    media:
      asset.kind === "video"
        ? {
            kind: "video",
            name: asset.file.name,
            size: asset.file.size,
            lastModified: asset.file.lastModified,
          }
        : {
            ...mediaIdentity(asset, imageTimes),
            kind: "images",
            count: asset.frames.length,
            firstFrame: asset.frames[0].frame,
            lastFrame: asset.frames.at(-1)!.frame,
            fps: pts ? null : Number(fps),
            frameBase: Number(frameBase),
            times: imageTimes,
          },
    baseline: mapping.baseline,
    overall_lag_s: mapping.lag,
    video_pts_origin_s: origin,
    source: mapping.source,
    evidence: mapping.evidence,
    visual_review: "pending",
    convention: "video_pts_s = baseline + overall_lag_s + c3d_relative_time_s",
  };
}

/** Manual alignment: the shown media time corresponds to the current frame. */
export function anchorMapping(
  mapping: SyncMapping,
  mediaTime: number,
  frame: number,
  rate: number,
): SyncMapping {
  return {
    baseline: mapping.baseline,
    lag: mediaTime - frame / rate - mapping.baseline,
    source: "anchor",
  };
}

/** Shift the lag by whole C3D frames. */
export function nudgeMapping(
  mapping: SyncMapping,
  direction: number,
  rate: number,
): SyncMapping {
  return { ...mapping, lag: mapping.lag + direction / rate, source: "nudge" };
}

/** A raw C3D frame number as a zero-based frame inside the observation range. */
export function clampViconFrame(
  rawFrame: number,
  firstFrame: number,
  roi: [number, number],
) {
  return Math.max(roi[0], Math.min(roi[1], Math.round(rawFrame) - firstFrame));
}

/**
 * Where seeking the media to `time` puts the C3D playhead, or the error to
 * show when the time is outside the media or the synchronized range.
 */
export function mediaSeekTarget(
  time: number,
  options: {
    firstTime: number;
    lastTime: number;
    offset: number;
    rate: number;
    synced: boolean;
    range: [number, number] | null;
  },
): { frame: number } | { error: string } {
  const { firstTime, lastTime, offset, rate, synced, range } = options;
  if (time < firstTime || time > lastTime)
    return { error: "视频时间超出素材范围。" };
  const frame = Math.round((time - offset) * rate);
  if (synced && (!range || frame < range[0] || frame > range[1]))
    return { error: "该视频帧不在当前 Vicon 同步区间内。" };
  return { frame };
}

export function syncStatus(
  synced: boolean,
  mapping: SyncMapping,
  recognizing: boolean,
) {
  if (synced)
    return mapping.source === "auto"
      ? mapping.evidence?.motionChecked === false
        ? "共享 lag · 待复核"
        : "自动对齐 · 待复核"
      : mapping.source === "candidate"
        ? "候选对齐 · 待复核"
        : "已建立时间对应 · 待复核";
  return recognizing ? "正在自动对齐" : "尚未对齐";
}

export function indexStatus(
  kind: MediaAsset["kind"],
  timing: { loading: boolean; seeking: boolean; error: boolean },
) {
  if (kind === "images") return "图片使用源文件帧号";
  if (timing.loading) return "正在读取视频帧索引…";
  if (timing.seeking) return "正在定位视频帧…";
  if (timing.error) return "帧索引不可用；仍可按时间定位";
  return "视频帧号从 0 开始";
}

/** Notice for media kept from another trial or restored for this one. */
export function reuseNotice(options: {
  sharedTraining: boolean;
  restored: boolean;
  reusingMedia: boolean;
  synced: boolean;
  recognizing: boolean;
  rejected: boolean;
}) {
  const { sharedTraining, restored, reusingMedia, synced } = options;
  if (sharedTraining) return "";
  if (restored) return "已恢复当前试次的素材与对齐。";
  if (!reusingMedia || synced) return "";
  if (options.recognizing) return "已保留素材，正在检查是否包含当前试次的动作…";
  if (options.rejected)
    return "当前素材尚未通过此试次的动作匹配。可更换素材，或手动对齐。";
  return "已保留素材；当前试次尚未对齐。";
}

/** This trial's row in a shared (reference-trial) alignment result. */
export function trainingTrialFor(
  result: TrainingState["result"],
  acquisitionId: string,
  trialKey: string,
  keyOf: (acquisition: TrainingTrialAcquisition) => string,
) {
  return result?.trials.find(
    (trial) =>
      trial.acquisition.id === acquisitionId &&
      (trial.status === "rejected" || keyOf(trial.acquisition) === trialKey),
  );
}
type TrainingTrialAcquisition = NonNullable<
  TrainingState["result"]
>["trials"][number]["acquisition"];

/** Notice for a shared-lag (reference trial) alignment; text and parameters. */
export function trainingNotice(
  training: TrainingState,
  trial: ReturnType<typeof trainingTrialFor>,
  recognizing: boolean,
): [string, (string | number)[]?] {
  if (training.error) return ["参考 trial 对齐失败，请更换 trial 后重试。"];
  if (recognizing)
    return [
      "正在使用 {0} 确定 lag… {1}%",
      [training.referenceName, Math.round(training.job!.progress)],
    ];
  if (training.result) {
    if (trial?.status === "accepted")
      return ["参考 trial 已确定 lag，其他 trial 直接共享。"];
    if (trial?.status === "shared")
      return ["当前 trial 共享参考 trial 的 lag，未单独进行动作匹配。"];
    if (trial?.reason === "metadata_unavailable")
      return ["无法读取当前 trial 的时间信息，未应用共享 lag。"];
    if (training.result.lag != null)
      return ["当前 trial 未应用共享 lag，请以当前 trial 重新确定 lag。"];
    return ["参考 trial 未能可靠确定 lag，请更换 trial 重试。"];
  }
  if (training.job?.status === "cancelled")
    return ["参考 trial 对齐已取消，尚未共享 lag。"];
  return [""];
}
