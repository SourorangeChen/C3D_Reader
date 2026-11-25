import { useEffect, useRef, useState } from "react";
import { X, Upload, Download } from "lucide-react";
import { usePreferences } from "./Preferences";
import type { Acquisition, Selection } from "./types";
import { readAlignment, timestampBaseline } from "./synchronization";
import type {
  AlignmentChoice,
  SyncMapping,
  MediaIdentity,
} from "./synchronization";
import { errorMessage } from "./errors";
import { matchingChoice, savedOrigin, timeValue } from "./alignmentForm";
import { SignalEstimate } from "./SignalEstimate";

type Props = {
  meta: Acquisition;
  roi: [number, number];
  selection: Selection;
  mapping: SyncMapping;
  media: MediaIdentity;
  origin: number;
  onOrigin: (value: number) => void;
  onApply: (value: SyncMapping) => void;
  onExport: () => void;
  onClose: () => void;
};
type Fields = { baseline: string; lag: string; origin: string };

/** Time-alignment dialog: typed offsets, COM results, clock times, signals. */
export function SyncSettings(props: Props) {
  const { t } = usePreferences();
  const dialog = useRef<HTMLDialogElement>(null);
  const [fields, setFields] = useState<Fields>({
    baseline: String(props.mapping.baseline),
    lag: String(props.mapping.lag),
    origin: String(props.origin),
  });
  const [error, setError] = useState("");
  const set = (value: Partial<Fields>) =>
    setFields((old) => ({ ...old, ...value }));
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => previous?.focus();
  }, []);
  // The mapping is built inside the try so invalid typed times show an error.
  const apply = (value: SyncMapping | (() => SyncMapping)) => {
    try {
      const mapping = typeof value === "function" ? value() : value;
      props.onOrigin(timeValue(fields.origin));
      props.onApply(mapping);
      props.onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <dialog
      ref={dialog}
      className="sync-dialog"
      aria-label={t("时间对齐")}
      onCancel={props.onClose}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="sync-dialog-heading">
        <h2>{t("时间对齐")}</h2>
        <button
          className="icon-button"
          aria-label={t("关闭")}
          onClick={props.onClose}
        >
          <X size={18} />
        </button>
      </div>
      <p className="sync-equation">
        {t("视频时间 = 时间戳基线 + 统一偏移 + C3D 相对时间")}
      </p>
      <p className="sync-help">
        {t("正偏移选择更晚的视频画面。不会自动拉伸时间或跨缺失段补动作。")}
      </p>
      <div className="sync-field-grid">
        <label>
          {t("时间戳基线（秒）")}
          <input
            type="number"
            step="any"
            value={fields.baseline}
            onChange={(e) => set({ baseline: e.target.value })}
          />
        </label>
        <label>
          {t("统一偏移（秒）")}
          <input
            type="number"
            step="0.001"
            value={fields.lag}
            onChange={(e) => set({ lag: e.target.value })}
          />
        </label>
        {props.media.kind === "video" && (
          <label>
            {t("视频 PTS 原点（秒）")}
            <input
              type="number"
              step="any"
              value={fields.origin}
              onChange={(e) => set({ origin: e.target.value })}
            />
          </label>
        )}
      </div>
      {props.media.kind === "video" && (
        <p className="sync-help">
          {t(
            "通常 PTS 原点为 0；若外部 PTS 表与播放器时间原点不同，请填写其差值。不要用文件修改时间推断拍摄时间。",
          )}
        </p>
      )}
      <div className="sync-actions">
        <button
          className="button primary"
          onClick={() =>
            apply(() => ({
              baseline: timeValue(fields.baseline),
              lag: timeValue(fields.lag),
              source: "manual",
            }))
          }
        >
          {t("应用时间偏移")}
        </button>
        <button className="button" onClick={props.onExport}>
          <Download size={14} />
          {t("保存当前对齐")}
        </button>
      </div>
      <AlignmentImport
        meta={props.meta}
        media={props.media}
        onFields={set}
        onError={setError}
        onApply={apply}
      />
      <TimestampBaseline
        meta={props.meta}
        onBaseline={(baseline) => set({ baseline: String(baseline) })}
        onError={setError}
      />
      <SignalEstimate
        meta={props.meta}
        roi={props.roi}
        selection={props.selection}
        baseline={fields.baseline}
        onError={setError}
        onApply={apply}
      />
      {error && (
        <p role="alert" className="error-text">
          {t(error)}
        </p>
      )}
    </dialog>
  );
}

