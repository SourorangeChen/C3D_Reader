import { usePreferences } from "./Preferences";
import { useEffect, useRef, useState } from "react";
import { Crosshair, RotateCcw } from "lucide-react";
import type { Acquisition } from "./types";
import { trailWindow } from "./sceneGeometry";
import {
  applyTheme,
  createViewerScene,
  drawFrame,
  drawTrail,
  focusPoint,
  type ViewerScene,
} from "./viewerScene";

type Props = {
  meta: Acquisition;
  points?: Float32Array;
  frame: number;
  selected: number | null;
  hidden: Set<number>;
  segments: boolean;
  trails: boolean;
  onSelect: (id: number) => void;
  labels: boolean;
  view: string;
  up: "Z" | "Y";
};
const ARIA_LABEL =
  "C3D 三维标记点；拖动旋转，滚轮缩放，右键平移，点击选择标记点";

export function Viewer(props: Props) {
  const { resolvedTheme, t } = usePreferences();
  const host = useRef<HTMLDivElement>(null);
  const labelLayer = useRef<HTMLDivElement>(null);
  const state = useRef<ViewerScene | null>(null);
  const live = useRef(props);
  live.current = props;
  const [failure, setFailure] = useState("");
  const [hover, setHover] = useState("");
  // The scene is rebuilt for a new acquisition or vertical axis.
  useEffect(() => {
    let scene: ViewerScene;
    try {
      scene = createViewerScene({
        host: host.current!,
        labelLayer,
        meta: props.meta,
        up: props.up,
        live,
        ariaLabel: t(ARIA_LABEL),
        onHover: setHover,
      });
    } catch {
      setFailure(
        t("3D 视图需要 WebGL。请在浏览器中启用硬件加速；曲线和导出仍可使用。"),
      );
      return;
    }
    setFailure("");
    state.current = scene;
    return () => {
      state.current = null;
      scene.dispose();
    };
  }, [props.meta, props.up]);
  useEffect(() => {
    if (state.current) applyTheme(state.current, t(ARIA_LABEL));
  }, [resolvedTheme, t, props.meta, props.up]);
  useEffect(() => {
    const s = state.current;
    if (!s || !props.points) return;
    drawFrame(s, props.meta, props.points, props);
    // Metadata mounts the scene before the first frame has arrived.
    if (!s.hasPoints) {
      s.fit(live.current.view);
      s.hasPoints = true;
    }
    s.render();
  }, [
    resolvedTheme,
    props.points,
    props.hidden,
    props.selected,
    props.segments,
    props.labels,
    props.meta,
    props.up,
  ]);
  useEffect(() => {
    state.current?.fit(props.view);
    state.current?.render();
  }, [props.view]);
  // The trail is refetched every 10 frames, not on every frame.
  useEffect(() => {
    const controller = new AbortController();
    const s = state.current;
    if (!s) return;
    s.trail.visible = false;
    const selected = props.selected;
    if (!props.trails || selected == null) return;
    const { start, count } = trailWindow(props.frame, props.meta.pointRate);
    void fetch(
      `/api/files/${props.meta.id}/frames?start=${start}&count=${count}`,
      { signal: controller.signal },
    )
      .then((r) => {
        if (!r.ok) throw new Error("trail");
        return r.arrayBuffer();
      })
      .then((bytes) => {
        if (controller.signal.aborted) return;
        drawTrail(
          s,
          new Float32Array(bytes),
          props.meta.points.length,
          selected,
        );
      })
      .catch(() => {});
    return () => controller.abort();
  }, [
    props.trails,
    props.selected,
    props.meta,
    Math.floor(props.frame / 10),
    props.up,
  ]);
  return (
    <div className="viewer-shell">
      <div className="webgl-host" ref={host} />
      <div className="marker-labels" ref={labelLayer}>
        {props.meta.points.map((p) => (
          <span key={p.id} className="marker-label" style={{ display: "none" }}>
            {p.label}
          </span>
        ))}
      </div>
      <div className="view-top-note">
        <span className="live-dot" />
        {t("3D 场景")}{" "}
        <span className="muted">
          / {props.meta.pointUnit} · {props.up}
          {t("轴向上")}
        </span>
      </div>
      <div className="view-bottom-note">
        <span>{t("拖动旋转 · 滚轮缩放 · 右键平移")}</span>
        <span>{hover || t("点击标记点查看信号")}</span>
      </div>
      <div className="view-actions">
        <button
          className="icon-button"
          title={t("重置视角")}
          aria-label={t("重置视角")}
          onClick={() => {
            state.current?.fit(props.view);
            state.current?.render();
          }}
        >
          <RotateCcw size={15} />
        </button>
        <button
          className="icon-button"
          title={t("聚焦选中标记点")}
          aria-label={t("聚焦选中标记点")}
          disabled={props.selected == null}
          onClick={() => {
            const s = state.current;
            if (s && props.selected != null && props.points)
              focusPoint(s, props.points, props.selected);
          }}
        >
          <Crosshair size={15} />
        </button>
      </div>
      {!props.points && (
        <div className="viewport-message">{t("正在读取帧…")}</div>
      )}
      {failure && (
        <div className="viewport-message error-text">{t(failure)}</div>
      )}
    </div>
  );
}
