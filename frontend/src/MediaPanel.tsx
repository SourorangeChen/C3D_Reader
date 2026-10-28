import { useEffect, useMemo, useRef, useState } from "react";
import {
  Film,
  Images,
  Link2,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { usePreferences } from "./Preferences";
import type { Acquisition, Selection } from "./types";
import {
  commonRange,
  EMPTY_CLOCK,
  indexImages,
  isImage,
  isVideo,
  nearestSample,
  readImagePTS,
  saveJSON,
} from "./synchronization";
import type {
  ImageFrame,
  MediaClock,
  MediaIdentity,
  SyncMapping,
} from "./synchronization";
import { SyncSettings } from "./SyncSettings";
import { useVideoClock } from "./useVideoClock";
import { useAutomaticAlignment } from "./useAutomaticAlignment";
import { AutomaticAlignmentStatus } from "./AutomaticAlignmentStatus";

type Asset =
  | { kind: "video"; file: File; url: string }
  | { kind: "images"; frames: ImageFrame[] };
type Props = {
  meta: Acquisition;
  frame: number;
  playing: boolean;
  speed: number;
  loop: boolean;
  roi: [number, number];
  selection: Selection;
  framesReady: boolean;
  blocked: boolean;
  incoming: File[] | null;
  onConsumed: () => void;
  onClock: (clock: MediaClock) => void;
  onFrame: (frame: number) => void;
  onPlaying: (playing: boolean) => void;
  onClose: () => void;
};
function useImageURL(file?: File) {
  const [loaded, setLoaded] = useState<{ file: File; url: string } | null>(
    null,
  );
  useEffect(() => {
    if (!file) {
      setLoaded(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setLoaded({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return loaded?.file === file ? loaded?.url : null;
}
export function MediaPanel(props: Props) {
  const { t } = usePreferences();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [duration, setDuration] = useState(0);
  const [enabled, setEnabled] = useState(false);
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [subjectX, setSubjectX] = useState("0.5");
  const [mapping, setMapping] = useState<SyncMapping>({
    baseline: 0,
    lag: 0,
    source: "manual",
  });
  const [origin, setOrigin] = useState(0);
  const [fps, setFPS] = useState("");
  const [frameBase, setFrameBase] = useState("0");
  const [pts, setPTS] = useState<number[] | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewTime, setPreviewTime] = useState(0);
  const [settings, setSettings] = useState(false);
  const [error, setError] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const readVersion = useRef(0);
  const offset = mapping.baseline + mapping.lag;
  const sourceTime = offset + props.frame / props.meta.pointRate;
  const imageTimes = useMemo(() => {
    if (asset?.kind !== "images") return [];
    if (pts) return pts;
    const rate = Number(fps);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 10000) return [];
    const times = asset.frames.map(
      ({ frame }) => (frame - Number(frameBase)) / rate,
    );
    return times[0] >= 0 ? times : [];
  }, [asset, pts, fps, frameBase]);
  const imagePeriod = useMemo(() => {
    if (!pts) return Number(fps) > 0 ? 1 / Number(fps) : 0;
    if (asset?.kind !== "images" || pts.length < 2) return 0;
    const last = pts.length - 1;
    return (
      (pts[last] - pts[last - 1]) /
      (asset.frames[last].frame - asset.frames[last - 1].frame)
    );
  }, [asset, pts, fps]);
  const ready =
    asset?.kind === "video"
      ? duration > 0
      : imageTimes.length > 0 && imagePeriod > 0;
  const firstTime = asset?.kind === "video" ? origin : imageTimes[0] || 0;
  const lastTime =
    asset?.kind === "video"
      ? origin + duration - 0.000001
      : (imageTimes.at(-1) || 0) + imagePeriod / 2;
  const range = useMemo(
    () =>
      ready
        ? commonRange(props.meta, props.roi, firstTime, lastTime, offset)
        : null,
    [
      ready,
      props.meta,
      props.roi[0],
      props.roi[1],
      firstTime,
      lastTime,
      offset,
    ],
  );
  const synced = enabled && ready && !props.blocked;
  const outOfRange =
    synced && (sourceTime < firstTime - 1e-8 || sourceTime > lastTime + 1e-8);
  const nearest = nearestSample(imageTimes, sourceTime);
  const neighbor = sourceTime < imageTimes[nearest] ? nearest - 1 : nearest + 1;
  const localPeriod =
    asset?.kind === "images" && neighbor >= 0 && neighbor < imageTimes.length
      ? Math.abs(
          (imageTimes[neighbor] - imageTimes[nearest]) /
            (asset.frames[neighbor].frame - asset.frames[nearest].frame),
        )
      : imagePeriod;
  const missingImage =
    synced &&
    asset?.kind === "images" &&
    nearest >= 0 &&
    Math.abs(imageTimes[nearest] - sourceTime) > localPeriod * 0.5 + 1e-8;
  const imageIndex = synced ? nearest : previewIndex;
  const imageFile =
    asset?.kind === "images" && !outOfRange && !missingImage
      ? asset.frames[imageIndex]?.file
      : undefined;
  const imageURL = useImageURL(imageFile);

  const importFiles = (files: File[]) => {
    if (!files.length) return;
    setError("");
    try {
      let next: Asset;
      if (files.length === 1 && isVideo(files[0]))
        next = {
          kind: "video",
          file: files[0],
          url: URL.createObjectURL(files[0]),
        };
      else if (files.every(isImage))
        next = { kind: "images", frames: indexImages(files) };
      else throw new Error("请选择一个视频，或同一录制的按帧编号图片序列。");
      readVersion.current++;
      props.onPlaying(false);
      setAsset(next);
      setDuration(0);
      setEnabled(false);
      setAutoEnabled(true);
      setPTS(null);
      setFrameBase("0");
      setFPS("");
      setPreviewIndex(0);
      setPreviewTime(0);
      setOrigin(0);
      setMapping({ baseline: 0, lag: 0, source: "manual" });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    if (props.incoming) {
      importFiles(props.incoming);
      props.onConsumed();
    }
  }, [props.incoming]);
  useEffect(
    () => () => {
      if (asset?.kind === "video") URL.revokeObjectURL(asset.url);
    },
    [asset],
  );
  useEffect(() => {
    props.onClock(synced && asset ? { mode: asset.kind, range } : EMPTY_CLOCK);
  }, [synced, asset?.kind, range?.[0], range?.[1], props.onClock]);
  useEffect(
    () => () => {
      props.onClock(EMPTY_CLOCK);
      readVersion.current++;
    },
    [props.onClock],
  );
  useEffect(() => {
    if (props.blocked) {
      setEnabled(false);
      setSettings(false);
      video.current?.pause();
    }
  }, [props.blocked]);
  useVideoClock({
    video,
    meta: props.meta,
    enabled: synced && asset?.kind === "video",
    ready,
    framesReady: props.framesReady,
    frame: props.frame,
    playing: props.playing,
    speed: props.speed,
    loop: props.loop,
    range,
    offset,
    origin,
    onFrame: props.onFrame,
    onPlaying: props.onPlaying,
    onError: setError,
  });

  const automaticFiles = useMemo(
    () =>
      asset?.kind === "video"
        ? [asset.file]
        : asset?.frames.map(({ file }) => file) || [],
    [asset],
  );
  const automatic = useAutomaticAlignment({
    files: automaticFiles,
    times: asset?.kind === "images" ? imageTimes : undefined,
    acquisitionId: props.meta.id,
    start: props.roi[0],
    stop: props.roi[1] + 1,
    origin,
    subjectX: Number(subjectX),
    ready,
    enabled: autoEnabled,
    blocked: props.blocked,
    onStart: () => {
      props.onPlaying(false);
      video.current?.pause();
      setEnabled(false);
    },
    onResult: (result) =>
      apply({
        baseline: 0,
        lag: result.offset!,
        source: "auto",
        evidence: result,
      }),
  });
  const apply = (value: SyncMapping) => {
    if (value.source !== "auto") {
      automatic.cancel();
      setAutoEnabled(false);
    }
    props.onPlaying(false);
    video.current?.pause();
    setMapping(value);
    setEnabled(true);
    setError("");
  };
  const anchor = () => {
    const time =
      asset?.kind === "video"
        ? (video.current?.currentTime || 0) + origin
        : imageTimes[previewIndex];
    if (!Number.isFinite(time)) return;
    apply({
      baseline: mapping.baseline,
      lag: time - props.frame / props.meta.pointRate - mapping.baseline,
      source: "anchor",
    });
  };
  const importPTS = async (file?: File) => {
    if (!file || asset?.kind !== "images") return;
    const version = readVersion.current;
    try {
      if (file.size > 20_000_000)
        throw new Error("时间表过大，请只保留当前录制。");
      const times = readImagePTS(
        await file.text(),
        asset.frames,
        Number(frameBase),
      );
      if (version !== readVersion.current) return;
      props.onPlaying(false);
      setEnabled(false);
      setPTS(times);
      setAutoEnabled(true);
      setError("");
    } catch (e) {
      if (version === readVersion.current) setError((e as Error).message);
    }
  };
  const mediaIdentity = useMemo<MediaIdentity | undefined>(
    () =>
      asset?.kind === "video"
        ? { kind: "video", name: asset.file.name, size: asset.file.size }
        : asset?.kind === "images"
          ? {
              kind: "images",
              files: asset.frames.map(({ file, frame }) => ({
                name: file.name,
                size: file.size,
                frame,
              })),
              times: imageTimes,
            }
          : undefined,
    [asset, imageTimes],
  );
  const exportMapping = () => {
    if (!asset) return;
    saveJSON("c3d-video-sync.json", {
      format: "c3d-reader-sync",
      version: 1,
      acquisition: {
        name: props.meta.name,
        firstFrame: props.meta.firstFrame,
        pointRate: props.meta.pointRate,
        frameCount: props.meta.frameCount,
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
              ...mediaIdentity,
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
      convention:
        "video_pts_s = baseline + overall_lag_s + c3d_relative_time_s",
    });
  };
  const sourceName =
    asset?.kind === "video"
      ? asset.file.name
      : asset?.kind === "images"
        ? t("{0} 张图片 · {1}–{2}", [
            asset.frames.length,
            asset.frames[0].frame,
            asset.frames.at(-1)!.frame,
          ])
        : t("本机视频 / 图片序列");
  const displayTime =
    asset?.kind === "video" ? previewTime + origin : imageTimes[imageIndex];
  return (
    <section className="media-panel" aria-label={t("视频与图片同步")}>
      <div className="media-heading">
        <Film size={15} />
        <strong title={sourceName}>{sourceName}</strong>
        <button
          className="icon-button"
          aria-label={t("关闭视频面板")}
          onClick={() => {
            props.onPlaying(false);
            props.onClose();
          }}
        >
          <X size={15} />
        </button>
      </div>
      <div
        className={`media-stage ${outOfRange || missingImage ? "media-unavailable" : ""}`}
      >
        {asset?.kind === "video" && (
          <video
            key={asset.url}
            ref={video}
            src={asset.url}
            muted
            playsInline
            preload="auto"
            controls={!synced}
            aria-label={t("参考视频")}
            onKeyDown={(e) => e.stopPropagation()}
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration;
              if (Number.isFinite(d) && d > 0) setDuration(d);
              else setError("视频时长不可用，请重新导入。");
            }}
            onTimeUpdate={(e) => setPreviewTime(e.currentTarget.currentTime)}
            onError={() => {
              setError("视频无法解码，请选择浏览器支持的视频格式。");
              setEnabled(false);
              setDuration(0);
              setAutoEnabled(false);
              automatic.cancel();
              props.onPlaying(false);
            }}
          />
        )}
        {asset?.kind === "images" && imageURL && (
          <img
            src={imageURL}
            alt={t("原视频帧 {0}", [asset.frames[imageIndex].frame])}
            onError={() => setError("图片无法读取，请检查格式或重新导入。")}
          />
        )}
        {!asset && (
          <div className="media-empty">
            <Images size={28} />
            <p>{t("将视频或图片序列与 Vicon 并排核查")}</p>
            <span>
              {t("素材仅在本机读取。桌面版导入后自动识别动作并对齐。")}
            </span>
          </div>
        )}
        {outOfRange && (
          <div className="media-message">
            {t("当前 C3D 帧超出素材时间范围")}
          </div>
        )}
        {missingImage && !outOfRange && (
          <div className="media-message">
            {t("该时刻没有对应图片，保留采样缺口")}
          </div>
        )}
        {asset?.kind === "images" && !ready && (
          <div className="media-message">
            {t("填写此录制的 FPS，或导入帧号–PTS 时间表")}
          </div>
        )}
      </div>
      <div className="media-controls">
        <div className="media-imports">
          <label className="button file-choice">
            <Film size={14} />
            {t("导入视频")}
            <input
              type="file"
              accept=".mp4,.m4v,.mov,.webm,.ogv"
              aria-label={t("导入视频")}
              onChange={(e) => {
                importFiles([...(e.target.files || [])]);
                e.target.value = "";
              }}
            />
          </label>
          <label className="button file-choice">
            <Images size={14} />
            {t("导入图片序列")}
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.bmp"
              multiple
              aria-label={t("导入图片序列")}
              onChange={(e) => {
                importFiles([...(e.target.files || [])]);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {asset?.kind === "images" && (
          <>
            <div className="media-timing">
              <label>
                {t("源视频 FPS")}
                <input
                  type="number"
                  min="0.001"
                  max="10000"
                  step="any"
                  placeholder={t("按此录制填写")}
                  value={fps}
                  disabled={!!pts}
                  onChange={(e) => {
                    props.onPlaying(false);
                    setEnabled(false);
                    setFPS(e.target.value);
                    setAutoEnabled(true);
                  }}
                />
              </label>
              <label>
                {t("文件帧号起点")}
                <select
                  aria-label={t("文件帧号起点")}
                  value={frameBase}
                  disabled={!!pts}
                  onChange={(e) => {
                    props.onPlaying(false);
                    setEnabled(false);
                    setFrameBase(e.target.value);
                    setAutoEnabled(true);
                  }}
                >
                  <option value="0">0</option>
                  <option value="1">1</option>
                </select>
              </label>
              <label className="button file-choice">
                {t(pts ? "替换 PTS 表" : "导入 PTS 表")}
                <input
                  type="file"
                  accept=".csv"
                  aria-label={t("导入 PTS 表")}
                  onChange={(e) => {
                    void importPTS(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              {pts && (
                <button
                  className="button"
                  onClick={() => {
                    props.onPlaying(false);
                    setEnabled(false);
                    setPTS(null);
                    setAutoEnabled(true);
                  }}
                >
                  {t("改用 FPS")}
                </button>
              )}
            </div>
            {!synced && (
              <div className="media-image-seek">
                <button
                  className="icon-button"
                  aria-label={t("上一张图片")}
                  disabled={previewIndex === 0}
                  onClick={() => setPreviewIndex((i) => i - 1)}
                >
                  <ChevronLeft size={15} />
                </button>
                <input
                  type="range"
                  aria-label={t("图片预览帧")}
                  min="0"
                  max={asset.frames.length - 1}
                  value={previewIndex}
                  onChange={(e) => setPreviewIndex(Number(e.target.value))}
                />
                <button
                  className="icon-button"
                  aria-label={t("下一张图片")}
                  disabled={previewIndex === asset.frames.length - 1}
                  onClick={() => setPreviewIndex((i) => i + 1)}
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            )}
          </>
        )}
        {asset && (
          <>
            <div className="media-readout">
              <span>
                {t(
                  synced
                    ? mapping.source === "auto"
                      ? "自动对齐 · 待复核"
                      : "已建立时间对应 · 待复核"
                    : "独立预览",
                )}
              </span>
              <span>
                {t("视频时间")}{" "}
                {Number.isFinite(displayTime) ? displayTime.toFixed(4) : "—"} s
              </span>
              <span>
                {t("C3D 帧")} {props.meta.firstFrame + props.frame}
              </span>
            </div>
            {!synced && asset.kind === "video" && (
              <label className="media-preview-time">
                {t("预览视频时间（秒）")}
                <input
                  type="number"
                  min="0"
                  max={duration}
                  step="0.01"
                  value={Number(previewTime.toFixed(4))}
                  onChange={(e) => {
                    const time = Number(e.target.value);
                    if (
                      video.current &&
                      Number.isFinite(time) &&
                      time >= 0 &&
                      time < duration
                    ) {
                      video.current.pause();
                      video.current.currentTime = time;
                      setPreviewTime(time);
                    }
                  }}
                />
              </label>
            )}
            <AutomaticAlignmentStatus
              automatic={automatic}
              ready={ready && !props.blocked}
              subjectX={subjectX}
              onSubjectX={setSubjectX}
              onCandidate={(candidate) =>
                apply({
                  baseline: 0,
                  lag: candidate,
                  source: "candidate",
                  evidence: automatic.job?.result || undefined,
                })
              }
            />
            <div className="sync-actions">
              {!synced ? (
                <button
                  className="button primary"
                  disabled={!ready || props.blocked}
                  onClick={anchor}
                >
                  <Link2 size={14} />
                  {t("将当前画面对齐到此 C3D 帧")}
                </button>
              ) : (
                <button
                  className="button"
                  onClick={() => {
                    props.onPlaying(false);
                    video.current?.pause();
                    setEnabled(false);
                    automatic.cancel();
                    setAutoEnabled(false);
                    setPreviewIndex(Math.max(0, nearest));
                  }}
                >
                  {t("调整对齐")}
                </button>
              )}
              <button
                className="button"
                disabled={!ready || props.blocked}
                onClick={() => {
                  props.onPlaying(false);
                  video.current?.pause();
                  automatic.cancel();
                  setAutoEnabled(false);
                  setSettings(true);
                }}
              >
                {t("时间对齐")}
              </button>
            </div>
            {synced && (
              <p className="sync-help">
                {range
                  ? t(
                      "同步区间：C3D 原始帧 {0}–{1}。使用下方时间轴播放、慢放和逐帧。",
                      [
                        range[0] + props.meta.firstFrame,
                        range[1] + props.meta.firstFrame,
                      ],
                    )
                  : t("当前观察区间与素材没有时间交集，请调整基线或偏移。")}
              </p>
            )}
            {!synced && (
              <p className="sync-help">
                {t(
                  "先定位 C3D 帧，再在上方预览相同动作，点击对齐。也可导入 COM 结果或填写偏移。",
                )}
              </p>
            )}
          </>
        )}
        {error && (
          <p className="error-text" role="alert">
            {t(error)}
          </p>
        )}
      </div>
      {settings && (
        <SyncSettings
          meta={props.meta}
          roi={props.roi}
          selection={props.selection}
          mapping={mapping}
          media={mediaIdentity!}
          origin={origin}
          onOrigin={setOrigin}
          onApply={apply}
          onExport={exportMapping}
          onClose={() => setSettings(false)}
        />
      )}
    </section>
  );
}
