import { ChevronLeft, ChevronRight, Undo2 } from "lucide-react";
import { useId, useState, type InputHTMLAttributes } from "react";
import { usePreferences } from "./Preferences";

type Props = {
  time: number;
  mediaFrame: number | null;
  mediaFirst: number;
  mediaLast: number;
  viconFrame: number;
  viconFirst: number;
  viconLast: number;
  status: string;
  indexStatus: string;
  offset: number;
  sharedLag?: number;
  rate: number;
  synced: boolean;
  blocked: boolean;
  stepping: boolean;
  canUndo: boolean;
  canNudge?: boolean;
  onTime: (time: number) => void;
  onMediaFrame: (frame: number) => void;
  onMediaStep: (direction: number) => void;
  onVicon: (frame: number) => void;
  onNudge: (direction: number) => void;
  onUndo: () => void;
};
function NumberField({
  value,
  onNumber,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: number | string;
  onNumber: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      {...props}
      value={draft ?? value}
      onChange={(event) => {
        const text = event.target.value;
        setDraft(text);
        if (text.trim() && Number.isFinite(Number(text)))
          onNumber(Number(text));
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}
export function ComparisonControls(p: Props) {
  const { t } = usePreferences();
  const id = useId();
  return (
    <div
      className="comparison-bar media-readout"
      role="group"
      aria-label={t("视频与 Vicon 对照")}
      onKeyDown={(event) => {
        if (event.key !== "Escape") event.stopPropagation();
      }}
    >
      <div className="comparison-fields">
        <label>
          <span>{t("视频时间（秒）")}</span>
          <NumberField
            type="number"
            step="0.001"
            value={Number.isFinite(p.time) ? Number(p.time.toFixed(4)) : ""}
            disabled={p.blocked || !Number.isFinite(p.time)}
            onNumber={p.onTime}
          />
        </label>
        <div className="comparison-field">
          <label
            htmlFor={`${id}-video`}
            title={t("视频从 0 编号；图片沿用源文件帧号")}
          >
            {t("视频帧号")}
          </label>
          <div className="comparison-stepper">
            <button
              className="icon-button"
              type="button"
              aria-label={t("上一视频帧")}
              disabled={
                p.blocked ||
                p.stepping ||
                p.mediaFrame == null ||
                p.mediaFrame <= p.mediaFirst
              }
              onClick={() => p.onMediaStep(-1)}
            >
              <ChevronLeft size={13} />
            </button>
            <NumberField
              id={`${id}-video`}
              type="number"
              step="1"
              min={p.mediaFirst}
              max={p.mediaLast}
              value={p.mediaFrame ?? ""}
              placeholder="—"
              disabled={p.blocked || p.mediaFrame == null}
              onNumber={p.onMediaFrame}
            />
            <button
              className="icon-button"
              type="button"
              aria-label={t("下一视频帧")}
              disabled={
                p.blocked ||
                p.stepping ||
                p.mediaFrame == null ||
                p.mediaFrame >= p.mediaLast
              }
              onClick={() => p.onMediaStep(1)}
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
        <div className="comparison-field">
          <label htmlFor={`${id}-vicon`}>{t("Vicon 帧号")}</label>
          <div className="comparison-stepper">
            <button
              className="icon-button"
              type="button"
              aria-label={t("上一 Vicon 帧")}
              disabled={p.blocked || p.viconFrame <= p.viconFirst}
              onClick={() => p.onVicon(p.viconFrame - 1)}
            >
              <ChevronLeft size={13} />
            </button>
            <NumberField
              id={`${id}-vicon`}
              type="number"
              step="1"
              min={p.viconFirst}
              max={p.viconLast}
              value={p.viconFrame}
              disabled={p.blocked}
              onNumber={p.onVicon}
            />
            <button
              className="icon-button"
              type="button"
              aria-label={t("下一 Vicon 帧")}
              disabled={p.blocked || p.viconFrame >= p.viconLast}
              onClick={() => p.onVicon(p.viconFrame + 1)}
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      </div>
      <div className="comparison-status">
        <span className="comparison-sync-status">{t(p.status)}</span>
        <span>{t(p.indexStatus)}</span>
        {p.synced && (
          <span>
            {t(p.sharedLag == null ? "时间偏移 {0} 秒" : "共同 lag {0} 秒", [
              (p.sharedLag ?? p.offset).toFixed(4),
            ])}
          </span>
        )}
      </div>
      {p.synced && p.canNudge !== false && (
        <div
          className="comparison-adjust"
          role="group"
          aria-label={t("对齐微调")}
        >
          <span>{t("固定 Vicon 帧微调")}</span>
          <button
            className="button"
            disabled={p.blocked}
            title={t("视频时间减少 {0} 毫秒", [(1000 / p.rate).toFixed(2)])}
            onClick={() => p.onNudge(-1)}
          >
            {t("画面提前")}
          </button>
          <button
            className="button"
            disabled={p.blocked}
            title={t("视频时间增加 {0} 毫秒", [(1000 / p.rate).toFixed(2)])}
            onClick={() => p.onNudge(1)}
          >
            {t("画面延后")}
          </button>
          <button
            className="icon-button"
            aria-label={t("撤销对齐微调")}
            title={t("撤销对齐微调")}
            disabled={!p.canUndo || p.blocked}
            onClick={p.onUndo}
          >
            <Undo2 size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
