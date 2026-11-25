import {
  ChevronsLeft,
  ChevronsRight,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { IconButton } from "./IconButton";
import { usePreferences } from "./Preferences";
import type { Acquisition } from "./types";
import type { Playback } from "./usePlayback";

// Transport, speed, loop, time and frame readouts, event ticks and scrubber.
export function TimelinePanel({
  meta,
  playback,
  sourceChanged,
  togglePlay,
}: {
  meta: Acquisition | null;
  playback: Playback;
  sourceChanged: boolean;
  togglePlay: () => void;
}) {
  const { t } = usePreferences();
  const {
    frame,
    playing,
    setPlaying,
    speed,
    setSpeed,
    loop,
    setLoop,
    roi,
    playbackRange,
    seek,
  } = playback;
  const clock = meta ? frame / meta.pointRate : 0;
  const lastTime = meta ? (meta.frameCount - 1) / meta.pointRate : 0;
  return (
    <section className="timeline-panel" aria-label={t("播放时间轴")}>
      <div className="playback-controls">
        <div className="transport">
          <IconButton
            label={t("跳至区间开头")}
            onClick={() => {
              setPlaying(false);
              seek(roi[0]);
            }}
            disabled={!meta}
          >
            <ChevronsLeft size={16} />
          </IconButton>
          <IconButton
            label={t("上一帧")}
            onClick={() => {
              setPlaying(false);
              seek(frame - 1);
            }}
            disabled={!meta}
          >
            <SkipBack size={15} />
          </IconButton>
          <button
            className="play-button"
            aria-label={playing ? t("暂停") : t("播放")}
            disabled={!meta || sourceChanged || !playbackRange}
            onClick={togglePlay}
          >
            {playing ? (
              <Pause size={15} fill="currentColor" />
            ) : (
              <Play size={15} fill="currentColor" />
            )}
          </button>
          <IconButton
            label={t("下一帧")}
            onClick={() => {
              setPlaying(false);
              seek(frame + 1);
            }}
            disabled={!meta}
          >
            <SkipForward size={15} />
          </IconButton>
          <IconButton
            label={t("跳至区间末尾")}
            onClick={() => {
              setPlaying(false);
              seek(roi[1]);
            }}
            disabled={!meta}
          >
            <ChevronsRight size={16} />
          </IconButton>
          <select
            aria-label={t("播放速度")}
            value={speed}
            onChange={(e) => setSpeed(+e.target.value)}
          >
            {[0.1, 0.25, 0.5, 1, 2].map((v) => (
              <option key={v} value={v}>
                {v}×
              </option>
            ))}
          </select>
          <button
            className={`text-toggle ${loop ? "active" : ""}`}
            onClick={() => setLoop((v) => !v)}
            aria-pressed={loop}
          >
            {t("循环")}
          </button>
        </div>
        <div className="time-readout">
          <strong>
            {clock.toFixed(3)} <small>s</small>
          </strong>
          <span>/ {lastTime.toFixed(3)} s</span>
        </div>
        <div className="frame-readout">
          <span>{t("帧")}</span>
          <input
            aria-label={t("当前帧")}
            type="number"
            min={meta ? roi[0] + meta.firstFrame : 0}
            max={meta ? roi[1] + meta.firstFrame : 0}
            value={meta ? meta.firstFrame + frame : 0}
            onChange={(e) => {
              if (meta) {
                setPlaying(false);
                seek(+e.target.value - meta.firstFrame);
              }
            }}
          />
          <span>/ {meta?.lastFrame || "—"}</span>
        </div>
      </div>
      <div className="scrubber">
        <div className="event-ticks">
          {meta?.events
            .filter((e) => e.time >= 0 && e.time <= lastTime)
            .map((e, i) => (
              <button
                key={i}
                className={`event-tick ${e.context === "Left" ? "left" : ""}`}
                style={{
                  left: `${(e.time / Math.max(0.001, lastTime)) * 100}%`,
                }}
                aria-label={t("{0} {1}，帧 {2}", [e.context, e.label, e.frame])}
                title={t("{0} {1} · 帧 {2}", [e.context, e.label, e.frame])}
                onClick={() => {
                  setPlaying(false);
                  seek(e.frame - meta.firstFrame);
                }}
              />
            ))}
        </div>
        <input
          aria-label={t("时间轴")}
          type="range"
          min={0}
          max={meta?.frameCount ? meta.frameCount - 1 : 1}
          value={frame}
          onChange={(e) => {
            setPlaying(false);
            seek(+e.target.value);
          }}
          style={
            {
              "--progress": `${(frame / Math.max(1, (meta?.frameCount || 1) - 1)) * 100}%`,
            } as React.CSSProperties
          }
        />
        <div className="timeline-labels">
          <span>{meta?.firstFrame || 0}</span>
          <span>{t("相对时间 · 事件标记可点击")}</span>
          <span>{meta?.lastFrame || 0}</span>
        </div>
      </div>
    </section>
  );
}
