import { useState } from "react";
import { Download } from "lucide-react";
import { usePreferences } from "./Preferences";
import type { Acquisition, Selection } from "./types";

type Scope = "all-points" | "com" | "selected" | "all-analog";
export function ExportOptions({
  meta,
  selection,
  roi,
  onClose,
}: {
  meta: Acquisition;
  selection: Selection;
  roi: [number, number];
  onClose: () => void;
}) {
  const { t } = usePreferences();
  const [scope, setScope] = useState<Scope>(
    meta.points.length ? "all-points" : "all-analog",
  );
  const [range, setRange] = useState("full");
  const com = meta.points.filter((p) => p.role === "centerOfMass");
  const floor = meta.points.filter((p) => p.role === "centerOfMassFloor");
  const centers = [...com, ...floor];
  const kind =
    scope === "all-analog"
      ? "analog"
      : scope === "selected"
        ? selection.kind
        : "point";
  const selected =
    selection.kind === "point"
      ? meta.points[selection.id]
      : meta.analogs[selection.id];
  const channels =
    scope === "selected"
      ? selected
        ? 1
        : 0
      : scope === "com"
        ? centers.length
        : kind === "point"
          ? meta.points.length
          : meta.analogs.length;
  const start = range === "full" ? 0 : roi[0];
  const stop = range === "full" ? meta.frameCount : roi[1] + 1;
  const samples =
    (stop - start) * (kind === "analog" ? meta.samplesPerFrame : 1);
  const queryScope =
    scope === "selected" ? "selected" : scope === "com" ? "com" : "all";
  const format = new Intl.NumberFormat("en");
  return (
    <>
      <p>
        {t(
          "选择导出内容；全部点位包含文件中的所有关键点、模型输出和已有质心数据，不受通道搜索或可见性影响。",
        )}
      </p>
      <div className="export-options">
        <label htmlFor="export-scope">{t("导出内容")}</label>
        <select
          id="export-scope"
          value={scope}
          onChange={(e) => setScope(e.target.value as Scope)}
        >
          <option value="all-points" disabled={!meta.points.length}>
            {t("全部点位（含模型输出及已有 COM）")}
          </option>
          <option value="com" disabled={!centers.length}>
            {t("仅 COM 及地面投影")}
          </option>
          <option value="selected" disabled={!selected}>
            {t("当前选中通道")}
            {selected ? ` · ${selected.label}` : ""}
          </option>
          <option value="all-analog" disabled={!meta.analogs.length}>
            {t("全部模拟通道")}
          </option>
        </select>
        <label htmlFor="export-range">{t("导出区间")}</label>
        <select
          id="export-range"
          value={range}
          onChange={(e) => setRange(e.target.value)}
        >
          <option value="full">{t("完整采集")}</option>
          <option value="roi">{t("当前观察区间")}</option>
        </select>
      </div>
      <div className="com-summary">
        <strong>{t("文件中的质心数据")}</strong>
        {centers.length ? (
          <>
            {!!com.length && (
              <p>
                {t("三维质心")}:{" "}
                <span>{com.map((p) => p.label).join(", ")}</span>
              </p>
            )}
            {!!floor.length && (
              <p>
                {t("质心地面投影")}:{" "}
                <span>{floor.map((p) => p.label).join(", ")}</span>
              </p>
            )}
            {!com.length && (
              <p>{t("文件只包含地面投影，未找到三维 COM 通道。")}</p>
            )}
          </>
        ) : (
          <p>
            {t(
              "未识别到文件自带的 COM 通道；仍可导出全部点位。不会用标记点平均位置生成质心。",
            )}
          </p>
        )}
      </div>
      <dl className="export-details">
        <div>
          <dt>{t("通道数")}</dt>
          <dd>{format.format(channels)}</dd>
        </div>
        <div>
          <dt>{t("帧区间（含两端）")}</dt>
          <dd>
            {start + meta.firstFrame} – {stop - 1 + meta.firstFrame}
          </dd>
        </div>
        <div>
          <dt>{t("采样点数")}</dt>
          <dd>{format.format(samples)}</dd>
        </div>
        <div>
          <dt>{t("内容")}</dt>
          <dd>{kind === "point" ? "X / Y / Z / residual" : t("模拟信号")}</dd>
        </div>
      </dl>
      <p className="form-note">
        {t(
          kind === "point"
            ? "每帧一行，全部点位按列展开，保留原标签、物理单位、原始帧号和完整采样率。COM 与地面投影分别保留，不会重新计算。"
            : "模拟 CSV 每个采样点一行，保留全部采样、原始帧号、标签和单位。",
        )}
      </p>
      <p className="form-note">
        {t("缺失坐标留空，residual 为 −1。导出不会修改原文件。")}
      </p>
      <div className="modal-actions">
        <button className="button" onClick={onClose}>
          {t("取消")}
        </button>
        {!!channels && (
          <a
            className="button primary"
            href={`/api/files/${meta.id}/export?kind=${kind}&scope=${queryScope}&ids=${selection.id}&start=${start}&stop=${stop}`}
            download
            onClick={onClose}
          >
            <Download size={14} />
            {t("下载 CSV")}
          </a>
        )}
      </div>
    </>
  );
}
