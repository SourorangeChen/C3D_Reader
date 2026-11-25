import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { Acquisition } from "./types";
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
import type { MediaClock, SyncMapping } from "./synchronization";
import { useVideoClock } from "./useVideoClock";
import { useAutomaticAlignment } from "./useAutomaticAlignment";
import {
  startTraining,
  cancelTraining,
  subscribeTraining,
} from "./trainingSession";
import { desktop } from "./desktop";
import { useVideoTiming } from "./useVideoTiming";
import {
  acquisitionKey,
  type MediaAsset,
  type MediaSession,
} from "./mediaSession";
import { errorMessage } from "./errors";
import {
  anchorMapping,
  clampViconFrame,
  EMPTY_MAPPING,
  imageAtTime,
  imageSamplePeriod,
  imageSampleTimes,
  mediaBounds,
  mediaIdentity as identify,
  mediaSeekTarget,
  nudgeMapping,
  reuseNotice as reuseCopy,
  syncExport,
  syncStatus,
  trainingNotice as trainingCopy,
  trainingTrialFor,
} from "./mediaAlignment";

export type MediaSyncOptions = {
  session: MediaSession;
  trialIds: string[];
  meta: Acquisition;
  frame: number;
  playing: boolean;
  expanded: boolean;
  onExpanded: (expanded: boolean) => void;
  speed: number;
  loop: boolean;
  roi: [number, number];
  framesReady: boolean;
  blocked: boolean;
  incoming: File[] | null;
  onConsumed: () => void;
  onClock: (clock: MediaClock) => void;
  onFrame: (frame: number) => void;
  onPlaying: (playing: boolean) => void;
};
export type MediaSync = ReturnType<typeof useMediaSync>;

/**
 * State of the media panel for one trial: the imported material and its
 * timing, the alignment (automatic, shared-lag or manual), media seeking and
 * the clock it hands to playback. The panel is keyed by trial, so this hook
 * restores the trial's saved setup, or the material kept from the last one.
 */
