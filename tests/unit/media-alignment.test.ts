import { test, expect } from "vitest";
import {
  anchorMapping,
  clampViconFrame,
  EMPTY_MAPPING,
  imageAtTime,
  imageSamplePeriod,
  imageSampleTimes,
  indexStatus,
  mediaBounds,
  mediaIdentity,
  mediaSeekTarget,
  nudgeMapping,
  reuseNotice,
  syncExport,
  syncStatus,
  trainingNotice,
  trainingTrialFor,
} from "../../frontend/src/mediaAlignment";
import type { MediaAsset } from "../../frontend/src/mediaSession";
import type {
  TrainingResult,
  TrainingState,
} from "../../frontend/src/trainingSession";

const file = (name: string, size = 10) =>
  new File([new Uint8Array(size)], name, { lastModified: 5 });
const images = (frames: number[]): MediaAsset => ({
  kind: "images",
  frames: frames.map((frame) => ({ file: file(`f_${frame}.jpg`), frame })),
});
const video: MediaAsset = {
  kind: "video",
  file: file("walk.mp4", 42),
  url: "blob:x",
};

test("image times come from the PTS table, or frame numbers over the FPS", () => {
  const asset = images([10, 11, 13]);
  expect(imageSampleTimes(asset, [1, 2, 3], "", "0")).toEqual([1, 2, 3]);
  expect(imageSampleTimes(asset, null, "10", "0")).toEqual([1, 1.1, 1.3]);
  expect(imageSampleTimes(asset, null, "10", "1")).toEqual([0.9, 1, 1.2]);
  for (const fps of ["", "0", "-5", "20000", "abc"])
    expect(imageSampleTimes(asset, null, fps, "0")).toEqual([]);
  // Frame numbers below the base would put images before media time zero.
  expect(imageSampleTimes(images([0, 1]), null, "10", "1")).toEqual([]);
  expect(imageSampleTimes(video, null, "10", "0")).toEqual([]);
  expect(imageSampleTimes(null, null, "10", "0")).toEqual([]);
});

test("image period follows the FPS or the last PTS step per source frame", () => {
  const asset = images([10, 11, 14]);
  expect(imageSamplePeriod(asset, null, "25")).toBe(0.04);
  expect(imageSamplePeriod(asset, null, "")).toBe(0);
  expect(imageSamplePeriod(asset, [0, 0.1, 0.4], "")).toBeCloseTo(0.1);
  expect(imageSamplePeriod(asset, [0], "")).toBe(0);
  expect(imageSamplePeriod(video, [0, 1], "")).toBe(0);
});

test("media bounds cover the video duration or the image samples", () => {
  expect(mediaBounds(video, 0, 0.5, [], 0).ready).toBe(false);
  const v = mediaBounds(video, 4, 0.5, [], 0);
  expect(v.ready).toBe(true);
  expect(v.firstTime).toBe(0.5);
  expect(v.lastTime).toBeCloseTo(4.5 - 0.000001, 9);
  const i = mediaBounds(images([1, 2]), 0, 0, [1, 1.1], 0.1);
  expect(i).toEqual({ ready: true, firstTime: 1, lastTime: 1.1 + 0.05 });
  expect(mediaBounds(images([1, 2]), 0, 0, [], 0.1).ready).toBe(false);
  expect(mediaBounds(images([1, 2]), 0, 0, [1, 2], 0).ready).toBe(false);
});

test("images further than half the local period from a time are a gap", () => {
  // Frames 0, 1 and 5 at 10 fps: 0.0, 0.1, 0.5 s.
  const asset = images([0, 1, 5]);
  const times = [0, 0.1, 0.5];
  expect(imageAtTime(asset, times, 0.1, 0.1)).toEqual({
    nearest: 1,
    missing: false,
  });
  expect(imageAtTime(asset, times, 0.1, 0.14)).toEqual({
    nearest: 1,
    missing: false,
  });
  // Between frames 1 and 5 the local period is still 0.1 s per source frame.
  expect(imageAtTime(asset, times, 0.1, 0.3).missing).toBe(true);
  expect(imageAtTime(asset, times, 0.1, 0.46)).toEqual({
    nearest: 2,
    missing: false,
  });
  expect(imageAtTime(asset, [], 0, 1)).toEqual({ nearest: -1, missing: false });
  expect(imageAtTime(video, [], 0, 1).missing).toBe(false);
});