/** "导入 COM 对齐结果": a COM result or a saved c3d-reader-sync file. */
function AlignmentImport(props: {
  meta: Acquisition;
  media: MediaIdentity;
  onFields: (value: Partial<Fields>) => void;
  onError: (error: string) => void;
  onApply: (value: SyncMapping) => void;
}) {
  const { t } = usePreferences();
  const [choices, setChoices] = useState<AlignmentChoice[]>([]);
  const [choice, setChoice] = useState("");
  const reads = useRef(0);
  useEffect(
    () => () => {
      reads.current++;
    },
    [],
  );
  const loadAlignment = async (file?: File) => {
    if (!file) return;
    const version = ++reads.current;
    props.onError("");
    try {
      if (file.size > 8_000_000)
        throw new Error("对齐 JSON 过大，请导入同步结果文件。");
      const text = await file.text();
      if (version !== reads.current) return;
      const rows = readAlignment(text, props.meta, props.media);
      const origin = savedOrigin(text);
      if (origin != null) props.onFields({ origin: String(origin) });
      setChoices(rows);
      const index = matchingChoice(rows, props.meta.name);
      setChoice(index >= 0 ? String(index) : "");
      if (index >= 0)
        props.onFields({
          baseline: String(rows[index].baseline),
          lag: String(rows[index].lag),
        });
    } catch (e) {
      if (version !== reads.current) return;
      props.onError(errorMessage(e));
      setChoices([]);
    }
  };
  return (
    <details className="sync-section" open>
      <summary>{t("导入 COM 对齐结果")}</summary>
      <label className="button file-choice">
        <Upload size={14} />
        {t("选择对齐 JSON")}
        <input
          type="file"
          accept=".json"
          aria-label={t("选择对齐 JSON")}
          onChange={(e) => {
            void loadAlignment(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      {choices.length > 0 && (
        <>
          <label>
            {t("COM 试次")}
            <select
              aria-label={t("COM 试次")}
              value={choice}
              onChange={(e) => {
                setChoice(e.target.value);
                if (e.target.value !== "") {
                  const row = choices[Number(e.target.value)];
                  props.onFields({
                    baseline: String(row.baseline),
                    lag: String(row.lag),
                  });
                }
              }}
            >
              <option value="">{t("请选择对应当前 C3D 的试次")}</option>
              {choices.map((row, i) => (
                <option key={i} value={i}>
                  {row.trial}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button"
            disabled={choice === ""}
            onClick={() => props.onApply(choices[Number(choice)])}
          >
            {t("应用所选试次")}
          </button>
        </>
      )}
      <p className="sync-help">
        {t(
          "使用 overall_lag_s；未提供时，只取 accepted 试次修正的中位数。每个试次保留自己的时间戳基线。",
        )}
      </p>
    </details>
  );
}

/** "从拍摄时间计算基线": baseline from the camera and Capture start times. */
function TimestampBaseline(props: {
  meta: Acquisition;
  onBaseline: (baseline: number) => void;
  onError: (error: string) => void;
}) {
  const { t } = usePreferences();
  const [clock, setClock] = useState({
    videoStart: "",
    captureStart: "",
    advance: "",
  });
  const set = (value: Partial<typeof clock>) =>
    setClock((old) => ({ ...old, ...value }));
  return (
    <details className="sync-section">
      <summary>{t("从拍摄时间计算基线")}</summary>
      <div className="sync-field-grid">
        <label>
          {t("视频拍摄开始时间")}
          <input
            value={clock.videoStart}
            placeholder="2026-10-28T09:30:00+08:00"
            onChange={(e) => set({ videoStart: e.target.value })}
          />
        </label>
        <label>
          {t("XCP Capture 开始时间")}
          <input
            value={clock.captureStart}
            placeholder="2026-10-28T09:30:00+08:00"
            onChange={(e) => set({ captureStart: e.target.value })}
          />
        </label>
        <label>
          {t("Vicon 时钟领先（秒）")}
          <input
            type="number"
            step="any"
            value={clock.advance}
            onChange={(e) => set({ advance: e.target.value })}
          />
        </label>
      </div>
      <p className="sync-help">
        {t(
          "已计入原始首帧裁剪偏移 ({0} − 1) / {1} 秒。读取 Capture 时间，不使用 Calibration 时间。",
          [props.meta.firstFrame, props.meta.pointRate],
        )}
      </p>
      <button
        className="button"
        onClick={() => {
          try {
            props.onBaseline(
              timestampBaseline(
                clock.videoStart,
                clock.captureStart,
                clock.advance,
                props.meta.firstFrame,
                props.meta.pointRate,
              ),
            );
            props.onError("");
          } catch (e) {
            props.onError(errorMessage(e));
          }
        }}
      >
        {t("计算基线")}
      </button>
    </details>
  );
}