export function useMediaSync(props: MediaSyncOptions) {
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
    initial.saved?.mapping ?? EMPTY_MAPPING,
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

  // Timing of the material and where the current C3D frame falls in it.
  const offset = mapping.baseline + mapping.lag;
  const sourceTime = offset + props.frame / props.meta.pointRate;
  const imageTimes = useMemo(
    () => imageSampleTimes(asset, pts, fps, frameBase),
    [asset, pts, fps, frameBase],
  );
  const imagePeriod = useMemo(
    () => imageSamplePeriod(asset, pts, fps),
    [asset, pts, fps],
  );
  const { ready, firstTime, lastTime } = mediaBounds(
    asset,
    duration,
    origin,
    imageTimes,
    imagePeriod,
  );
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
  const sample = imageAtTime(asset, imageTimes, imagePeriod, sourceTime);
  const nearest = sample.nearest;
  const missingImage = synced && sample.missing;
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

  const stopPlayback = () => {
    props.onPlaying(false);
    video.current?.pause();
  };
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
      setMapping(EMPTY_MAPPING);
      setMediaSeek(null);
      setBeforeNudge(null);
    } catch (e) {
      setError(errorMessage(e));
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

  // Automatic alignment: one trial for image sequences, a shared lag from a
  // reference trial for videos.
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
      stopPlayback();
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
  const sharedTraining = trainingCurrent && method === "auto";
  const runTraining = () => {
    if (!asset || !ready || props.blocked) return;
    setEnabled(false);
    setRestored(false);
    setAutoEnabled(true);
    stopPlayback();
    void startTraining(
      props.session,
      { asset, fps, frameBase, pts, origin, subjectX },
      {
        acquisitionId: props.meta.id,
        acquisitionIds: props.trialIds,
        start: props.roi[0],
        stop: props.roi[1] + 1,
        origin,
        subjectX: Number(subjectX),
      },
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
      stopPlayback();
    } else if (training.result) {
      const saved = props.session.trials.get(trialKey);
      if (saved?.asset === asset && !props.blocked) {
        setMapping(saved.mapping);
        setEnabled(true);
        setError("");
      } else setEnabled(false);
    }
  }, [training, trialKey, method, props.blocked]);

  // Alignment actions.
  const switchToManual = () => {
    automatic.cancel();
    setAutoEnabled(false);
    setMethod("manual");
  };
  const apply = (value: SyncMapping) => {
    setRestored(false);
    if (value.source !== "auto") switchToManual();
    stopPlayback();
    setMapping(value);
    setMediaSeek(null);
    setBeforeNudge(null);
    setEnabled(true);
    setError("");
  };
  const editManually = () => {
    setRestored(false);
    switchToManual();
    stopPlayback();
    setEnabled(false);
    if (synced) setPreviewIndex(Math.max(0, nearest));
    setPreviewTime(video.current?.currentTime || 0);
  };
  const chooseAutomatic = () => {
    if (method === "auto") return;
    setMethod("auto");
    setAutoEnabled(true);
    if (isTraining && ready) runTraining();
  };
  const recheck = () => {
    setRestored(false);
    setMethod("auto");
    setAutoEnabled(true);
  };
  const openSettings = () => {
    stopPlayback();
    switchToManual();
    setSettings(true);
  };
  const anchor = () => {
    const time =
      asset?.kind === "video"
        ? (video.current?.currentTime || 0) + origin
        : imageTimes[previewIndex];
    if (!Number.isFinite(time)) return;
    apply(anchorMapping(mapping, time, props.frame, props.meta.pointRate));
  };
  const nudge = (direction: number) => {
    const original = beforeNudge ?? mapping;
    apply(nudgeMapping(mapping, direction, props.meta.pointRate));
    setBeforeNudge(original);
  };
  const undoNudge = () => {
    if (beforeNudge) apply(beforeNudge);
  };

  // Image-sequence timing: FPS and frame base, or a PTS table.
  const retime = () => {
    props.onPlaying(false);
    setEnabled(false);
    setAutoEnabled(true);
  };
  const changeFPS = (value: string) => {
    retime();
    setFPS(value);
  };
  const changeFrameBase = (value: string) => {
    retime();
    setFrameBase(value);
  };
  const clearPTS = () => {
    retime();
    setPTS(null);
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
      if (version === readVersion.current) setError(errorMessage(e));
    }
  };
  const mediaIdentity = useMemo(
    () => identify(asset, imageTimes),
    [asset, imageTimes],
  );
  const exportMapping = () => {
    if (!asset) return;
    saveJSON(
      "c3d-video-sync.json",
      syncExport(props.meta, asset, {
        mapping,
        origin,
        pts,
        fps,
        frameBase,
        imageTimes,
      }),
    );
  };

  // Seeking from the comparison toolbar.
  const seekVicon = (rawFrame: number) => {
    if (props.blocked) return;
    stopPlayback();
    setMediaSeek(null);
    props.onFrame(clampViconFrame(rawFrame, props.meta.firstFrame, props.roi));
  };
  const seekMedia = (time: number, index?: number) => {
    if (!ready || props.blocked || !Number.isFinite(time)) return;
    const target = mediaSeekTarget(time, {
      firstTime,
      lastTime,
      offset,
      rate: props.meta.pointRate,
      synced,
      range,
    });
    if ("error" in target) {
      setError(target.error);
      return;
    }
    stopPlayback();
    if (synced) {
      setMediaSeek({
        frame: target.frame,
        time: time - origin,
        imageIndex: index,
      });
      props.onFrame(target.frame);
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

  // Media element events.
  const videoLoaded = (value: number) => {
    if (Number.isFinite(value) && value > 0) setDuration(value);
    else setError("视频时长不可用，请重新导入。");
  };
  const videoFailed = () => {
    props.session.trials.delete(trialKey);
    setRestored(false);
    setError("视频无法解码，请选择浏览器支持的视频格式。");
    setEnabled(false);
    setDuration(0);
    setAutoEnabled(false);
    automatic.cancel();
    props.onPlaying(false);
  };

  const recognizing = automatic.job?.status === "running";
  const trainingTrial = trainingCurrent
    ? trainingTrialFor(training.result, props.meta.id, trialKey, acquisitionKey)
    : undefined;
  return {
    asset,
    video,
    timing,
    training,
    trialKey,
    method,
    subjectX,
    setSubjectX,
    mapping,
    origin,
    setOrigin,
    fps,
    frameBase,
    pts,
    previewIndex,
    setPreviewIndex,
    setPreviewTime,
    settings,
    closeSettings: () => setSettings(false),
    error,
    setError,
    beforeNudge,
    offset,
    imageTimes,
    ready,
    range,
    synced,
    outOfRange,
    missingImage,
    imageIndex,
    imageFile,
    isTraining,
    trainingCurrent,
    sharedTraining,
    automatic,
    singleAutomatic,
    recognizing,
    restored,
    mediaIdentity,
    displayTime:
      asset?.kind === "video"
        ? (timing.presentedTime ?? previewTime) + origin
        : imageTimes[imageIndex],
    status: syncStatus(synced, mapping, recognizing),
    reuseNotice: reuseCopy({
      sharedTraining,
      restored,
      reusingMedia,
      synced,
      recognizing,
      rejected:
        !!automatic.error || automatic.job?.result?.status === "rejected",
    }),
    trainingNotice: sharedTraining
      ? trainingCopy(training, trainingTrial, recognizing)
      : ([""] as [string]),
    importFiles,
    importPTS,
    changeFPS,
    changeFrameBase,
    clearPTS,
    runTraining,
    chooseAutomatic,
    editManually,
    recheck,
    openSettings,
    apply,
    anchor,
    nudge,
    undoNudge,
    exportMapping,
    seekVicon,
    seekMedia,
    seekMediaFrame,
    stepMedia,
    videoLoaded,
    videoFailed,
  };
}
