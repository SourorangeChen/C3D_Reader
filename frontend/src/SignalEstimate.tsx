import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { usePreferences } from "./Preferences";
import { api } from "./types";
import type { Acquisition, Selection } from "./types";
import { readSignalCSV } from "./synchronization";
import type {
  AlignmentEstimate,
  SignalTable,
  SyncMapping,
} from "./synchronization";
import { errorMessage } from "./errors";
import {
  correlationPath,
  ESTIMATE_REASONS,
  estimateRequest,
  signalEvidence,
  timeValue,
  type SignalSearch,
} from "./alignmentForm";

/**
 * "从已有视频信号估计偏移": correlate a column of a video signal CSV with a
 * C3D channel over the observation range and apply the candidate lag.
 */
export function SignalEstimate(props: {
  meta: Acquisition;
  roi: [number, number];
  selection: Selection;
  baseline: string;
  onError: (error: string) => void;
  onApply: (value: () => SyncMapping) => void;
}) {
  const { t } = usePreferences();
  const { meta, roi, baseline, onError } = props;
  const [signal, setSignal] = useState<{
    table: SignalTable;
    name: string;
  } | null>(null);
  const [search, setSearch] = useState<SignalSearch>({
    column: "",
    reference: `${props.selection.kind}:${props.selection.id}`,
    axis: "2",
    direction: "1",
    low: "-2",
    high: "2",
    step: "0.01",
    gap: "0.08",
  });
  const [estimate, setEstimate] = useState<AlignmentEstimate | null>(null);
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const reads = useRef(0);
  useEffect(
    () => () => {
      request.current?.abort();
      reads.current++;
    },
    [],
  );
  // Any change to the inputs makes the shown estimate stale.
  useEffect(() => {
    request.current?.abort();
    setEstimate(null);
    setBusy(false);
  }, [baseline, search, signal, roi]);
  const change = (key: keyof SignalSearch) => (value: string) =>
    setSearch((old) => ({ ...old, [key]: value }));
  const loadSignal = async (file?: File) => {
    if (!file) return;
    const version = ++reads.current;
    onError("");
    setSignal(null);
    try {
      if (file.size > 20_000_000)
        throw new Error("信号 CSV 过大，请先截取需要对齐的区间。");
      const table = readSignalCSV(await file.text());
      if (version !== reads.current) return;
      setSignal({ table, name: file.name });
      setSearch((old) => ({ ...old, column: Object.keys(table.columns)[0] }));
    } catch (e) {
      if (version !== reads.current) return;
      onError(errorMessage(e));
    }
  };
  const calculate = async () => {
    if (!signal) return;
    onError("");
    setEstimate(null);
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setBusy(true);
    try {
      const body = estimateRequest(
        {
          times: signal.table.times,
          values: signal.table.columns[search.column],
        },
        search,
        baseline,
        roi,
      );
      const result = await api<AlignmentEstimate>(
        `/api/files/${meta.id}/alignment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify(body),
        },
      );
      if (!controller.signal.aborted) setEstimate(result);
    } catch (e) {
      if (!controller.signal.aborted) onError(errorMessage(e));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  const numberField = (
    label: string,
    key: "low" | "high" | "step" | "gap",
    min?: string,
  ) => (
    <label>
      {t(label)}
      <input
        type="number"
        step="any"
        min={min}
        value={search[key]}
        onChange={(e) => change(key)(e.target.value)}
      />
    </label>
  );
  return (
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
          {signal.name} · {signal.table.times.length} {t("采样点")}
        </p>
      )}
      <div className="sync-field-grid">
        <label>
          {t("视频信号列")}
          <select
            aria-label={t("视频信号列")}
            value={search.column}
            onChange={(e) => change("column")(e.target.value)}
            disabled={!signal}
          >
            {Object.keys(signal?.table.columns || {}).map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          {t("Vicon 对齐通道")}
          <select
            aria-label={t("Vicon 对齐通道")}
            value={search.reference}
            onChange={(e) => change("reference")(e.target.value)}
          >
            <optgroup label={t("点位 / 模型")}>
              {meta.points.map((p) => (
                <option key={p.id} value={`point:${p.id}`}>
                  {p.label} ({p.unit})
                </option>
              ))}
            </optgroup>
            <optgroup label={t("模拟信号")}>
              {meta.analogs.map((p) => (
                <option key={p.id} value={`analog:${p.id}`}>
                  {p.label} ({p.unit})
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        {search.reference.startsWith("point:") && (
          <label>
            {t("坐标分量")}
            <select
              aria-label={t("坐标分量")}
              value={search.axis}
              onChange={(e) => change("axis")(e.target.value)}
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
            value={search.direction}
            onChange={(e) => change("direction")(e.target.value)}
          >
            <option value="1">{t("同向")}</option>
            <option value="-1">{t("Vicon 反向")}</option>
          </select>
        </label>
        {numberField("搜索下限（秒）", "low")}
        {numberField("搜索上限（秒）", "high")}
        {numberField("搜索步长（秒）", "step", "0.001")}
        {numberField("最大插值间隔（秒）", "gap", "0.001")}
      </div>
      <p className="sync-help">
        {t("使用当前观察区间：原始帧 {0}–{1}。", [
          roi[0] + meta.firstFrame,
          roi[1] + meta.firstFrame,
        ])}
      </p>
      <button
        className="button"
        disabled={!signal || busy}
        onClick={() => void calculate()}
      >
        {t(busy ? "正在估计…" : "估计时间偏移")}
      </button>
      {estimate && signal && (
        <div className="sync-result" role="status">
          <p>{t(ESTIMATE_REASONS[estimate.reason] || estimate.reason)}</p>
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
              d={correlationPath(estimate.curve)}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.5"
            />
          </svg>
          <p className="sync-help">
            {search.low} s — {search.high} s · {t("相关性不代表绝对同步精度。")}
          </p>
          <button
            className="button primary"
            disabled={estimate.status !== "accepted" || estimate.lag == null}
            onClick={() =>
              props.onApply(() => ({
                baseline: timeValue(baseline),
                lag: estimate.lag!,
                source: "signal",
                evidence: signalEvidence(
                  signal.name,
                  search,
                  roi,
                  meta,
                  estimate,
                ),
              }))
            }
          >
            {t("应用候选偏移")}
          </button>
        </div>
      )}
    </details>
  );
}
