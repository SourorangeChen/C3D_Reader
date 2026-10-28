import { test, expect, type Page } from "@playwright/test";

const picture = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6B3sAAAAASUVORK5CYII=",
  "base64",
);
const files = Array.from({ length: 15 }, (_, i) => ({
  name: `frame_${i}.png`,
  mimeType: "image/png",
  buffer: picture,
}));
const complete = (status = "accepted") => ({
  id: "fixture-job",
  status: "complete",
  phase: "complete",
  progress: 100,
  error: null,
  result: {
    status,
    offset: 0.3,
    correlation: 0.96,
    candidates: [{ offset: 0.3, error: 0.05 }],
    reason: "motion_match_ambiguous",
  },
});
async function enterImages(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "视频同步", exact: true }).click();
  await page.getByLabel("导入图片序列", { exact: true }).setInputFiles(files);
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__automaticStarts = [];
    window.c3dDesktop = {
      platform: "darwin",
      openFile: async () => {},
      openFolder: async () => {},
      openDroppedFile: async () => {},
      onOpen: () => () => {},
      ready: async () => {},
      onSettings: () => () => {},
      setPreferences: async () => {},
      getPreferences: async () => ({
        theme: "dark",
        language: "zh-CN",
        layout: { library: 230, inspector: 220, scene: 0.67 },
      }),
      startAutoAlignment: async (_files, options) => {
        (window as any).__automaticStarts.push(options);
        return {
          id: "fixture-job",
          status: "running",
          phase: "extracting",
          progress: 0,
          result: null,
          error: null,
        };
      },
    };
  });
});

test("image timing triggers automatic alignment without a manual anchor", async ({
  page,
}) => {
  await page.route("**/api/auto-alignment/fixture-job", (route) =>
    route.fulfill({ json: complete() }),
  );
  await enterImages(page);
  expect(
    await page.evaluate(() => (window as any).__automaticStarts.length),
  ).toBe(0);
  await page.getByLabel("源视频 FPS", { exact: true }).fill("10");
  await expect(page.getByLabel("自动动作对齐", { exact: true })).toContainText(
    "已自动应用",
  );
  await expect(page.getByAltText("原视频帧 3", { exact: true })).toBeVisible();
  const options = await page.evaluate(
    () => (window as any).__automaticStarts[0],
  );
  expect(options.times).toEqual(Array.from({ length: 15 }, (_, i) => i / 10));
  expect(options).not.toHaveProperty("offset");
  expect(options).not.toHaveProperty("lag");
});

test("ambiguous matches stay independent until the user previews a candidate", async ({
  page,
}) => {
  await page.route("**/api/auto-alignment/fixture-job", (route) =>
    route.fulfill({ json: complete("rejected") }),
  );
  await enterImages(page);
  await page.getByLabel("源视频 FPS", { exact: true }).fill("10");
  await expect(page.getByLabel("自动动作对齐", { exact: true })).toContainText(
    "未自动应用偏移",
  );
  await expect(page.locator(".media-readout")).toContainText("独立预览");
  await page
    .getByRole("button", { name: "预览候选 1：0.300 秒", exact: true })
    .click();
  await expect(page.getByAltText("原视频帧 3", { exact: true })).toBeVisible();
  await expect(page.locator(".media-readout")).toContainText(
    "已建立时间对应 · 待复核",
  );
});

test("late automatic responses cannot overwrite a manual anchor", async ({
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/auto-alignment/fixture-job", async (route) => {
    if (route.request().method() === "GET") await pending;
    await route.fulfill({ json: complete() }).catch(() => {});
  });
  await enterImages(page);
  await page.getByLabel("源视频 FPS", { exact: true }).fill("10");
  await expect(
    page.getByRole("button", { name: "取消识别", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "将当前画面对齐到此 C3D 帧", exact: true })
    .click();
  release();
  await page.getByLabel("当前帧", { exact: true }).fill("11");
  await expect(page.getByAltText("原视频帧 1", { exact: true })).toBeVisible();
  await expect(page.locator(".media-readout")).toContainText(
    "已建立时间对应 · 待复核",
  );
  await expect(
    page.getByLabel("自动动作对齐", { exact: true }),
  ).not.toContainText("已自动应用");
});
