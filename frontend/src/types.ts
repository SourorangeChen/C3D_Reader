export type Point = {
  id: number;
  label: string;
  kind: string;
  unit: string;
  role?: "centerOfMass" | "centerOfMassFloor" | null;
};
export type Analog = { id: number; label: string; unit: string };
export type GaitEvent = {
  label: string;
  context: string;
  frame: number;
  time: number;
};
export type Acquisition = {
  id: string;
  name: string;
  size: number;
  firstFrame: number;
  lastFrame: number;
  frameCount: number;
  pointRate: number;
  analogRate: number;
  samplesPerFrame: number;
  duration: number;
  pointUnit: string;
  points: Point[];
  analogs: Analog[];
  events: GaitEvent[];
  plates: { id: number; type: number; corners: number[][] }[];
  segments: [number, number][];
  bounds: number[][];
  manufacturer: string;
  storage: string;
};
export type Selection = { kind: "point" | "analog"; id: number };
export type Library = {
  folder: string;
  available: boolean;
  files: { id: string; name: string; size: number }[];
  demo: { id: string; name: string; size: number };
};
export type Series = {
  name: string;
  label: string;
  unit: string;
  times: number[];
  values: (number | null)[];
};
export type SeriesData = {
  series: Series[];
  start: number;
  stop: number;
  sampleRate: number;
  method: string;
};
export type ParameterGroup = {
  name: string;
  parameters: {
    name: string;
    description: string;
    dimensions: number[];
    value: unknown;
  }[];
};
export const isVirtual = (p: Point) =>
  /^(PEL|LFE|LTI|LFO|LTO|RFE|RTI|RFO|RTO|HED|LCL|RCL|TRX|LHU|LRA|LHN|RHU|RRA|RHN)[OALP]$/.test(
    p.label.split(":").at(-1) || "",
  );
export const formatBytes = (v: number) =>
  v >= 1e6 ? `${(v / 1e6).toFixed(1)} MB` : `${(v / 1e3).toFixed(0)} KB`;
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new ApiError(
      error?.detail || `请求失败 (${response.status})`,
      response.status,
    );
  }
  return response.json();
}
