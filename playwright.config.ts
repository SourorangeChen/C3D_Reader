import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  testIgnore: "**/desktop/**",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:8011",
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
  webServer: {
    command: "python3 -m uvicorn backend.app:app --host 127.0.0.1 --port 8011",
    url: "http://127.0.0.1:8011/api/health",
    reuseExistingServer: !process.env.CI,
    env: { C3D_READER_CONFIG_DIR: ".local/e2e-config", C3D_READER_DATA: "" },
  },
});
