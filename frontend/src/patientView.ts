import { Box3, Vector3 } from "three";
import type { Point } from "./types";

// Prefer the pelvis: head turns and foot placement need not match the trunk.
const landmarks: [string[], string[]][] = [
  [
    ["LASI", "RASI"],
    ["LPSI", "RPSI"],
  ],
  [["LASI", "RASI"], ["SACR"]],
  [["CLAV"], ["C7"]],
  [["STRN"], ["T10"]],
  [
    ["LFHD", "RFHD"],
    ["LBHD", "RBHD"],
  ],
  [
    ["LTOE", "RTOE"],
    ["LHEE", "RHEE"],
  ],
];

export function patientView(
  markers: Point[],
  coordinates: Float32Array | undefined,
  transform: (x: number, y: number, z: number) => Vector3,
) {
  if (!coordinates) return null;
  // Keep namespaces together so two subjects cannot form a landmark pair.
  const subjects = new Map<string, Map<string, Vector3>>();
  markers.forEach((marker, i) => {
    if (marker.kind !== "marker") return;
    const [x, y, z] = coordinates.subarray(i * 3, i * 3 + 3);
    if (![x, y, z].every(Number.isFinite)) return;
    const separator = marker.label.lastIndexOf(":");
    const subject = marker.label.slice(0, separator + 1);
    const name = marker.label
      .slice(separator + 1)
      .trim()
      .toUpperCase();
    if (!subjects.has(subject)) subjects.set(subject, new Map());
    subjects.get(subject)!.set(name, transform(x, y, z));
  });
  for (const points of subjects.values()) {
    const mean = (names: string[]) => {
      if (!names.every((name) => points.has(name))) return null;
      return names
        .reduce((sum, name) => sum.add(points.get(name)!), new Vector3())
        .divideScalar(names.length);
    };
    for (const [anterior, posterior] of landmarks) {
      const front = mean(anterior),
        back = mean(posterior);
      if (!front || !back) continue;
      const forward = front.sub(back);
      // The renderer is always Y-up, including Z-up source acquisitions.
      forward.y = 0;
      if (forward.lengthSq() < 1e-8) continue;
      const bounds = new Box3().setFromPoints([...points.values()]);
      const size = bounds.getSize(new Vector3());
      return {
        forward: forward.normalize(),
        center: bounds.getCenter(new Vector3()),
        span: Math.max(1.5, size.x, size.y, size.z),
      };
    }
  }
  return null;
}
