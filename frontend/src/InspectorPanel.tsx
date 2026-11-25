import { ChevronRight, Settings2, X } from "lucide-react";
import { usePreferences } from "./Preferences";
import type { Acquisition, ParameterGroup, Selection } from "./types";
import type { Playback } from "./usePlayback";
import { selectedChannel } from "./workbench";

const kindName: Record<string, string> = {
  marker: "标记点",
  angle: "关节角度",
  force: "力",
  moment: "力矩",
  power: "功率",
  scalar: "标量",
};

// Right inspector: selected channel and coordinates, observation range,
// acquisition summary, events and raw C3D parameters.
export function InspectorPanel({
  meta,
  playback,
  points,
  selection,
  inspector,
  setInspector,
  onClose,
  params,
}: {
  meta: Acquisition | null;
  playback: Playback;
  points: Float32Array | undefined;
  selection: Selection;
  inspector: string;
  setInspector: (tab: string) => void;
  onClose: () => void;
  params: ParameterGroup[] | null;
}) {
  const { t } = usePreferences();
  const { frame, setPlaying, roi, seek, updateRoi } = playback;
  const {
    point: currentPoint,
    label: selectedLabel,
    unit: selectedUnit,
  } = selectedChannel(meta, selection);
  return (
    <>
      <div
        className="tabs inspector-tabs"
        role="tablist"
        aria-label={t("检查器")}
      >
        {[
          ["info", t("信息")],
          ["events", t("事件")],
          ["parameters", t("参数")],
        ].map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={inspector === id}
            className={inspector === id ? "active" : ""}
            onClick={() => setInspector(id)}
          >
            {label}
          </button>
        ))}
        <button
          className="close-inspector"
          aria-label={t("隐藏信息面板")}
          onClick={onClose}
        >
          <X size={13} />
        </button>
      </div>
      {inspector === "info" && (
        <div className="inspector-content">
          <div className="section-label">{t("选中通道")}</div>
          <div className="selected-channel">
            <span className="point-symbol">
              {selection.kind === "point" ? "●" : "∿"}
            </span>
            <h2>{selectedLabel || "—"}</h2>
          </div>
          <dl className="key-values">
            <div>
              <dt>{t("类型")}</dt>
              <dd>
                {selection.kind === "analog"
                  ? t("模拟信号")
                  : t(kindName[currentPoint?.kind || ""] || "—")}
              </dd>
            </div>
            <div>
              <dt>{t("单位")}</dt>
              <dd>{selectedUnit || "—"}</dd>
            </div>
            <div>
              <dt>{t("采样率")}</dt>
              <dd>
                {selection.kind === "point"
                  ? meta?.pointRate
                  : meta?.analogRate}{" "}
                Hz
              </dd>
            </div>
          </dl>
          {currentPoint && (
            <div className="coordinate-values">
              {["X", "Y", "Z"].map((a, i) => {
                const value = points?.[selection.id * 3 + i];
                return (
                  <div key={a}>
                    <span>{a}</span>
                    <strong>
                      {value != null && Number.isFinite(value)
                        ? value.toFixed(2)
                        : "—"}
                    </strong>
                    <small>{selectedUnit}</small>
                  </div>
                );
              })}
              <p>
                {points && Number.isFinite(points[selection.id * 3])
                  ? t("当前帧有效")
                  : t("当前帧缺失")}{" "}
                {t("· 帧")}
                {meta ? frame + meta.firstFrame : "—"}
              </p>
            </div>
          )}
          <div className="inspector-section">
            <div className="section-label">
              <Settings2 size={13} />
              {t("观察区间")}
            </div>
            <div className="roi-inputs">
              <label>
                {t("起始帧")}
                <input
                  type="number"
                  aria-label={t("区间起始帧")}
                  min={meta?.firstFrame}
                  max={meta?.lastFrame}
                  value={meta ? roi[0] + meta.firstFrame : 0}
                  onChange={(e) =>
                    meta && updateRoi(+e.target.value - meta.firstFrame, roi[1])
                  }
                />
              </label>
              <label>
                {t("结束帧")}
                <input
                  type="number"
                  aria-label={t("区间结束帧")}
                  min={meta?.firstFrame}
                  max={meta?.lastFrame}
                  value={meta ? roi[1] + meta.firstFrame : 0}
                  onChange={(e) =>
                    meta && updateRoi(roi[0], +e.target.value - meta.firstFrame)
                  }
                />
              </label>
            </div>
            <div className="roi-actions">
              <button onClick={() => updateRoi(frame, roi[1])}>
                {t("此帧设为起点")}
              </button>
              <button onClick={() => updateRoi(roi[0], frame)}>
                {t("设为终点")}
              </button>
            </div>
            <button
              className="text-button reset-roi"
              onClick={() => meta && updateRoi(0, meta.frameCount - 1)}
            >
              {t("重置为完整采集")}
            </button>
          </div>
          <div className="inspector-section">
            <div className="section-label">{t("采集摘要")}</div>
            <dl className="key-values">
              <div>
                <dt>{t("标记点 / 模型")}</dt>
                <dd>{meta?.points.length ?? "—"}</dd>
              </div>
              <div>
                <dt>{t("模拟通道")}</dt>
                <dd>{meta?.analogs.length ?? "—"}</dd>
              </div>
              <div>
                <dt>{t("事件")}</dt>
                <dd>{meta?.events.length ?? "—"}</dd>
              </div>
              <div>
                <dt>{t("力台")}</dt>
                <dd>{meta?.plates.length ?? "—"}</dd>
              </div>
              <div>
                <dt>{t("坐标单位")}</dt>
                <dd>{meta?.pointUnit || "—"}</dd>
              </div>
              <div>
                <dt>{t("存储格式")}</dt>
                <dd>{meta?.storage || "—"}</dd>
              </div>
            </dl>
          </div>
          <p className="info-note">
            {t(
              "时间以首帧为 0 秒。帧号保留原始 C3D 编号。模型输出按文件声明的物理单位显示。",
            )}
          </p>
        </div>
      )}
      {inspector === "events" && (
        <div className="inspector-content">
          <div className="section-label">
            {t("采集事件")}
            <span>{meta?.events.length || 0}</span>
          </div>
          <div className="event-list">
            {meta?.events.map((e, i) => (
              <button
                key={i}
                className={`event-row ${Math.abs(e.frame - (meta.firstFrame + frame)) < 2 ? "current" : ""}`}
                onClick={() => {
                  setPlaying(false);
                  seek(e.frame - meta.firstFrame);
                }}
              >
                <span
                  className={`event-side ${e.context === "Left" ? "left" : ""}`}
                >
                  {e.context === "Left"
                    ? "L"
                    : e.context === "Right"
                      ? "R"
                      : "·"}
                </span>
                <div>
                  <strong>{e.label}</strong>
                  <span>
                    {e.context || t("通用")}
                    {t("· 帧")}
                    {e.frame}
                  </span>
                </div>
                <small>{e.time.toFixed(3)} s</small>
              </button>
            ))}
          </div>
          {!meta?.events.length && (
            <p className="empty-copy">{t("这个文件没有记录事件。")}</p>
          )}
        </div>
      )}
      {inspector === "parameters" && (
        <div className="inspector-content parameters">
          <div className="section-label">{t("原始 C3D 参数")}</div>
          {params ? (
            params.map((g) => (
              <details key={g.name}>
                <summary>
                  <ChevronRight size={12} />
                  {g.name}
                  <span>{g.parameters.length}</span>
                </summary>
                {g.parameters.map((p) => (
                  <div className="parameter" key={p.name}>
                    <strong>{p.name}</strong>
                    <small>
                      {p.dimensions.length
                        ? `[${p.dimensions.join(" × ")}]`
                        : "scalar"}
                    </small>
                    <pre>
                      {typeof p.value === "string"
                        ? p.value
                        : JSON.stringify(p.value, null, 1)}
                    </pre>
                    {p.description && <p>{p.description}</p>}
                  </div>
                ))}
              </details>
            ))
          ) : (
            <p className="empty-copy">{t("正在读取参数…")}</p>
          )}
        </div>
      )}
    </>
  );
}