test("media identity and the saved sync file describe the material", () => {
  expect(mediaIdentity(null, [])).toBeUndefined();
  expect(mediaIdentity(video, [])).toEqual({
    kind: "video",
    name: "walk.mp4",
    size: 42,
  });
  const asset = images([3, 4]);
  expect(mediaIdentity(asset, [0.3, 0.4])).toEqual({
    kind: "images",
    files: [
      { name: "f_3.jpg", size: 10, frame: 3 },
      { name: "f_4.jpg", size: 10, frame: 4 },
    ],
    times: [0.3, 0.4],
  });
  const meta = {
    name: "WT01.c3d",
    firstFrame: 1,
    pointRate: 100,
    frameCount: 9,
  };
  const mapping = { baseline: 1, lag: 0.25, source: "anchor" };
  const setup = {
    mapping,
    origin: 0.5,
    frameBase: "0",
    imageTimes: [0.3, 0.4],
  };
  const saved = syncExport(meta, video, { ...setup, pts: null, fps: "" });
  expect(saved).toMatchObject({
    format: "c3d-reader-sync",
    version: 1,
    acquisition: meta,
    media: { kind: "video", name: "walk.mp4", size: 42, lastModified: 5 },
    baseline: 1,
    overall_lag_s: 0.25,
    video_pts_origin_s: 0.5,
    source: "anchor",
    visual_review: "pending",
  });
  expect(
    syncExport(meta, asset, { ...setup, pts: null, fps: "10" }).media,
  ).toMatchObject({
    kind: "images",
    count: 2,
    firstFrame: 3,
    lastFrame: 4,
    fps: 10,
    frameBase: 0,
    times: [0.3, 0.4],
  });
  expect(
    syncExport(meta, asset, { ...setup, pts: [0.3, 0.4], fps: "10" }).media,
  ).toMatchObject({ fps: null });
});

test("anchoring and nudging keep the baseline and change the lag", () => {
  const mapping = { baseline: 2, lag: 0, source: "COM" };
  // Media 5.5 s shows C3D frame 150 at 100 Hz: 5.5 = 2 + lag + 1.5.
  expect(anchorMapping(mapping, 5.5, 150, 100)).toEqual({
    baseline: 2,
    lag: 2,
    source: "anchor",
  });
  expect(nudgeMapping({ ...mapping, evidence: { a: 1 } }, -2, 100)).toEqual({
    baseline: 2,
    lag: -0.02,
    source: "nudge",
    evidence: { a: 1 },
  });
  expect(EMPTY_MAPPING).toEqual({ baseline: 0, lag: 0, source: "manual" });
});

test("C3D frame entry is clamped to the observation range", () => {
  expect(clampViconFrame(150.4, 101, [10, 80])).toBe(49);
  expect(clampViconFrame(50, 101, [10, 80])).toBe(10);
  expect(clampViconFrame(900, 101, [10, 80])).toBe(80);
});

test("seeking the media maps to a C3D frame inside the synchronized range", () => {
  const options = {
    firstTime: 0,
    lastTime: 10,
    offset: 1,
    rate: 100,
    synced: true,
    range: [0, 500] as [number, number],
  };
  expect(mediaSeekTarget(3.004, options)).toEqual({ frame: 200 });
  expect(mediaSeekTarget(11, options)).toEqual({
    error: "视频时间超出素材范围。",
  });
  expect(mediaSeekTarget(7, options)).toEqual({
    error: "该视频帧不在当前 Vicon 同步区间内。",
  });
  expect(mediaSeekTarget(3, { ...options, range: null })).toHaveProperty(
    "error",
  );
  // Before alignment any media time inside the material can be previewed.
  expect(mediaSeekTarget(7, { ...options, synced: false })).toEqual({
    frame: 600,
  });
});

test("status copy follows the mapping source and recognition", () => {
  const auto = { ...EMPTY_MAPPING, source: "auto" };
  expect(syncStatus(true, auto, false)).toBe("自动对齐 · 待复核");
  expect(
    syncStatus(true, { ...auto, evidence: { motionChecked: false } }, false),
  ).toBe("共享 lag · 待复核");
  expect(syncStatus(true, { ...auto, source: "candidate" }, false)).toBe(
    "候选对齐 · 待复核",
  );
  expect(syncStatus(true, EMPTY_MAPPING, false)).toBe(
    "已建立时间对应 · 待复核",
  );
  expect(syncStatus(false, auto, true)).toBe("正在自动对齐");
  expect(syncStatus(false, auto, false)).toBe("尚未对齐");
  const idle = { loading: false, seeking: false, error: false };
  expect(indexStatus("images", { ...idle, loading: true })).toBe(
    "图片使用源文件帧号",
  );
  expect(indexStatus("video", { ...idle, loading: true, seeking: true })).toBe(
    "正在读取视频帧索引…",
  );
  expect(indexStatus("video", { ...idle, seeking: true, error: true })).toBe(
    "正在定位视频帧…",
  );
  expect(indexStatus("video", { ...idle, error: true })).toBe(
    "帧索引不可用；仍可按时间定位",
  );
  expect(indexStatus("video", idle)).toBe("视频帧号从 0 开始");
});

