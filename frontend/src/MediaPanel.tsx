import { createPortal } from "react-dom";
import { Film, X, Maximize2, Minimize2, Play, Pause } from "lucide-react";
import { usePreferences } from "./Preferences";
import type { Selection } from "./types";
import { SyncSettings } from "./SyncSettings";
import { ComparisonControls } from "./ComparisonControls";
import { MediaStage } from "./MediaStage";
import { MediaSourceControls } from "./MediaSourceControls";
import { AlignmentControls } from "./AlignmentControls";
import { useMediaSync, type MediaSyncOptions } from "./useMediaSync";
import { indexStatus } from "./mediaAlignment";

type Props = MediaSyncOptions & {
  onTrial: (id: string) => void;
  comparisonHost: HTMLDivElement | null;
  selection: Selection;
  onClose: () => void;
};
export function MediaPanel(props: Props) {
  const { t } = usePreferences();
  const media = useMediaSync(props);
  const { asset, synced, timing, sharedTraining } = media;
  const unavailable = media.outOfRange || media.missingImage;
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
  const [trainingNotice, trainingParams] = media.trainingNotice;
  return (
    <section
      className={`media-panel ${props.expanded ? "expanded" : ""}`}
      aria-label={t("视频与图片同步")}
    >
      {asset &&
        props.comparisonHost &&
        createPortal(
          <ComparisonControls
            time={unavailable ? NaN : media.displayTime}
            mediaFrame={
              unavailable
                ? null
                : asset.kind === "video"
                  ? timing.frame < 0
                    ? null
                    : timing.frame
                  : (asset.frames[media.imageIndex]?.frame ?? null)
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
            status={media.status}
            indexStatus={indexStatus(asset.kind, timing)}
            offset={media.offset}
            sharedLag={
              sharedTraining && media.training.result?.lag != null
                ? media.training.result.lag
                : undefined
            }
            rate={props.meta.pointRate}
            synced={synced}
            blocked={props.blocked || media.recognizing}
            stepping={timing.seeking}
            canUndo={!!media.beforeNudge}
            canNudge={!sharedTraining}
            onTime={(time) => media.seekMedia(time)}
            onMediaFrame={media.seekMediaFrame}
            onMediaStep={media.stepMedia}
            onVicon={media.seekVicon}
            onNudge={media.nudge}
            onUndo={media.undoNudge}
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
          <span>{t(trainingNotice, trainingParams)}</span>
        </div>
      )}
      {media.reuseNotice && (
        <div className="trial-media-notice" role="status">
          <span>{t(media.reuseNotice)}</span>
          {media.restored && media.automatic.available && !media.isTraining && (
            <button
              className="button"
              disabled={!media.ready || props.blocked}
              onClick={media.recheck}
            >
              {t("重新检查当前试次")}
            </button>
          )}
        </div>
      )}
      <MediaStage
        media={media}
        expanded={props.expanded}
        onExpanded={props.onExpanded}
      />
      <div className="media-controls">
        <MediaSourceControls media={media} />
        {asset && (
          <AlignmentControls
            media={media}
            asset={asset}
            meta={props.meta}
            blocked={props.blocked}
            onTrial={props.onTrial}
          />
        )}
        {media.error && (
          <p className="error-text" role="alert">
            {t(media.error)}
          </p>
        )}
      </div>
      {media.settings && (
        <SyncSettings
          meta={props.meta}
          roi={props.roi}
          selection={props.selection}
          mapping={media.mapping}
          media={media.mediaIdentity!}
          origin={media.origin}
          onOrigin={media.setOrigin}
          onApply={media.apply}
          onExport={media.exportMapping}
          onClose={media.closeSettings}
        />
      )}
    </section>
  );
}
