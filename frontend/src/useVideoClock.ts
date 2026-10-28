import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { Acquisition } from "./types";

type Options = {
  video: RefObject<HTMLVideoElement | null>;
  meta: Acquisition;
  enabled: boolean;
  ready: boolean;
  framesReady: boolean;
  frame: number;
  playing: boolean;
  speed: number;
  loop: boolean;
  range: [number, number] | null;
  offset: number;
  origin: number;
  onFrame: (frame: number) => void;
  onPlaying: (playing: boolean) => void;
  onError: (message: string) => void;
};

export function useVideoClock(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const {
    video,
    meta,
    enabled,
    ready,
    framesReady,
    frame,
    playing,
    speed,
    range,
    offset,
    origin,
  } = options;

  // Paused C3D stepping seeks the media; while playing, only the media clock
  // advances C3D. Running a second wall clock here would accumulate drift.
  useEffect(() => {
    const element = video.current;
    if (!element || !enabled || !ready || playing) return;
    element.pause();
    const target = offset + frame / meta.pointRate - origin;
    if (
      target >= 0 &&
      target < element.duration &&
      Math.abs(element.currentTime - target) > 0.00001
    )
      element.currentTime = target;
  }, [video, enabled, ready, frame, playing, meta.pointRate, offset, origin]);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (!enabled || !ready || !playing || !framesReady || !range) {
      element.pause();
      return;
    }
    let disposed = false;
    element.playbackRate = speed;
    const start = Math.max(range[0], Math.min(range[1], latest.current.frame));
    element.currentTime = offset + start / meta.pointRate - origin;
    void element.play().catch(() => {
      if (disposed) return;
      latest.current.onPlaying(false);
      latest.current.onError("视频无法播放，请检查格式或重新导入。");
    });
    return () => {
      disposed = true;
      element.pause();
    };
  }, [
    video,
    enabled,
    ready,
    playing,
    framesReady,
    speed,
    range?.[0],
    range?.[1],
    offset,
    origin,
    meta.pointRate,
  ]);

  useEffect(() => {
    const element = video.current;
    if (!element || !enabled || !ready || !playing) return;
    let handle = 0,
      disposed = false;
    const nativeFrames =
      typeof element.requestVideoFrameCallback === "function";
    const finish = () => {
      const p = latest.current;
      if (!p.range || !p.playing) return;
      if (p.loop && p.range[1] > p.range[0]) {
        element.currentTime =
          p.offset + p.range[0] / p.meta.pointRate - p.origin;
        p.onFrame(p.range[0]);
        void element.play().catch(() => p.onPlaying(false));
      } else {
        element.pause();
        p.onFrame(p.range[1]);
        p.onPlaying(false);
      }
    };
    const update = (mediaTime: number) => {
      if (disposed) return;
      const p = latest.current;
      if (!element.seeking && p.playing && p.framesReady && p.range) {
        const position = (mediaTime + p.origin - p.offset) * p.meta.pointRate;
        if (position >= p.range[1]) finish();
        else if (position >= p.range[0] - 0.5)
          p.onFrame(
            Math.max(p.range[0], Math.min(p.range[1], Math.round(position))),
          );
      }
      schedule();
    };
    const schedule = () => {
      if (disposed) return;
      handle = nativeFrames
        ? element.requestVideoFrameCallback((_now, metadata) =>
            update(metadata.mediaTime),
          )
        : requestAnimationFrame(() => update(element.currentTime));
    };
    element.addEventListener("ended", finish);
    schedule();
    return () => {
      disposed = true;
      element.removeEventListener("ended", finish);
      if (nativeFrames) element.cancelVideoFrameCallback(handle);
      else cancelAnimationFrame(handle);
    };
  }, [video, enabled, ready, playing]);
}