test("reuse notice explains kept or restored media", () => {
  const base = {
    sharedTraining: false,
    restored: false,
    reusingMedia: true,
    synced: false,
    recognizing: false,
    rejected: false,
  };
  expect(reuseNotice({ ...base, restored: true, sharedTraining: true })).toBe(
    "",
  );
  expect(reuseNotice({ ...base, restored: true })).toBe(
    "已恢复当前试次的素材与对齐。",
  );
  expect(reuseNotice({ ...base, recognizing: true, rejected: true })).toBe(
    "已保留素材，正在检查是否包含当前试次的动作…",
  );
  expect(reuseNotice({ ...base, rejected: true })).toBe(
    "当前素材尚未通过此试次的动作匹配。可更换素材，或手动对齐。",
  );
  expect(reuseNotice(base)).toBe("已保留素材；当前试次尚未对齐。");
  expect(reuseNotice({ ...base, synced: true })).toBe("");
  expect(reuseNotice({ ...base, reusingMedia: false })).toBe("");
});

test("shared-lag notice reports this trial's row of the training result", () => {
  const acquisition = (id: string, revision: string) =>
    ({ id, revision }) as TrainingResult["trials"][number]["acquisition"];
  const keyOf = (a: { id: string; revision?: string }) =>
    `${a.id}@${a.revision}`;
  const result = {
    status: "accepted",
    reason: "",
    lag: 0.3,
    referenceTrial: acquisition("a", "1"),
    candidates: [],
    trials: [
      { acquisition: acquisition("a", "1"), status: "accepted", reason: "" },
      { acquisition: acquisition("b", "old"), status: "shared", reason: "" },
      { acquisition: acquisition("c", "x"), status: "rejected", reason: "r" },
    ],
  } as TrainingResult;
  expect(trainingTrialFor(result, "a", "a@1", keyOf)?.status).toBe("accepted");
  // A shared row for an older revision of the file does not apply.
  expect(trainingTrialFor(result, "b", "b@new", keyOf)).toBeUndefined();
  // Rejections apply to the trial whatever its revision.
  expect(trainingTrialFor(result, "c", "c@y", keyOf)?.status).toBe("rejected");
  expect(trainingTrialFor(null, "a", "a@1", keyOf)).toBeUndefined();

  const state = (value: Partial<TrainingState>): TrainingState => ({
    asset: null,
    job: null,
    result: null,
    ids: [],
    referenceId: null,
    referenceName: "",
    error: "",
    ...value,
  });
  const job = {
    id: "j",
    status: "running" as const,
    phase: "",
    progress: 41.6,
    result: null,
    error: null,
  };
  expect(trainingNotice(state({ error: "x" }), undefined, true)[0]).toBe(
    "参考 trial 对齐失败，请更换 trial 后重试。",
  );
  expect(
    trainingNotice(state({ job, referenceName: "WT02" }), undefined, true),
  ).toEqual(["正在使用 {0} 确定 lag… {1}%", ["WT02", 42]]);
  const done = state({ result });
  expect(trainingNotice(done, result.trials[0], false)[0]).toBe(
    "参考 trial 已确定 lag，其他 trial 直接共享。",
  );
  expect(trainingNotice(done, result.trials[1], false)[0]).toBe(
    "当前 trial 共享参考 trial 的 lag，未单独进行动作匹配。",
  );
  expect(
    trainingNotice(
      done,
      { ...result.trials[2], reason: "metadata_unavailable" },
      false,
    )[0],
  ).toBe("无法读取当前 trial 的时间信息，未应用共享 lag。");
  expect(trainingNotice(done, undefined, false)[0]).toBe(
    "当前 trial 未应用共享 lag，请以当前 trial 重新确定 lag。",
  );
  expect(
    trainingNotice(
      state({ result: { ...result, lag: null } }),
      undefined,
      false,
    )[0],
  ).toBe("参考 trial 未能可靠确定 lag，请更换 trial 重试。");
  expect(
    trainingNotice(
      state({ job: { ...job, status: "cancelled" } }),
      undefined,
      false,
    )[0],
  ).toBe("参考 trial 对齐已取消，尚未共享 lag。");
  expect(trainingNotice(state({}), undefined, false)[0]).toBe("");
});
