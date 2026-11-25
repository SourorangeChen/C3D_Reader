import { memo } from "react";
import { Activity, Eye, EyeOff, Search, X } from "lucide-react";
import { usePreferences } from "./Preferences";
import type { Acquisition, Selection } from "./types";
import { channelLists } from "./workbench";

// Marker, model and analog channel lists with search, visibility and selection.
export const ChannelPanel = memo(function ChannelPanel({
  meta,
  tab,
  setTab,
  search,
  setSearch,
  virtual,
  toggleVirtual,
  selection,
  setSelection,
  hidden,
  toggleHidden,
  pickPoint,
}: {
  meta: Acquisition | null;
  tab: string;
  setTab: (tab: string) => void;
  search: string;
  setSearch: (search: string) => void;
  virtual: boolean;
  toggleVirtual: () => void;
  selection: Selection;
  setSelection: (selection: Selection) => void;
  hidden: Set<number>;
  toggleHidden: (id: number) => void;
  pickPoint: (id: number) => void;
}) {
  const { t } = usePreferences();
  const {
    points: visiblePoints,
    analogs: visibleAnalogs,
    markerCount,
    modelCount,
  } = channelLists(meta, tab, virtual, search);
  return (
    <>
      <div className="panel-heading channel-heading">
        <h2>{t("采集通道")}</h2>
        <span>{meta ? meta.points.length + meta.analogs.length : "—"}</span>
      </div>
      <div
        className="tabs channel-tabs"
        role="tablist"
        aria-label={t("通道类型")}
      >
        {[
          ["marker", t("标记点"), markerCount],
          ["model", t("模型"), modelCount],
          ["analog", t("模拟"), meta?.analogs.length || 0],
        ].map(([id, label, n]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "active" : ""}
            onClick={() => {
              setTab(String(id));
              setSearch("");
            }}
          >
            {label}
            <span>{n}</span>
          </button>
        ))}
      </div>
      <div className="channel-search">
        <Search size={14} />
        <input
          aria-label={t("搜索通道")}
          placeholder={
            tab === "analog"
              ? t("搜索力、EMG、IMU…")
              : t("搜索标记点或模型输出…")
          }
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            className="clear-search"
            aria-label={t("清除搜索")}
            onClick={() => setSearch("")}
          >
            <X size={12} />
          </button>
        )}
      </div>
      {tab === "marker" && (
        <label className="virtual-toggle">
          <input type="checkbox" checked={virtual} onChange={toggleVirtual} />
          {t("显示 Vicon 模型坐标点")}
        </label>
      )}
      <div className="channel-list">
        {tab === "analog"
          ? visibleAnalogs.map((p) => (
              <button
                key={p.id}
                className={`channel-row ${selection.kind === "analog" && selection.id === p.id ? "selected" : ""}`}
                onClick={() => setSelection({ kind: "analog", id: p.id })}
              >
                <Activity size={12} />
                <span>{p.label}</span>
                <small>{p.unit || "—"}</small>
              </button>
            ))
          : visiblePoints.map((p) => (
              <div
                className={`channel-row ${selection.kind === "point" && selection.id === p.id ? "selected" : ""}`}
                key={p.id}
              >
                {p.kind === "marker" ? (
                  <button
                    className="visibility-button"
                    title={hidden.has(p.id) ? t("显示标记点") : t("隐藏标记点")}
                    aria-label={`${hidden.has(p.id) ? t("显示") : t("隐藏")} ${p.label}`}
                    onClick={() => toggleHidden(p.id)}
                  >
                    {hidden.has(p.id) ? (
                      <EyeOff size={12} />
                    ) : (
                      <Eye size={12} />
                    )}
                  </button>
                ) : (
                  <Activity size={12} />
                )}
                <button
                  className="channel-name"
                  onClick={() => pickPoint(p.id)}
                >
                  {p.label}
                </button>
                <small>{p.unit}</small>
              </div>
            ))}
        {meta &&
          (tab === "analog" ? visibleAnalogs.length : visiblePoints.length) ===
            0 && <p className="empty-copy">{t("没有匹配的通道。")}</p>}
      </div>
    </>
  );
});
