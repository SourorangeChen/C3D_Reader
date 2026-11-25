import type { ReactNode } from "react";
import { Box, Maximize2 } from "lucide-react";
import { usePreferences } from "./Preferences";
import { IconButton } from "./IconButton";
import { Viewer } from "./Viewer";
import type { Acquisition } from "./types";
import type { useSceneOptions } from "./useSceneOptions";

/** 3D view with its toolbar and legend; `media` is the docked video panel. */
export function ScenePanel({
  meta,
  frame,
  points,
  selected,
  scene,
  sourceChanged,
  showMedia,
  onPick,
  onToggleInspector,
  media,
}: {
  meta: Acquisition | null;
  frame: number;
  points?: Float32Array;
  /** Selected marker, highlighted in the scene. */
  selected: number | null;
  scene: ReturnType<typeof useSceneOptions>;
  sourceChanged: boolean;
  showMedia: boolean;
  onPick: (id: number) => void;
  onToggleInspector: () => void;
  media: ReactNode;
}) {
  const { t } = usePreferences();
  const { segments, setSegments, trails, setTrails, labels, setLabels } = scene;
  return (
    <section
      className={`scene-panel ${showMedia ? "with-media" : ""}`}
      aria-label={t("三维视图")}
    >
      <div className="scene-toolbar">
        <div className="toolbar-group">
          <Box size={14} />
          <select
            aria-label={t("视角")}
            value={scene.view}
            onChange={(e) => scene.setView(e.target.value)}
          >
            <option value="perspective">{t("透视视图")}</option>
            <option value="front">{t("正面视图")}</option>
            <option value="side">{t("侧面视图")}</option>
            <option value="top">{t("俯视视图")}</option>
          </select>
        </div>
        <div className="toolbar-toggles">
          <button
            className={segments ? "active" : ""}
            aria-pressed={segments}
            onClick={() => setSegments((v) => !v)}
          >
            {t("连线")}
          </button>
          <button
            className={trails ? "active" : ""}
            aria-pressed={trails}
            onClick={() => setTrails((v) => !v)}
          >
            {t("轨迹")}
          </button>
          <button
            className={labels ? "active" : ""}
            aria-pressed={labels}
            onClick={() => setLabels((v) => !v)}
          >
            {t("标签")}
          </button>
          <select
            aria-label={t("地面向上轴")}
            value={scene.up}
            onChange={(e) => scene.setUp(e.target.value as "Z" | "Y")}
          >
            <option value="Z">Z ↑</option>
            <option value="Y">Y ↑</option>
          </select>
          <IconButton label={t("切换信息面板")} onClick={onToggleInspector}>
            <Maximize2 size={13} />
          </IconButton>
        </div>
      </div>
      <div className={`scene-content ${showMedia && meta ? "has-media" : ""}`}>
        {meta ? (
          <Viewer
            meta={meta}
            frame={frame}
            points={points}
            selected={selected}
            hidden={scene.hidden}
            segments={segments}
            trails={trails && !sourceChanged}
            labels={labels}
            view={scene.view}
            up={scene.up}
            onSelect={onPick}
          />
        ) : (
          <div className="viewer-placeholder">
            {t("选择一个 C3D 文件开始查看")}
          </div>
        )}
        {media}
      </div>
      <div className="scene-legend">
        <span>
          <i className="dot left" />
          {t("左侧标记点")}
        </span>
        <span>
          <i className="dot right" />
          {t("右侧 / 其他")}
        </span>
        <span className="scene-footnote">
          {meta?.plates.length
            ? t("{0} 块力台轮廓 · ", [meta.plates.length])
            : ""}
          {t("连线为标签推断")}
        </span>
      </div>
    </section>
  );
}
