import { test, expect } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { english } from "../frontend/src/translations";

// Interface copy is written in Chinese and looked up in `english`. Any Chinese
// string literal in the frontend must therefore have an English entry, or the
// English interface shows Chinese text.
const internal = new Set([
  // videoTiming.ts: thrown and caught internally; the panel shows its own copy.
  "视频帧索引不可用",
]);
const skipped = new Set([
  "translations.ts",
  "mediaTranslations.ts",
  "errors.ts",
]);

test("every Chinese interface string has an English translation", () => {
  const root = path.resolve("frontend/src");
  const missing: string[] = [];
  for (const name of readdirSync(root)) {
    if (!/\.tsx?$/.test(name) || skipped.has(name)) continue;
    const source = readFileSync(path.join(root, name), "utf8");
    for (const [, text] of source.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)) {
      if (/[一-鿿]/.test(text) && !(text in english) && !internal.has(text))
        missing.push(`${name}: ${text}`);
    }
  }
  expect(missing).toEqual([]);
});
