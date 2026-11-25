import { defineConfig } from "vitest/config";

// Unit tests for pure frontend logic run in Node. Browser and Electron
// behavior stays in Playwright (tests/*.spec.ts, tests/desktop).
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
