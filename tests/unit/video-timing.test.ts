import { test, expect } from "vitest";
import { frameAtTime, readVideoTimes } from "../../frontend/src/videoTiming";

test("frame lookup uses presentation intervals instead of a nominal frame rate", () => {
  const times = [0, 0.04, 0.16, 0.18, 0.26];
  expect(frameAtTime(times, 0.12)).toBe(1);
  expect(frameAtTime(times, 0.17)).toBe(2);
  expect(frameAtTime(times, 0.18)).toBe(3);
  expect(frameAtTime(times, 0.259)).toBe(3);
  expect(frameAtTime(times, 0.26000001)).toBe(4);
  expect(frameAtTime([], 1)).toBe(-1);
  expect(frameAtTime(times, NaN)).toBe(-1);
});

test("unreadable and cancelled indexes fail without inventing frame numbers", async () => {
  await expect(
    readVideoTimes(new Blob(["not video"]), new AbortController().signal),
  ).rejects.toThrow();
  const controller = new AbortController();
  controller.abort();
  await expect(readVideoTimes(new Blob(), controller.signal)).rejects.toThrow();
});
