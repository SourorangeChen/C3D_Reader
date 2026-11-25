import { memo } from "react";
import { ChevronRight, Download, Film, RefreshCw, X } from "lucide-react";
import { usePreferences } from "./Preferences";
import { formatBytes } from "./types";
import type { Acquisition } from "./types";

const countFormat = new Intl.NumberFormat("en");

/** Trial title, video-sync and export actions, and the recording summary. */
export const TrialHeader = memo(function TrialHeader({
  meta,
  showMedia,
  sourceChanged,
  onToggleMedia,
  onExport,
}: {
  meta: Acquisition | null;
  showMedia: boolean;
  sourceChanged: boolean;
  onToggleMedia: () => void;
  onExport: () => void;
}) {
  const { t } = usePreferences();
  const demo = meta?.id === "demo";
  return (
    <>
      <div className="trial-header">
        <div className="trial-title">
          <div className="breadcrumb">
            <span>{t("采集")}</span>
            <ChevronRight size={12} />
            <span>{demo ? t("合成示例") : meta?.manufacturer || "C3D"}</span>
          </div>
          <h1>{demo ? "Synthetic walking" : meta?.name || "C3D Reader"}</h1>
        </div>
        <div className="trial-actions">
          <button
            className={`button ${showMedia ? "active" : ""}`}
            disabled={!meta}
            aria-pressed={showMedia}
            onClick={onToggleMedia}
          >
            <Film size={14} />
            {t("视频同步")}
          </button>
          <button
            className="button primary export-button"
            disabled={!meta || sourceChanged}
            onClick={onExport}
          >
            <Download size={14} />
            <span>{t("导出 CSV")}</span>
          </button>
        </div>
      </div>
      <div className="trial-stats">
        <span>
          <strong>{meta ? countFormat.format(meta.frameCount) : "—"}</strong>
          {t("帧")}
        </span>
        <span>
          <strong>{meta?.pointRate ?? "—"}</strong>
          {t("Hz 标记点")}
        </span>
        <span>
          <strong>{meta ? countFormat.format(meta.analogRate) : "—"}</strong>
          {t("Hz 模拟信号")}
        </span>
        <span>
          <strong>{meta?.duration.toFixed(2) ?? "—"}</strong>
          {t("s 时长")}
        </span>
        <span className="storage-note">
          {demo
            ? t("合成数据")
            : meta
              ? t("{0} · 分块读取", [formatBytes(meta.size)])
              : ""}
        </span>
      </div>
    </>
  );
});

/**
 * An app error the user can dismiss, or a frame-read failure with a retry
 * (or reopen, when the file changed on disk).
 */
export function ErrorBanner({
  error,
  frameError,
  loading,
  onDismiss,
  onRecover,
}: {
  error: string;
  frameError: { message: string; action: "retry" | "reopen" } | null;
  loading: boolean;
  onDismiss: () => void;
  onRecover: () => void;
}) {
  const { t } = usePreferences();
  return (
    <div className="error-banner" role="alert">
      <span>{t(error || frameError?.message || "")}</span>
      {error ? (
        <button
          className="icon-button"
          aria-label={t("关闭错误提示")}
          onClick={onDismiss}
        >
          <X size={14} />
        </button>
      ) : frameError ? (
        <button className="button" disabled={loading} onClick={onRecover}>
          <RefreshCw size={13} />
          {t(frameError.action === "reopen" ? "重新打开文件" : "重试读取")}
        </button>
      ) : null}
    </div>
  );
}
