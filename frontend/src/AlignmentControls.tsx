import { ChevronLeft, ChevronRight, Link2 } from "lucide-react";
import { usePreferences } from "./Preferences";
import type { Acquisition } from "./types";
import type { MediaAsset } from "./mediaSession";
import type { MediaSync } from "./useMediaSync";
import { AutomaticAlignmentStatus } from "./AutomaticAlignmentStatus";
import { TrainingAlignmentStatus } from "./TrainingAlignmentStatus";

/** Automatic / manual alignment choice and the controls for each. */
export function AlignmentControls({
  media,
  asset,
  meta,
  blocked,
  onTrial,
}: {
  media: MediaSync;
  asset: MediaAsset;
  meta: Acquisition;
  blocked: boolean;
  onTrial: (id: string) => void;
}) {
  const { t } = usePreferences();
  const { method, synced, ready, automatic, isTraining, range } = media;
  return (
    <>
      <div
        className="alignment-methods"
        role="group"
        aria-label={t("对齐方式")}
      >
        <button
          className="button"
          aria-pressed={method === "auto"}
          disabled={!automatic.available || blocked}
          title={
            !automatic.available ? t("自动对齐需要 macOS 桌面版") : undefined
          }
          onClick={media.chooseAutomatic}
        >
          {t("自动对齐")}
        </button>
        <button
          className="button"
          aria-pressed={method === "manual"}
          disabled={blocked}
          onClick={() => {
            if (method !== "manual") media.editManually();
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
            disabled={media.previewIndex === 0}
            onClick={() => media.setPreviewIndex((i) => i - 1)}
          >
            <ChevronLeft size={15} />
          </button>
          <input
            type="range"
            aria-label={t("图片预览帧")}
            min="0"
            max={asset.frames.length - 1}
            value={media.previewIndex}
            onChange={(e) => media.setPreviewIndex(Number(e.target.value))}
          />
          <button
            className="icon-button"
            aria-label={t("下一张图片")}
            disabled={media.previewIndex === asset.frames.length - 1}
            onClick={() => media.setPreviewIndex((i) => i + 1)}
          >
            <ChevronRight size={15} />
          </button>
        </div>
      )}
      {method === "auto" && isTraining && (
        <TrainingAlignmentStatus
          state={media.trainingCurrent ? media.training : null}
          currentId={meta.id}
          currentKey={media.trialKey}
          ready={ready && !blocked}
          available={automatic.available}
          subjectX={media.subjectX}
          onSubjectX={media.setSubjectX}
          onStart={media.runTraining}
          onCancel={automatic.cancel}
          onTrial={onTrial}
        />
      )}
      {method === "auto" && !media.restored && !isTraining && (
        <AutomaticAlignmentStatus
          automatic={media.singleAutomatic}
          ready={ready && !blocked}
          subjectX={media.subjectX}
          onSubjectX={media.setSubjectX}
          onCandidate={(candidate) =>
            media.apply({
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
            disabled={!ready || blocked}
            onClick={media.anchor}
          >
            <Link2 size={14} />
            {t("应用手动对齐")}
          </button>
        ) : synced ? (
          <button className="button" onClick={media.editManually}>
            {t("调整对齐")}
          </button>
        ) : null}
      </div>
      {!media.recognizing && (
        <details className="media-alignment-more">
          <summary>{t("更多对齐方式")}</summary>
          <p className="sync-help">
            {t("已有 COM 结果，或需要直接填写时间偏移时使用。")}
          </p>
          <button
            className="button"
            disabled={!ready || blocked}
            onClick={media.openSettings}
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
                [range[0] + meta.firstFrame, range[1] + meta.firstFrame],
              )
            : t("当前观察区间与素材没有时间交集，请调整基线或偏移。")}
        </p>
      )}
    </>
  );
}
