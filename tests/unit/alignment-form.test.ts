import { test, expect } from "vitest";
import {
  correlationPath,
  ESTIMATE_REASONS,
  estimateRequest,
  matchingChoice,
  savedOrigin,
  signalEvidence,
  timeValue,
} from "../../frontend/src/alignmentForm";
import type { AlignmentEstimate } from "../../frontend/src/synchronization";

const search = {
  column: "com_x",
  reference: "point:4",
  axis: "0",
  direction: "-1",
  low: "-1",
  high: "1.5",
  step: "0.02",
  gap: "0.1",
};

test("typed times must be finite numbers", () => {
  expect(timeValue("1.25")).toBe(1.25);
  expect(timeValue(" -0 ")).toBe(-0);
  for (const text of ["", "  ", "abc", "Infinity"])
    expect(() => timeValue(text)).toThrow("请输入有效的时间数值。");
});

test("a COM row is preselected only when it is unambiguous", () => {
  const row = (trial: string) => ({
    trial,
    baseline: 0,
    lag: 0,
    source: "COM",
  });
  expect(matchingChoice([row("anything")], "WT01.c3d")).toBe(0);
  expect(matchingChoice([row("WT02"), row("wt01.C3D")], "WT01.c3d")).toBe(1);
  expect(matchingChoice([row("WT01"), row("WT01.c3d")], "WT01.c3d")).toBe(-1);
  expect(matchingChoice([row("WT02"), row("WT03")], "WT01.c3d")).toBe(-1);
});

test("only c3d-reader-sync files carry a PTS origin", () => {
  expect(
    savedOrigin(
      JSON.stringify({ format: "c3d-reader-sync", video_pts_origin_s: 0.2 }),
    ),
  ).toBe(0.2);
  expect(savedOrigin(JSON.stringify({ format: "c3d-reader-sync" }))).toBeNull();
  expect(savedOrigin(JSON.stringify({ video_pts_origin_s: 0.2 }))).toBeNull();
});

test("the correlation curve breaks where no correlation was computed", () => {
  const curve = [1, 0, null, -1, 0.5].map((correlation, i) => ({
    lag: i,
    correlation,
    coverage: 1,
  }));
  expect(correlationPath(curve)).toBe(
    "M8.00,8.00L89.00,38.00M251.00,68.00L332.00,23.00",
  );
  expect(correlationPath([])).toBe("");
  expect(correlationPath([{ lag: 0, correlation: 0, coverage: 1 }])).toBe(
    "M8.00,38.00",
  );
});

test("the estimate request and evidence carry the search settings", () => {
  const signal = { times: [0, 0.1], values: [1, null] };
  expect(estimateRequest(signal, search, "2.5", [10, 90])).toEqual({
    times: [0, 0.1],
    values: [1, null],
    kind: "point",
    channel: 4,
    axis: 0,
    direction: -1,
    start: 10,
    stop: 91,
    baseline: 2.5,
    low: -1,
    high: 1.5,
    step: 0.02,
    maxGap: 0.1,
  });
  expect(() =>
    estimateRequest(signal, { ...search, step: "" }, "0", [0, 1]),
  ).toThrow();
  expect(() => estimateRequest(signal, search, "x", [0, 1])).toThrow();
  const estimate = { status: "accepted", lag: 0.3 } as AlignmentEstimate;
  expect(
    signalEvidence("sig.csv", search, [10, 90], { firstFrame: 101 }, estimate),
  ).toEqual({
    signal_file: "sig.csv",
    column: "com_x",
    reference: "point:4",
    axis: 0,
    direction: -1,
    frame_range: [111, 191],
    search: { low: -1, high: 1.5, step: 0.02, max_gap: 0.1 },
    quality: {
      min_coverage: 0.95,
      min_correlation: 0.5,
      peak_separation: 0.25,
      min_peak_margin: 0.02,
    },
    result: estimate,
  });
  expect(Object.keys(ESTIMATE_REASONS)).toContain("low_correlation");
});
