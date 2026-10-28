import { useEffect, useRef, useState } from "react";
import { X, Upload, Download } from "lucide-react";
import { usePreferences } from "./Preferences";
import { api } from "./types";
import type { Acquisition, Selection } from "./types";
import {
  readAlignment,
  readSignalCSV,
  timestampBaseline,
} from "./synchronization";
import type {
  AlignmentChoice,
  AlignmentEstimate,
  SignalTable,
  SyncMapping,
  MediaIdentity,
} from "./synchronization";

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
export function SyncSettings(props: Props) {
  const { t } = usePreferences();
  const dialog = useRef<HTMLDialogElement>(null);
  const [baseline, setBaseline] = useState(String(props.mapping.baseline));
  const [lag, setLag] = useState(String(props.mapping.lag));
  const [origin, setOrigin] = useState(String(props.origin));
  const [error, setError] = useState("");
  const [choices, setChoices] = useState<AlignmentChoice[]>([]);
  const [choice, setChoice] = useState("");
  const [videoStart, setVideoStart] = useState("");
  const [captureStart, setCaptureStart] = useState("");
  const [advance, setAdvance] = useState("");
  const [signal, setSignal] = useState<SignalTable | null>(null);
  const [signalName, setSignalName] = useState("");
  const [column, setColumn] = useState("");
  const [reference, setReference] = useState(
    `${props.selection.kind}:${props.selection.id}`,
  );
  const [axis, setAxis] = useState("2");
  const [direction, setDirection] = useState("1");
  const [low, setLow] = useState("-2");
  const [high, setHigh] = useState("2");
  const [step, setStep] = useState("0.01");
  const [gap, setGap] = useState("0.08");
  const [estimate, setEstimate] = useState<AlignmentEstimate | null>(null);
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const reads = useRef({ alignment: 0, signal: 0 });
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => {
      request.current?.abort();
      reads.current.alignment++;
      reads.current.signal++;
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    request.current?.abort();
    setEstimate(null);
    setBusy(false);
  }, [
    baseline,
    column,
    reference,
    axis,
    direction,
    low,
    high,
    step,
    gap,
    signal,
    props.roi,
  ]);
  const numeric = (text: string) => {
    if (!text.trim() || !Number.isFinite(Number(text)))
      throw new Error("请输入有效的时间数值。");
    return Number(text);
  };
  const apply = (value: SyncMapping) => {
    try {
      props.onOrigin(numeric(origin));
      props.onApply(value);
      props.onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const loadAlignment = async (file?: File) => {
    if (!file) return;
    const version = ++reads.current.alignment;
    setError("");
    try {
      if (file.size > 8_000_000)
        throw new Error("对齐 JSON 过大，请导入同步结果文件。");
      const text = await file.text();
      if (version !== reads.current.alignment) return;
      const rows = readAlignment(text, props.meta, props.media);
      const saved = JSON.parse(text);
      if (
        saved.format === "c3d-reader-sync" &&
        Number.isFinite(saved.video_pts_origin_s)
      )
        setOrigin(String(saved.video_pts_origin_s));
      setChoices(rows);
      const stem = props.meta.name.replace(/\.c3d$/i, "").toLowerCase();
      const matches = rows
        .map((row, i) => ({ row, i }))
        .filter(
          ({ row }) => row.trial.replace(/\.c3d$/i, "").toLowerCase() === stem,
        );
      const index =
        rows.length === 1 ? 0 : matches.length === 1 ? matches[0].i : -1;
      setChoice(index >= 0 ? String(index) : "");
      if (index >= 0) {
        setBaseline(String(rows[index].baseline));
        setLag(String(rows[index].lag));
      }
    } catch (e) {
      if (version !== reads.current.alignment) return;
      setError((e as Error).message);
      setChoices([]);
    }
  };
  const loadSignal = async (file?: File) => {
    if (!file) return;
    const version = ++reads.current.signal;
    setError("");
    setSignal(null);
    try {
      if (file.size > 20_000_000)
        throw new Error("信号 CSV 过大，请先截取需要对齐的区间。");
      const table = readSignalCSV(await file.text());
      if (version !== reads.current.signal) return;
      setSignal(table);
      setColumn(Object.keys(table.columns)[0]);
      setSignalName(file.name);
    } catch (e) {
      if (version !== reads.current.signal) return;
      setError((e as Error).message);
    }
  };
  const calculate = async () => {
    if (!signal) return;
    setError("");
    setEstimate(null);
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setBusy(true);
    try {
      const [kind, channel] = reference.split(":");
      const result = await api<AlignmentEstimate>(
        `/api/files/${props.meta.id}/alignment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            times: signal.times,
            values: signal.columns[column],
            kind,
            channel: Number(channel),
            axis: Number(axis),
            direction: Number(direction),
            start: props.roi[0],
            stop: props.roi[1] + 1,
            baseline: numeric(baseline),
            low: numeric(low),
            high: numeric(high),
            step: numeric(step),
            maxGap: numeric(gap),
          }),
        },
      );
      if (!controller.signal.aborted) setEstimate(result);
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  const reason: Record<string, string> = {
    preset_signal_quality_passed: "候选通过质量检查，应用后仍需目视复核。",
    no_usable_signal_or_coverage:
      "没有足够的有效信号覆盖，请检查时间基线和区间。",
    search_or_coverage_boundary:
      "最优值位于搜索或覆盖边界，请检查基线并扩大搜索范围。",
    low_correlation: "信号相关性不足，请检查通道、方向与动作区间。",
    ambiguous_competing_peak:
      "存在相近的竞争峰，重复步态可能产生歧义，请缩小范围或更换同步动作。",
  };
  let curvePath = "",
    disconnected = true;
  estimate?.curve.forEach((point, i, curve) => {
    if (point.correlation == null) {
      disconnected = true;
      return;
    }
    const x = 8 + (i / Math.max(1, curve.length - 1)) * 324,
      y = 8 + (1 - point.correlation) * 30;
    curvePath += `${disconnected ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    disconnected = false;
  });
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
            value={baseline}
            onChange={(e) => setBaseline(e.target.value)}
          />
        </label>
        <label>
          {t("统一偏移（秒）")}
          <input
            type="number"
            step="0.001"
            value={lag}
            onChange={(e) => setLag(e.target.value)}
          />
        </label>
        {props.media.kind === "video" && (
          <label>
            {t("视频 PTS 原点（秒）")}
            <input
              type="number"
              step="any"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
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
          onClick={() => {
            try {
              apply({
                baseline: numeric(baseline),
                lag: numeric(lag),
                source: "manual",
              });
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          {t("应用时间偏移")}
        </button>
        <button className="button" onClick={props.onExport}>
          <Download size={14} />
          {t("保存当前对齐")}
        </button>
      </div>
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
                    setBaseline(String(row.baseline));
                    setLag(String(row.lag));
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
              onClick={() => apply(choices[Number(choice)])}
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
      <details className="sync-section">
        <summary>{t("从拍摄时间计算基线")}</summary>
        <div className="sync-field-grid">
          <label>
            {t("视频拍摄开始时间")}
            <input
              value={videoStart}
              placeholder="2026-10-28T09:30:00+08:00"
              onChange={(e) => setVideoStart(e.target.value)}
            />
          </label>
          <label>
            {t("XCP Capture 开始时间")}
            <input
              value={captureStart}
              placeholder="2026-10-28T09:30:00+08:00"
              onChange={(e) => setCaptureStart(e.target.value)}
            />
          </label>
          <label>
            {t("Vicon 时钟领先（秒）")}
            <input
              type="number"
              step="any"
              value={advance}
              onChange={(e) => setAdvance(e.target.value)}
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
              setBaseline(
                String(
                  timestampBaseline(
                    videoStart,
                    captureStart,
                    advance,
                    props.meta.firstFrame,
                    props.meta.pointRate,
                  ),
                ),
              );
              setError("");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          {t("计算基线")}
        </button>
      </details>
      <details className="sync-section">
        <summary>{t("从已有视频信号估计偏移")}</summary>
        <p className="sync-help">
          {t(
            "此选项使用已有视频信号 CSV，时间列为 video_pts_s。两端须表示同一运动量，方向事先确定。直接导入素材的自动识别位于视频面板。",
          )}
        </p>
        <label className="button file-choice">
          <Upload size={14} />
          {t("导入视频信号 CSV")}
          <input
            type="file"
            accept=".csv"
            aria-label={t("导入视频信号 CSV")}
            onChange={(e) => {
              void loadSignal(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {signal && (
          <p className="sync-help">
            {signalName} · {signal.times.length} {t("采样点")}
          </p>
        )}
        <div className="sync-field-grid">
          <label>
            {t("视频信号列")}
            <select
              aria-label={t("视频信号列")}
              value={column}
              onChange={(e) => setColumn(e.target.value)}
              disabled={!signal}
            >
              {Object.keys(signal?.columns || {}).map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <label>
            {t("Vicon 对齐通道")}
            <select
              aria-label={t("Vicon 对齐通道")}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            >
              <optgroup label={t("点位 / 模型")}>
                {props.meta.points.map((p) => (
                  <option key={p.id} value={`point:${p.id}`}>
                    {p.label} ({p.unit})
                  </option>
                ))}
              </optgroup>
              <optgroup label={t("模拟信号")}>
                {props.meta.analogs.map((p) => (
                  <option key={p.id} value={`analog:${p.id}`}>
                    {p.label} ({p.unit})
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          {reference.startsWith("point:") && (
            <label>
              {t("坐标分量")}
              <select
                aria-label={t("坐标分量")}
                value={axis}
                onChange={(e) => setAxis(e.target.value)}
              >
                {["X", "Y", "Z"].map((name, i) => (
                  <option key={name} value={i}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            {t("信号方向")}
            <select
              aria-label={t("信号方向")}
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
            >
              <option value="1">{t("同向")}</option>
              <option value="-1">{t("Vicon 反向")}</option>
            </select>
          </label>
          <label>
            {t("搜索下限（秒）")}
            <input
              type="number"
              step="any"
              value={low}
              onChange={(e) => setLow(e.target.value)}
            />
          </label>
          <label>
            {t("搜索上限（秒）")}
            <input
              type="number"
              step="any"
              value={high}
              onChange={(e) => setHigh(e.target.value)}
            />
          </label>
          <label>
            {t("搜索步长（秒）")}
            <input
              type="number"
              step="any"
              min="0.001"
              value={step}
              onChange={(e) => setStep(e.target.value)}
            />
          </label>
          <label>
            {t("最大插值间隔（秒）")}
            <input
              type="number"
              step="any"
              min="0.001"
              value={gap}
              onChange={(e) => setGap(e.target.value)}
            />
          </label>
        </div>
        <p className="sync-help">
          {t("使用当前观察区间：原始帧 {0}–{1}。", [
            props.roi[0] + props.meta.firstFrame,
            props.roi[1] + props.meta.firstFrame,
          ])}
        </p>
        <button
          className="button"
          disabled={!signal || busy}
          onClick={() => void calculate()}
        >
          {t(busy ? "正在估计…" : "估计时间偏移")}
        </button>
        {estimate && (
          <div className="sync-result" role="status">
            <p>{t(reason[estimate.reason] || estimate.reason)}</p>
            <p>
              {t("候选偏移")} {estimate.lag?.toFixed(4) ?? "—"} s · r{" "}
              {estimate.correlation?.toFixed(3) ?? "—"} · {t("覆盖")}{" "}
              {(estimate.coverage * 100).toFixed(1)}%
            </p>
            <svg
              viewBox="0 0 340 78"
              role="img"
              aria-label={t("偏移搜索的带符号相关曲线")}
            >
              <line x1="8" x2="332" y1="38" y2="38" stroke="var(--border)" />
              <path
                d={curvePath}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="1.5"
              />
            </svg>
            <p className="sync-help">
              {low} s — {high} s · {t("相关性不代表绝对同步精度。")}
            </p>
            <button
              className="button primary"
              disabled={estimate.status !== "accepted" || estimate.lag == null}
              onClick={() =>
                apply({
                  baseline: numeric(baseline),
                  lag: estimate.lag!,
                  source: "signal",
                  evidence: {
                    signal_file: signalName,
                    column,
                    reference,
                    axis: Number(axis),
                    direction: Number(direction),
                    frame_range: props.roi.map(
                      (frame) => frame + props.meta.firstFrame,
                    ),
                    search: {
                      low: Number(low),
                      high: Number(high),
                      step: Number(step),
                      max_gap: Number(gap),
                    },
                    quality: {
                      min_coverage: 0.95,
                      min_correlation: 0.5,
                      peak_separation: 0.25,
                      min_peak_margin: 0.02,
                    },
                    result: estimate,
                  },
                })
              }
            >
              {t("应用候选偏移")}
            </button>
          </div>
        )}
      </details>
      {error && (
        <p role="alert" className="error-text">
          {t(error)}
        </p>
      )}
    </dialog>
  );
}
