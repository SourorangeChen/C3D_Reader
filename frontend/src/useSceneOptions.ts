import { useCallback, useState } from "react";
import type { Point } from "./types";
import { toggled, virtualPointIds, withVirtualPoints } from "./workbench";

// 3D display choices: hidden markers, overlays, camera view and vertical axis.
export function useSceneOptions() {
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [segments, setSegments] = useState(true);
  const [trails, setTrails] = useState(false);
  const [labels, setLabels] = useState(false);
  const [showVirtual, setShowVirtual] = useState(false);
  const [view, setView] = useState("perspective");
  const [up, setUp] = useState<"Z" | "Y">("Z");

  // A newly opened acquisition hides Vicon local-coordinate points again.
  const reset = useCallback((points: Point[]) => {
    setShowVirtual(false);
    setHidden(virtualPointIds(points));
  }, []);
  const toggleHidden = (id: number) => setHidden((old) => toggled(old, id));
  const toggleVirtual = (points: Point[]) => {
    setShowVirtual((v) => !v);
    setHidden((old) => withVirtualPoints(old, points, !showVirtual));
  };

  return {
    hidden,
    segments,
    setSegments,
    trails,
    setTrails,
    labels,
    setLabels,
    showVirtual,
    view,
    setView,
    up,
    setUp,
    reset,
    toggleHidden,
    toggleVirtual,
  };
}
