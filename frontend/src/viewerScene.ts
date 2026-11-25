// The WebGL scene behind Viewer: created once per acquisition and vertical
// axis, then updated in place for theme, frame, selection and trails.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Acquisition } from "./types";
import { patientView } from "./patientView";
import {
  cameraOffset,
  isLeftMarker,
  labelPosition,
  markerShown,
  pointAt,
  sceneFrame,
  segmentPositions,
  trailPositions,
  type SceneTransform,
  type Up,
} from "./sceneGeometry";

/** What the scene reads at render time; Viewer keeps it current. */
export type LiveView = {
  points?: Float32Array;
  hidden: Set<number>;
  labels: boolean;
  selected: number | null;
  view: string;
  onSelect: (id: number) => void;
};
export type ViewerScene = {
  renderer: THREE.WebGLRenderer;
  grid: THREE.GridHelper;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  mesh: THREE.InstancedMesh;
  lines: THREE.LineSegments;
  trail: THREE.Line;
  colors: { left: string; right: string; selected: string };
  transform: SceneTransform;
  fit: (view: string) => void;
  hasPoints: boolean;
  render: () => void;
  dispose: () => void;
};

function themeToken() {
  const palette = getComputedStyle(document.documentElement);
  return (name: string) => palette.getPropertyValue(name).trim();
}
const markerColors = (token: (name: string) => string) => ({
  left: token("--signal-x"),
  right: token("--signal-y"),
  selected: token("--text"),
});
const setGeometry = (object: THREE.Line, positions: number[]) => {
  object.geometry.dispose();
  object.geometry = new THREE.BufferGeometry().setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
};

/** Throws when WebGL is unavailable. */
export function createViewerScene(options: {
  host: HTMLDivElement;
  labelLayer: { current: HTMLDivElement | null };
  meta: Acquisition;
  up: Up;
  live: { current: LiveView };
  ariaLabel: string;
  onHover: (label: string) => void;
}): ViewerScene {
  const { host: el, labelLayer, meta, live } = options;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const token = themeToken();
  renderer.setClearColor(token("--surface"));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  el.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-label", options.ariaLabel);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.005, 5000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.minDistance = 0.1;
  controls.maxDistance = 500;
  const { transform, span, distance, target, gridSize } = sceneFrame(
    meta,
    options.up,
  );
  let lastPatientView: ReturnType<typeof patientView> = null;
  const fit = (view: string) => {
    controls.target.copy(target);
    camera.position.copy(target).add(cameraOffset(view, distance));
    // Front and side views face the subject, not the lab axes.
    if (view === "front" || view === "side") {
      const patient = patientView(meta.points, live.current.points, transform);
      if (patient) lastPatientView = patient;
      if (lastPatientView) {
        const { center, forward, span } = lastPatientView;
        const direction = forward.clone();
        if (view === "side") direction.cross(new THREE.Vector3(0, 1, 0));
        controls.target.copy(center);
        camera.position
          .copy(center)
          .addScaledVector(direction, span * 1.15 * 1.4);
      }
    }
    controls.update();
  };
  fit(live.current.view);
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
      const at = pointAt(points, i);
      if (
        !at ||
        !markerShown(p, i, points, hidden) ||
        !(labels || selected === i)
      ) {
        label.style.display = "none";
        return;
      }
      const position = labelPosition(
        transform(...at).project(camera),
        el.clientWidth,
        el.clientHeight,
      );
      label.style.display = position ? "" : "none";
      if (position)
        label.style.transform = `translate(${position.left}px,${position.top}px)`;
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
  // A click selects; a drag (more than 5 px) only orbits.
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
    options.onHover(id != null ? meta.points[id].label : "");
    renderer.domElement.style.cursor = id != null ? "pointer" : "grab";
  };
  renderer.domElement.addEventListener("pointerdown", pointerdown);
  renderer.domElement.addEventListener("pointerup", pointerup);
  renderer.domElement.addEventListener("pointermove", pointermove);
  const dispose = () => {
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
  const state: ViewerScene = {
    renderer,
    grid,
    camera,
    controls,
    mesh,
    lines,
    trail,
    colors: markerColors(token),
    transform,
    fit,
    hasPoints: false,
    render,
    dispose,
  };
  render();
  return state;
}

/** Recolor the scene from the current theme's CSS variables. */
export function applyTheme(s: ViewerScene, ariaLabel: string) {
  const token = themeToken();
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
  (s.trail.material as THREE.LineBasicMaterial).color.set(token("--signal-x"));
  s.colors = markerColors(token);
  s.renderer.domElement.setAttribute("aria-label", ariaLabel);
  s.render();
}

/** Place and color the markers and segment lines for one frame. */
export function drawFrame(
  s: ViewerScene,
  meta: Acquisition,
  points: Float32Array,
  options: {
    hidden: Set<number>;
    selected: number | null;
    segments: boolean;
  },
) {
  const { hidden, selected } = options;
  const matrix = new THREE.Matrix4(),
    color = new THREE.Color();
  meta.points.forEach((p, i) => {
    if (!markerShown(p, i, points, hidden)) matrix.makeScale(0, 0, 0);
    else {
      const scale = i === selected ? 1.75 : 1;
      matrix.makeScale(scale, scale, scale);
      matrix.setPosition(s.transform(...pointAt(points, i)!));
    }
    s.mesh.setMatrixAt(i, matrix);
    s.mesh.setColorAt(
      i,
      color.set(
        i === selected
          ? s.colors.selected
          : isLeftMarker(p.label)
            ? s.colors.left
            : s.colors.right,
      ),
    );
  });
  s.mesh.instanceMatrix.needsUpdate = true;
  if (s.mesh.instanceColor) s.mesh.instanceColor.needsUpdate = true;
  setGeometry(
    s.lines,
    segmentPositions(
      options.segments ? meta.segments : [],
      points,
      hidden,
      s.transform,
    ),
  );
}

/** Show the selected point's recent path. */
export function drawTrail(
  s: ViewerScene,
  frames: Float32Array,
  pointCount: number,
  point: number,
) {
  setGeometry(s.trail, trailPositions(frames, pointCount, point, s.transform));
  s.trail.visible = true;
  s.render();
}

/** Orbit around the selected marker; false when it is missing in this frame. */
export function focusPoint(s: ViewerScene, points: Float32Array, i: number) {
  const at = pointAt(points, i);
  if (!at) return false;
  s.controls.target.copy(s.transform(...at));
  s.controls.update();
  s.render();
  return true;
}
