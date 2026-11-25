import { test, expect } from "@playwright/test";
import { Vector3 } from "three";
import { patientView } from "../frontend/src/patientView";

function pose(entries: Record<string, number[]>) {
  return {
    markers: Object.keys(entries).map((label, id) => ({
      id,
      label,
      kind: "marker",
      unit: "mm",
    })),
    coordinates: new Float32Array(Object.values(entries).flat()),
  };
}

for (const up of ["Z", "Y"] as const) {
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 3]) {
    test(`patient front follows heading ${angle} with ${up}-up source data`, () => {
      const body = {
        LASI: [-120, 35, 900],
        RASI: [120, 35, 900],
        LPSI: [-95, -95, 900],
        RPSI: [95, -95, 900],
        // Turned head must not override the pelvis.
        LFHD: [65, -70, 1650],
        RFHD: [65, 70, 1650],
        LBHD: [-65, -70, 1650],
        RBHD: [-65, 70, 1650],
      };
      const rotated = Object.fromEntries(
        Object.entries(body).map(([name, [x, y, z]]) => {
          const rx = x * Math.cos(angle) - y * Math.sin(angle) + 2300;
          const ry = x * Math.sin(angle) + y * Math.cos(angle) - 1700;
          return [`Patient:${name}`, up === "Z" ? [rx, ry, z] : [rx, z, -ry]];
        }),
      );
      const { markers, coordinates } = pose(rotated);
      const transform = (x: number, y: number, z: number) =>
        up === "Z"
          ? new Vector3(x, z, -y).multiplyScalar(0.001)
          : new Vector3(x, y, z).multiplyScalar(0.001);
      const patient = patientView(markers, coordinates, transform)!;
      expect(patient.forward.x).toBeCloseTo(-Math.sin(angle), 5);
      expect(patient.forward.y).toBe(0);
      expect(patient.forward.z).toBeCloseTo(-Math.cos(angle), 5);
      expect(patient.center.y).toBeCloseTo(1.275);
      expect(patient.center.x).toBeGreaterThan(2);
    });
  }
}

test("missing pelvis uses trunk landmarks and never mixes subjects", () => {
  const { markers, coordinates } = pose({
    "A:LASI": [-120, 35, 900],
    "A:RASI": [120, 35, 900],
    "B:LPSI": [-95, -95, 900],
    "B:RPSI": [95, -95, 900],
    "A:CLAV": [40, 0, 1400],
    "A:C7": [-60, 0, 1430],
  });
  const transform = (x: number, y: number, z: number) =>
    new Vector3(x, z, -y).multiplyScalar(0.001);
  expect(
    patientView(markers, coordinates, transform)!.forward.toArray(),
  ).toEqual([1, 0, 0]);
  coordinates.fill(NaN, 12);
  expect(patientView(markers, coordinates, transform)).toBeNull();
  expect(patientView(markers, undefined, transform)).toBeNull();
});

test("unrecognized or coincident landmarks have no inferred patient direction", () => {
  const { markers, coordinates } = pose({
    LASI: [0, 0, 900],
    RASI: [0, 0, 900],
    LPSI: [0, 0, 900],
    RPSI: [0, 0, 900],
    UNKNOWN: [100, 100, 100],
  });
  expect(
    patientView(markers, coordinates, (x, y, z) => new Vector3(x, z, -y)),
  ).toBeNull();
});
