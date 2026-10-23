import { usePreferences } from "./Preferences";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Crosshair, RotateCcw } from "lucide-react";
import type { Acquisition } from "./types";

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
type SceneState = {
  renderer: THREE.WebGLRenderer;
  grid: THREE.GridHelper;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  mesh: THREE.InstancedMesh;
  lines: THREE.LineSegments;
  trail: THREE.Line;
  colors: { left: string; right: string; selected: string };
  transform: (x: number, y: number, z: number) => THREE.Vector3;
  fit: (view: string) => void;
  render: () => void;
};
export function Viewer(props: Props) {
  const { resolvedTheme, t } = usePreferences();
  const host = useRef<HTMLDivElement>(null);
  const labelLayer = useRef<HTMLDivElement>(null);
  const state = useRef<SceneState | null>(null);
  const live = useRef(props);
  live.current = props;
  const [failure, setFailure] = useState("");
  const [hover, setHover] = useState("");
  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setFailure(
        t("3D 视图需要 WebGL。请在浏览器中启用硬件加速；曲线和导出仍可使用。"),
      );
      return;
    }
    setFailure("");
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const palette = getComputedStyle(document.documentElement);
    const token = (name: string) => palette.getPropertyValue(name).trim();
    renderer.setClearColor(token("--surface"));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      "aria-label",
      t("C3D 三维标记点；拖动旋转，滚轮缩放，右键平移，点击选择标记点"),
    );
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.005, 5000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.minDistance = 0.1;
    controls.maxDistance = 500;
    const meta = props.meta;
    const factor =
      ({ mm: 0.001, cm: 0.01, m: 1 } as Record<string, number>)[
        meta.pointUnit.toLowerCase()
      ] || 0.001;
    const center = meta.bounds[0].map((v, i) => (v + meta.bounds[1][i]) / 2);
    const up = props.up;
    const transform = (x: number, y: number, z: number) =>
      up === "Z"
        ? new THREE.Vector3(
            (x - center[0]) * factor,
            z * factor,
            -(y - center[1]) * factor,
          )
        : new THREE.Vector3(
            (x - center[0]) * factor,
            y * factor,
            (z - center[2]) * factor,
          );
    const height = Math.max(0.3, center[up === "Z" ? 2 : 1] * factor);
    const span = Math.max(
      1.5,
      ...meta.bounds[1].map((v, i) => (v - meta.bounds[0][i]) * factor),
    );
    const distance = span * 1.15;
    const target = new THREE.Vector3(0, height, 0);
    const fit = (view: string) => {
      controls.target.copy(target);
      const offsets: Record<string, number[]> = {
        perspective: [distance * 0.9, distance * 0.45, distance],
        front: [0, 0, distance * 1.4],
        side: [distance * 1.4, 0, 0],
        top: [0, distance * 1.4, 0.0001],
      };
      camera.position
        .copy(target)
        .add(
          new THREE.Vector3(
            ...((offsets[view] || offsets.perspective) as [
              number,
              number,
              number,
            ]),
          ),
        );
      controls.update();
    };
    fit(live.current.view);
    const gridSize = Math.max(6, Math.ceil(span * 2));
    const grid = new THREE.GridHelper(
      gridSize,
      gridSize * 2,
      token("--scene-grid-center"),
      token("--scene-grid"),
    );
    scene.add(grid);
    const axes = new THREE.AxesHelper(0.35);
    axes.position.set(-span * 0.48, 0.005, span * 0.45);
    scene.add(axes);
    const mesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.012, 10, 8),
      new THREE.MeshBasicMaterial(),
      meta.points.length,
    );
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    scene.add(mesh);
    const lines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: token("--scene-line"),
        transparent: true,
        opacity: 0.6,
      }),
    );
    lines.frustumCulled = false;
    scene.add(lines);
    const trail = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: token("--signal-x"),
        transparent: true,
        opacity: 0.75,
      }),
    );
    trail.frustumCulled = false;
    scene.add(trail);
    meta.plates.forEach((plate) => {
      const verts = [...plate.corners, plate.corners[0]].flatMap((p) =>
        transform(p[0], p[1], p[2]).toArray(),
      );
      const line = new THREE.Line(
        new THREE.BufferGeometry().setAttribute(
          "position",
          new THREE.Float32BufferAttribute(verts, 3),
        ),
        new THREE.LineBasicMaterial({ color: "#6c6a73" }),
      );
      scene.add(line);
    });
    const render = () => {
      renderer.render(scene, camera);
      const layer = labelLayer.current;
      if (!layer) return;
      const { points, hidden, labels, selected } = live.current;
      if (!points) return;
      const elements = layer.children;
      meta.points.forEach((p, i) => {
        const label = elements[i] as HTMLElement;
        if (!label) return;
        const x = points[i * 3],
          y = points[i * 3 + 1],
          z = points[i * 3 + 2];
        const visible =
          p.kind === "marker" &&
          !hidden.has(i) &&
          Number.isFinite(x + y + z) &&
          (labels || selected === i);
        if (!visible) {
          label.style.display = "none";
          return;
        }
        const v = transform(x, y, z).project(camera);
        label.style.display =
          Math.abs(v.z) < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1
            ? ""
            : "none";
        label.style.transform = `translate(${(v.x * 0.5 + 0.5) * el.clientWidth + 9}px,${(-v.y * 0.5 + 0.5) * el.clientHeight - 9}px)`;
        label.className =
          selected === i ? "marker-label selected" : "marker-label";
      });
    };
    controls.addEventListener("change", render);
    const resize = new ResizeObserver(() => {
      const w = el.clientWidth,
        h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      render();
    });
    resize.observe(el);
    const raycaster = new THREE.Raycaster();
    const pick = (event: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((event.clientX - r.left) / r.width) * 2 - 1,
          (-(event.clientY - r.top) / r.height) * 2 + 1,
        ),
        camera,
      );
      return raycaster.intersectObject(mesh)[0]?.instanceId;
    };
    let down = [0, 0];
    const pointerdown = (e: PointerEvent) => {
      down = [e.clientX, e.clientY];
    };
    const pointerup = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) {
        const id = pick(e);
        if (id != null) live.current.onSelect(id);
      }
    };
    const pointermove = (e: PointerEvent) => {
      const id = pick(e);
      setHover(id != null ? meta.points[id].label : "");
      renderer.domElement.style.cursor = id != null ? "pointer" : "grab";
    };
    renderer.domElement.addEventListener("pointerdown", pointerdown);
    renderer.domElement.addEventListener("pointerup", pointerup);
    renderer.domElement.addEventListener("pointermove", pointermove);
    state.current = {
      renderer,
      grid,
      scene,
      camera,
      controls,
      mesh,
      lines,
      trail,
      colors: {
        left: token("--signal-x"),
        right: token("--signal-y"),
        selected: token("--text"),
      },
      transform,
      fit,
      render,
    };
    render();
    return () => {
      state.current = null;
      resize.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", pointerdown);
      renderer.domElement.removeEventListener("pointerup", pointerup);
      renderer.domElement.removeEventListener("pointermove", pointermove);
      scene.traverse((object) => {
        const o = object as THREE.Mesh;
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [props.meta, props.up]);
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    const palette = getComputedStyle(document.documentElement);
    const token = (name: string) => palette.getPropertyValue(name).trim();
    s.renderer.setClearColor(token("--surface"));
    const gridColor = new THREE.Color(token("--scene-grid"));
    const gridColors = s.grid.geometry.getAttribute("color");
    const centerColor = new THREE.Color(token("--scene-grid-center"));
    const positions = s.grid.geometry.getAttribute("position");
    for (let i = 0; i < gridColors.count; i++) {
      const c =
        positions.getX(i) === 0 || positions.getZ(i) === 0
          ? centerColor
          : gridColor;
      gridColors.setXYZ(i, c.r, c.g, c.b);
    }
    gridColors.needsUpdate = true;
    s.grid.material.color.set("#ffffff");
    (s.lines.material as THREE.LineBasicMaterial).color.set(
      token("--scene-line"),
    );
    (s.trail.material as THREE.LineBasicMaterial).color.set(
      token("--signal-x"),
    );
    s.colors = {
      left: token("--signal-x"),
      right: token("--signal-y"),
      selected: token("--text"),
    };
    s.renderer.domElement.setAttribute(
      "aria-label",
      t("C3D 三维标记点；拖动旋转，滚轮缩放，右键平移，点击选择标记点"),
    );
    s.render();
  }, [resolvedTheme, t, props.meta, props.up]);
  useEffect(() => {
    const s = state.current;
    if (!s || !props.points) return;
    const matrix = new THREE.Matrix4(),
      color = new THREE.Color();
    props.meta.points.forEach((p, i) => {
      const x = props.points![i * 3],
        y = props.points![i * 3 + 1],
        z = props.points![i * 3 + 2];
      if (
        p.kind !== "marker" ||
        props.hidden.has(i) ||
        !Number.isFinite(x + y + z)
      )
        matrix.makeScale(0, 0, 0);
      else {
        matrix.makeScale(
          i === props.selected ? 1.75 : 1,
          i === props.selected ? 1.75 : 1,
          i === props.selected ? 1.75 : 1,
        );
        matrix.setPosition(s.transform(x, y, z));
      }
      s.mesh.setMatrixAt(i, matrix);
      s.mesh.setColorAt(
        i,
        color.set(
          i === props.selected
            ? s.colors.selected
            : p.label.split(":").at(-1)?.startsWith("L")
              ? s.colors.left
              : s.colors.right,
        ),
      );
    });
    s.mesh.instanceMatrix.needsUpdate = true;
    if (s.mesh.instanceColor) s.mesh.instanceColor.needsUpdate = true;
    const pairs = props.segments ? props.meta.segments : [];
    const positions: number[] = [];
    pairs.forEach(([a, b]) => {
      if (props.hidden.has(a) || props.hidden.has(b)) return;
      const a0 = props.points!.slice(a * 3, a * 3 + 3),
        b0 = props.points!.slice(b * 3, b * 3 + 3);
      if ([...a0, ...b0].every(Number.isFinite)) {
        positions.push(
          ...s
            .transform(...(a0 as unknown as [number, number, number]))
            .toArray(),
          ...s
            .transform(...(b0 as unknown as [number, number, number]))
            .toArray(),
        );
      }
    });
    s.lines.geometry.dispose();
    s.lines.geometry = new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
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
  useEffect(() => {
    const controller = new AbortController();
    const s = state.current;
    if (!s) return;
    s.trail.visible = false;
    if (!props.trails || props.selected == null) return;
    const start = Math.max(
      0,
      props.frame - Math.round(props.meta.pointRate * 1.5),
    );
    void fetch(
      `/api/files/${props.meta.id}/frames?start=${start}&count=${props.frame - start + 1}`,
      { signal: controller.signal },
    )
      .then((r) => {
        if (!r.ok) throw new Error("trail");
        return r.arrayBuffer();
      })
      .then((bytes) => {
        if (controller.signal.aborted) return;
        const data = new Float32Array(bytes),
          n = props.meta.points.length,
          verts: number[] = [];
        // NaN vertices break the strip at missing samples instead of joining gaps.
        for (let j = 0; j < data.length / (n * 3); j++) {
          const i = (j * n + props.selected!) * 3;
          verts.push(
            ...s.transform(data[i], data[i + 1], data[i + 2]).toArray(),
          );
        }
        s.trail.geometry.dispose();
        s.trail.geometry = new THREE.BufferGeometry().setAttribute(
          "position",
          new THREE.Float32BufferAttribute(verts, 3),
        );
        s.trail.visible = true;
        s.render();
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
            const s = state.current,
              i = props.selected;
            if (!s || i == null || !props.points) return;
            const a = props.points.slice(i * 3, i * 3 + 3);
            if (![...a].every(Number.isFinite)) return;
            s.controls.target.copy(
              s.transform(...(a as unknown as [number, number, number])),
            );
            s.controls.update();
            s.render();
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
