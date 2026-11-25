import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import {
  Film,
  Images,
  Link2,
  X,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Play,
  Pause,
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
import type { MediaClock, MediaIdentity, SyncMapping } from "./synchronization";
import { SyncSettings } from "./SyncSettings";
import { useVideoClock } from "./useVideoClock";
import { useAutomaticAlignment } from "./useAutomaticAlignment";
import { AutomaticAlignmentStatus } from "./AutomaticAlignmentStatus";
import {
  startTraining,
  cancelTraining,
  subscribeTraining,
} from "./trainingSession";
import { TrainingAlignmentStatus } from "./TrainingAlignmentStatus";
import { desktop } from "./desktop";
import { useVideoTiming } from "./useVideoTiming";
import { ComparisonControls } from "./ComparisonControls";
import {
  acquisitionKey,
  type MediaAsset,
  type MediaSession,
} from "./mediaSession";

type Props = {
  session: MediaSession;
  trialIds: string[];
  onTrial: (id: string) => void;
  meta: Acquisition;
  frame: number;
  playing: boolean;
  expanded: boolean;
  comparisonHost: HTMLDivElement | null;
  onExpanded: (expanded: boolean) => void;
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
  const training = useSyncExternalStore(
    (listener) => subscribeTraining(props.session, listener),
    () => props.session.training,
  );
  const trialKey = acquisitionKey(props.meta);
  const initial = useRef({
    saved: props.session.trials.get(trialKey),
    setup: props.session.trials.get(trialKey) ?? props.session.active,
  }).current;
  const [asset, setAsset] = useState<MediaAsset | null>(
    initial.setup?.asset ?? null,
  );
  const [duration, setDuration] = useState(0);
  const [enabled, setEnabled] = useState(!!initial.saved);
  const [autoEnabled, setAutoEnabled] = useState(!initial.saved);
  const [restored, setRestored] = useState(!!initial.saved);
  const [reusingMedia, setReusingMedia] = useState(!!initial.setup);
  const [method, setMethod] = useState<"auto" | "manual">(
    initial.saved
      ? initial.saved.mapping.source === "auto"
        ? "auto"
        : "manual"
      : desktop?.startAutoAlignment
        ? "auto"
        : "manual",
  );
  const [subjectX, setSubjectX] = useState(initial.setup?.subjectX ?? "0.5");
  const [mapping, setMapping] = useState<SyncMapping>(
    initial.saved?.mapping ?? {
      baseline: 0,
      lag: 0,
      source: "manual",
    },
  );
  const [origin, setOrigin] = useState(initial.setup?.origin ?? 0);
  const [fps, setFPS] = useState(initial.setup?.fps ?? "");
  const [frameBase, setFrameBase] = useState(initial.setup?.frameBase ?? "0");
  const [pts, setPTS] = useState<number[] | null>(initial.setup?.pts ?? null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewTime, setPreviewTime] = useState(0);
  const [settings, setSettings] = useState(false);
  const [error, setError] = useState("");
  const [mediaSeek, setMediaSeek] = useState<{
    frame: number;
    time: number;
    imageIndex?: number;
  } | null>(null);
  const [beforeNudge, setBeforeNudge] = useState<SyncMapping | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const timing = useVideoTiming(
    asset?.kind === "video" ? asset.file : undefined,
    video,
  );
  const readVersion = useRef(0);
  useEffect(() => {
    if (!asset) return;
    const setup = { asset, fps, frameBase, pts, origin, subjectX };
    props.session.active = setup;
    if (enabled && !props.blocked) {
      props.session.trials.delete(trialKey);
      props.session.trials.set(trialKey, { ...setup, mapping });
      if (props.session.trials.size > 250)
        props.session.trials.delete(props.session.trials.keys().next().value!);
    }
  }, [
    asset,
    fps,
    frameBase,
    pts,
    origin,
    subjectX,
    enabled,
    mapping,
    props.blocked,
    props.session,
    trialKey,
  ]);
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
  useEffect(() => {
    if (props.playing && synced && asset) props.onExpanded(true);
  }, [props.playing, synced, asset, props.onExpanded]);
  useEffect(() => () => props.onExpanded(false), [props.onExpanded]);
  useEffect(() => {
    if (!props.expanded) return;
    const restore = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !settings && !event.defaultPrevented) {
        props.onExpanded(false);
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", restore);
    return () => window.removeEventListener("keydown", restore);
  }, [props.expanded, props.onExpanded, settings]);
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
  const activeSeek =
    !props.playing && mediaSeek?.frame === props.frame ? mediaSeek : null;
  useEffect(() => {
    if (props.playing || mediaSeek?.frame !== props.frame) setMediaSeek(null);
  }, [props.playing, props.frame]);
  const imageIndex = synced
    ? (activeSeek?.imageIndex ?? nearest)
    : previewIndex;
  const imageFile =
    asset?.kind === "images" && !outOfRange && !missingImage
      ? asset.frames[imageIndex]?.file
      : undefined;
  const imageURL = useImageURL(imageFile);

  const importFiles = (files: File[]) => {
    if (!files.length) return;
    setError("");
    try {
      let next: MediaAsset;
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
      cancelTraining(props.session);
      if (next.kind === "video" && desktop?.startAutoAlignment)
        props.session.trials.clear();
      props.session.assets.add(next);
      props.onPlaying(false);
      setAsset(next);
      props.onExpanded(false);
      setDuration(0);
      setEnabled(false);
      setRestored(false);
      setReusingMedia(false);
      setAutoEnabled(true);
      setMethod(desktop?.startAutoAlignment ? "auto" : "manual");
      setPTS(null);
      setFrameBase("0");
      setFPS("");
      setPreviewIndex(0);
      setPreviewTime(0);
      setOrigin(0);
      setMapping({ baseline: 0, lag: 0, source: "manual" });
      setMediaSeek(null);
      setBeforeNudge(null);
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
      props.session.trials.delete(trialKey);
      setRestored(false);
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
    pausedMediaTime: activeSeek?.time,
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
  const singleAutomatic = useAutomaticAlignment({
    files: automaticFiles,
    times: asset?.kind === "images" ? imageTimes : undefined,
    acquisitionId: props.meta.id,
    start: props.roi[0],
    stop: props.roi[1] + 1,
    origin,
    subjectX: Number(subjectX),
    ready,
    enabled: autoEnabled && method === "auto" && asset?.kind !== "video",
    blocked: props.blocked,
    onStart: () => {
      props.session.trials.delete(trialKey);
      setRestored(false);
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
  const isTraining = asset?.kind === "video";
  const trainingCurrent = isTraining && training.asset === asset;
  const trainingOptions = () => ({
    acquisitionId: props.meta.id,
    acquisitionIds: props.trialIds,
    start: props.roi[0],
    stop: props.roi[1] + 1,
    origin,
    subjectX: Number(subjectX),
  });
  const runTraining = () => {
    if (!asset || !ready || props.blocked) return;
    setEnabled(false);
    setRestored(false);
    setAutoEnabled(true);
    props.onPlaying(false);
    video.current?.pause();
    void startTraining(
      props.session,
      { asset, fps, frameBase, pts, origin, subjectX },
      trainingOptions(),
      props.meta.name,
    );
  };
  const automatic = isTraining
    ? {
        available: !!desktop?.startAutoAlignment,
        job: trainingCurrent ? training.job : null,
        error: trainingCurrent ? training.error : "",
        start: runTraining,
        cancel: () => cancelTraining(props.session),
      }
    : singleAutomatic;
  useEffect(() => {
    if (
      isTraining &&
      ready &&
      autoEnabled &&
      method === "auto" &&
      !props.blocked &&
      training.asset !== asset
    )
      runTraining();
  }, [asset, ready, autoEnabled, method, props.blocked]);
  useEffect(() => {
    if (!trainingCurrent || method !== "auto") return;
    if (training.job?.status === "running") {
      setEnabled(false);
      setRestored(false);
      props.onPlaying(false);
      video.current?.pause();
    } else if (training.result) {
      const saved = props.session.trials.get(trialKey);
      if (saved?.asset === asset && !props.blocked) {
        setMapping(saved.mapping);
        setEnabled(true);
        setError("");
      } else setEnabled(false);
    }
  }, [training, trialKey, method, props.blocked]);
  const apply = (value: SyncMapping) => {
    setRestored(false);
    if (value.source !== "auto") {
      automatic.cancel();
      setAutoEnabled(false);
      setMethod("manual");
    }
    props.onPlaying(false);
    video.current?.pause();
    setMapping(value);
    setMediaSeek(null);
    setBeforeNudge(null);
    setEnabled(true);
    setError("");
  };
  const editManually = () => {
    setRestored(false);
    automatic.cancel();
    setAutoEnabled(false);
    setMethod("manual");
    props.onPlaying(false);
    video.current?.pause();
    setEnabled(false);
    if (synced) setPreviewIndex(Math.max(0, nearest));
    setPreviewTime(video.current?.currentTime || 0);
  };
  const recognizing = automatic.job?.status === "running";
  const reuseNotice =
    isTraining && trainingCurrent && method === "auto"
      ? ""
      : restored
        ? "已恢复当前试次的素材与对齐。"
        : reusingMedia && !synced
          ? recognizing
            ? "已保留素材，正在检查是否包含当前试次的动作…"
            : automatic.error || automatic.job?.result?.status === "rejected"
              ? "当前素材尚未通过此试次的动作匹配。可更换素材，或手动对齐。"
              : "已保留素材；当前试次尚未对齐。"
          : "";
  const trainingTrial = trainingCurrent
    ? training.result?.trials.find(
        (trial) =>
          trial.acquisition.id === props.meta.id &&
          (trial.status === "rejected" ||
            acquisitionKey(trial.acquisition) === trialKey),
      )
    : undefined;
  const trainingNotice =
    trainingCurrent && method === "auto"
      ? training.error
        ? "参考 trial 对齐失败，请更换 trial 后重试。"
        : recognizing
          ? t("正在使用 {0} 确定 lag… {1}%", [
              training.referenceName,
              Math.round(training.job!.progress),
            ])
          : training.result
            ? trainingTrial?.status === "accepted"
              ? "参考 trial 已确定 lag，其他 trial 直接共享。"
              : trainingTrial?.status === "shared"
                ? "当前 trial 共享参考 trial 的 lag，未单独进行动作匹配。"
                : trainingTrial?.reason === "metadata_unavailable"
                  ? "无法读取当前 trial 的时间信息，未应用共享 lag。"
                  : training.result.lag != null
                    ? "当前 trial 未应用共享 lag，请以当前 trial 重新确定 lag。"
                    : "参考 trial 未能可靠确定 lag，请更换 trial 重试。"
            : training.job?.status === "cancelled"
              ? "参考 trial 对齐已取消，尚未共享 lag。"
              : ""
      : "";
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
  const seekVicon = (rawFrame: number) => {
    if (props.blocked) return;
    props.onPlaying(false);
    video.current?.pause();
    setMediaSeek(null);
    props.onFrame(
      Math.max(
        props.roi[0],
        Math.min(props.roi[1], Math.round(rawFrame) - props.meta.firstFrame),
      ),
    );
  };
  const seekMedia = (time: number, index?: number) => {
    if (!ready || props.blocked || !Number.isFinite(time)) return;
    if (time < firstTime || time > lastTime) {
      setError("视频时间超出素材范围。");
      return;
    }
    const vicon = Math.round((time - offset) * props.meta.pointRate);
    if (synced && (!range || vicon < range[0] || vicon > range[1])) {
      setError("该视频帧不在当前 Vicon 同步区间内。");
      return;
    }
    props.onPlaying(false);
    video.current?.pause();
    if (synced) {
      setMediaSeek({ frame: vicon, time: time - origin, imageIndex: index });
      props.onFrame(vicon);
    }
    if (asset?.kind === "video" && video.current) {
      video.current.currentTime = time - origin;
      setPreviewTime(time - origin);
    } else {
      setPreviewIndex(index ?? nearestSample(imageTimes, time));
    }
    setError("");
  };
  const seekMediaFrame = (rawFrame: number) => {
    if (!Number.isSafeInteger(rawFrame)) return;
    if (asset?.kind === "video") {
      if (rawFrame < 0 || rawFrame >= timing.times.length) return;
      seekMedia(timing.times[rawFrame] + origin + 0.000001);
    } else if (asset?.kind === "images") {
      const index = asset.frames.findIndex((item) => item.frame === rawFrame);
      if (index < 0) {
        setError("此帧号没有对应图片。");
        return;
      }
      seekMedia(imageTimes[index], index);
    }
  };
  const stepMedia = (direction: number) => {
    if (asset?.kind === "video") seekMediaFrame(timing.frame + direction);
    else if (asset?.kind === "images") {
      const next = asset.frames[imageIndex + direction];
      if (next) seekMediaFrame(next.frame);
    }
  };
  const nudge = (direction: number) => {
    const original = beforeNudge ?? mapping;
    apply({
      ...mapping,
      lag: mapping.lag + direction / props.meta.pointRate,
      source: "nudge",
    });
    setBeforeNudge(original);
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
    asset?.kind === "video"
      ? (timing.presentedTime ?? previewTime) + origin
      : imageTimes[imageIndex];
  const status = synced
    ? mapping.source === "auto"
      ? mapping.evidence?.motionChecked === false
        ? "共享 lag · 待复核"
        : "自动对齐 · 待复核"
      : mapping.source === "candidate"
        ? "候选对齐 · 待复核"
        : "已建立时间对应 · 待复核"
    : recognizing
      ? "正在自动对齐"
      : "尚未对齐";
  return (
    <section
      className={`media-panel ${props.expanded ? "expanded" : ""}`}
      aria-label={t("视频与图片同步")}
    >
      {asset &&
        props.comparisonHost &&
        createPortal(
          <ComparisonControls
            time={outOfRange || missingImage ? NaN : displayTime}
            mediaFrame={
              outOfRange || missingImage
                ? null
                : asset.kind === "video"
                  ? timing.frame < 0
                    ? null
                    : timing.frame
                  : (asset.frames[imageIndex]?.frame ?? null)
            }
            mediaFirst={asset.kind === "video" ? 0 : asset.frames[0].frame}
            mediaLast={
              asset.kind === "video"
                ? timing.times.length - 1
                : asset.frames.at(-1)!.frame
            }
            viconFrame={props.meta.firstFrame + props.frame}
            viconFirst={props.meta.firstFrame + props.roi[0]}
            viconLast={props.meta.firstFrame + props.roi[1]}
            status={status}
            indexStatus={
              asset.kind === "images"
                ? "图片使用源文件帧号"
                : timing.loading
                  ? "正在读取视频帧索引…"
                  : timing.seeking
                    ? "正在定位视频帧…"
                    : timing.error
                      ? "帧索引不可用；仍可按时间定位"
                      : "视频帧号从 0 开始"
            }
            offset={offset}
            sharedLag={
              trainingCurrent &&
              method === "auto" &&
              training.result?.lag != null
                ? training.result.lag
                : undefined
            }
            rate={props.meta.pointRate}
            synced={synced}
            blocked={props.blocked || recognizing}
            stepping={timing.seeking}
            canUndo={!!beforeNudge}
            canNudge={!(trainingCurrent && method === "auto")}
            onTime={(time) => seekMedia(time)}
            onMediaFrame={seekMediaFrame}
            onMediaStep={stepMedia}
            onVicon={seekVicon}
            onNudge={nudge}
            onUndo={() => {
              if (beforeNudge) apply(beforeNudge);
            }}
          />,
          props.comparisonHost,
        )}
      <div className="media-heading">
        <Film size={15} />
        <strong title={sourceName}>{sourceName}</strong>
        {props.expanded && synced && (
          <button
            className="icon-button"
            aria-label={t(props.playing ? "暂停视频" : "播放视频")}
            title={t(props.playing ? "暂停视频" : "播放视频")}
            onClick={() => props.onPlaying(!props.playing)}
          >
            {props.playing ? <Pause size={15} /> : <Play size={15} />}
          </button>
        )}
        {asset && (
          <button
            className="icon-button"
            aria-label={t(props.expanded ? "还原视频" : "放大视频")}
            title={t(props.expanded ? "还原视频（Esc）" : "放大视频")}
            aria-pressed={props.expanded}
            onClick={() => props.onExpanded(!props.expanded)}
          >
            {props.expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        )}
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
      {trainingNotice && (
        <div className="trial-media-notice" role="status">
          <span>{t(trainingNotice)}</span>
        </div>
      )}
      {reuseNotice && (
        <div className="trial-media-notice" role="status">
          <span>{t(reuseNotice)}</span>
          {restored && automatic.available && !isTraining && (
            <button
              className="button"
              disabled={!ready || props.blocked}
              onClick={() => {
                setRestored(false);
                setMethod("auto");
                setAutoEnabled(true);
              }}
            >
              {t("重新检查当前试次")}
            </button>
          )}
        </div>
      )}
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
            controls={!synced && !recognizing}
            aria-label={t("参考视频")}
            onKeyDown={(e) => {
              if (e.key === "Escape" && props.expanded) {
                props.onExpanded(false);
                e.preventDefault();
              }
              e.stopPropagation();
            }}
            onPlay={() => props.onExpanded(true)}
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration;
              if (Number.isFinite(d) && d > 0) setDuration(d);
              else setError("视频时长不可用，请重新导入。");
            }}
            onTimeUpdate={(e) => setPreviewTime(e.currentTarget.currentTime)}
            onError={() => {
              props.session.trials.delete(trialKey);
              setRestored(false);
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
          </>
        )}
        {asset && (
          <>
            <div
              className="alignment-methods"
              role="group"
              aria-label={t("对齐方式")}
            >
              <button
                className="button"
                aria-pressed={method === "auto"}
                disabled={!automatic.available || props.blocked}
                title={
                  !automatic.available
                    ? t("自动对齐需要 macOS 桌面版")
                    : undefined
                }
                onClick={() => {
                  if (method === "auto") return;
                  setMethod("auto");
                  setAutoEnabled(true);
                  if (isTraining && ready) runTraining();
                }}
              >
                {t("自动对齐")}
              </button>
              <button
                className="button"
                aria-pressed={method === "manual"}
                disabled={props.blocked}
                onClick={() => {
                  if (method !== "manual") editManually();
                }}
              >
                {t("手动对齐")}
              </button>
            </div>
            {method === "manual" && !synced && (
              <p className="sync-help manual-alignment-help">
                {t(
                  "先在下方时间轴定位 C3D 帧，再在素材中找到相同动作，最后应用手动对齐。",
                )}
              </p>
            )}
            {!synced && method === "manual" && asset.kind === "images" && (
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
            {method === "auto" && isTraining && (
              <TrainingAlignmentStatus
                state={trainingCurrent ? training : null}
                currentId={props.meta.id}
                currentKey={trialKey}
                ready={ready && !props.blocked}
                available={automatic.available}
                subjectX={subjectX}
                onSubjectX={setSubjectX}
                onStart={runTraining}
                onCancel={automatic.cancel}
                onTrial={props.onTrial}
              />
            )}
            {method === "auto" && !restored && !isTraining && (
              <AutomaticAlignmentStatus
                automatic={singleAutomatic}
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
            )}
            <div className="sync-actions">
              {!synced && method === "manual" ? (
                <button
                  className="button primary"
                  disabled={!ready || props.blocked}
                  onClick={anchor}
                >
                  <Link2 size={14} />
                  {t("应用手动对齐")}
                </button>
              ) : synced ? (
                <button className="button" onClick={editManually}>
                  {t("调整对齐")}
                </button>
              ) : null}
            </div>
            {!recognizing && (
              <details className="media-alignment-more">
                <summary>{t("更多对齐方式")}</summary>
                <p className="sync-help">
                  {t("已有 COM 结果，或需要直接填写时间偏移时使用。")}
                </p>
                <button
                  className="button"
                  disabled={!ready || props.blocked}
                  onClick={() => {
                    props.onPlaying(false);
                    video.current?.pause();
                    automatic.cancel();
                    setAutoEnabled(false);
                    setMethod("manual");
                    setSettings(true);
                  }}
                >
                  {t("导入结果 / 时间偏移")}
                </button>
              </details>
            )}
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
