import { useCallback, useEffect, useState } from "react";
import type { MediaClock } from "./synchronization";
import type { Acquisition } from "./types";
import {
  clampFrame,
  observationRange,
  playbackFrame,
  type FrameRange,
} from "./workbench";

// Current frame, observation range and playback settings. Synchronized media
// replaces the observation range with its own coverage while it drives time.
export function usePlayback(meta: Acquisition | null, mediaClock: MediaClock) {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(true);
  const [roi, setRoi] = useState<FrameRange>([0, 0]);
  const playbackRange = mediaClock.mode ? mediaClock.range : roi;

  const reset = useCallback((frameCount: number) => {
    setPlaying(false);
    setFrame(0);
    setRoi([0, frameCount - 1]);
  }, []);
  const seek = useCallback(
    (index: number) => {
      if (!meta) return;
      setPlaying(false);
      setFrame(clampFrame(index, roi));
    },
    [meta, roi],
  );
  const advanceMediaFrame = useCallback(
    (index: number) => {
      if (meta && Number.isFinite(index))
        setFrame(clampFrame(index, [0, meta.frameCount - 1]));
    },
    [meta],
  );
  const updateRoi = (a: number, b: number) => {
    const range = meta && observationRange(a, b, meta.frameCount);
    if (!range) return;
    setRoi(range);
    setFrame((f) => clampFrame(f, range));
    setPlaying(false);
  };
  // Starting from outside the playable range rewinds to its start.
  const toggle = useCallback(() => {
    if (!meta || !playbackRange) return;
    if (frame < playbackRange[0] || frame >= playbackRange[1])
      setFrame(playbackRange[0]);
    setPlaying((p) => !p);
  }, [meta, frame, playbackRange]);

  return {
    frame,
    setFrame,
    playing,
    setPlaying,
    speed,
    setSpeed,
    loop,
    setLoop,
    roi,
    playbackRange,
    reset,
    seek,
    advanceMediaFrame,
    updateRoi,
    toggle,
  };
}
export type Playback = ReturnType<typeof usePlayback>;

// Advances the frame in recording time while playing. Video synchronization
// drives the frame from the media clock instead.
export function usePlaybackClock(
  playback: Playback,
  meta: Acquisition | null,
  framesReady: boolean,
  mediaMode: MediaClock["mode"],
) {
  const { playing, speed, loop, playbackRange, frame, setFrame, setPlaying } =
    playback;
  useEffect(() => {
    if (
      !playing ||
      !meta ||
      !framesReady ||
      !playbackRange ||
      mediaMode === "video"
    )
      return;
    let handle = 0;
    const start = performance.now(),
      initial = frame;
    const tick = (now: number) => {
      const next = playbackFrame(
        initial,
        now - start,
        meta.pointRate,
        speed,
        playbackRange,
        loop,
      );
      setFrame(next.frame);
      if (next.stopped) {
        setPlaying(false);
        return;
      }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
    // Restart the clock only on a chunk boundary or playback change.
  }, [
    playing,
    meta,
    speed,
    loop,
    playbackRange,
    mediaMode,
    Math.floor(frame / 500),
    framesReady,
  ]);
}
