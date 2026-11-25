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
async function switchTrial(page: Page, id: string) {
  const meta = await (await page.request.get("/api/files/demo")).json();
  if (id !== "demo")
    await page.route(`**/api/files/${id}/**`, (route) =>
      route.continue({
        url: route
          .request()
          .url()
          .replace(`/api/files/${id}/`, "/api/files/demo/"),
      }),
    );
  await page.evaluate(
    ({ meta, id }) =>
      (window as any).__openAcquisition({
        acquisition: {
          ...meta,
          id,
          name: id === "demo" ? meta.name : `${id}.c3d`,
        },
      }),
    { meta, id },
  );
  await expect(
    page.getByRole("heading", {
      name: id === "demo" ? "Synthetic walking" : `${id}.c3d`,
      exact: true,
    }),
  ).toBeVisible();
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__automaticStarts = [];
    window.c3dDesktop = {
      platform: "darwin",
      openFile: async () => {},
      openFolder: async () => {},
      openDroppedFile: async () => {},
      onOpen: (callback) => {
        (window as any).__openAcquisition = callback;
        return () => {};
      },
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
          id: (window as any).__jobId || "fixture-job",
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
  await expect(page.locator(".media-readout")).toContainText("尚未对齐");
  await page
    .getByRole("button", { name: "试用候选 1：0.300 秒", exact: true })
    .click();
  await expect(page.getByAltText("原视频帧 3", { exact: true })).toBeVisible();
  await expect(page.locator(".media-readout")).toContainText(
    "候选对齐 · 待复核",
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
  await expect(
    page.getByRole("button", { name: "应用手动对齐", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".media-alignment-more")).toHaveCount(0);
  await expect(page.getByLabel("图片预览帧", { exact: true })).toHaveCount(0);
  await expect(page.locator(".media-readout")).toContainText("正在自动对齐");
  await page
    .getByLabel("自动动作对齐", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".local/screenshots/alignment-running.png",
    animations: "disabled",
  });
  await page.getByRole("button", { name: "手动对齐", exact: true }).click();
  await expect(page.getByLabel("图片预览帧", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "应用手动对齐", exact: true }).click();
  release();
  await page.getByLabel("当前帧", { exact: true }).fill("11");
  await expect(page.getByAltText("原视频帧 1", { exact: true })).toBeVisible();
  await expect(page.locator(".media-readout")).toContainText(
    "已建立时间对应 · 待复核",
  );
  await expect(page.getByLabel("自动动作对齐", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "手动对齐", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("manual mode stays selected when image timing changes and automatic mode can be restarted", async ({
  page,
}) => {
  await page.route("**/api/auto-alignment/fixture-job", (route) =>
    route.fulfill({ json: complete() }),
  );
  await enterImages(page);
  await page.getByRole("button", { name: "手动对齐", exact: true }).click();
  await page.getByLabel("源视频 FPS", { exact: true }).fill("10");
  await page.getByLabel("文件帧号起点", { exact: true }).selectOption("0");
  await expect(
    page.getByRole("button", { name: "应用手动对齐", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(() => (window as any).__automaticStarts.length),
  ).toBe(0);
  await page.getByRole("button", { name: "应用手动对齐", exact: true }).click();
  await page.getByRole("button", { name: "自动对齐", exact: true }).click();
  await expect(page.getByLabel("自动动作对齐", { exact: true })).toContainText(
    "已自动应用",
  );
  expect(
    await page.evaluate(() => (window as any).__automaticStarts.length),
  ).toBe(1);
  await expect(
    page.getByRole("button", { name: "应用手动对齐", exact: true }),
  ).toHaveCount(0);
});

test("cancelling recognition keeps an explicit retry and manual alternative", async ({
  page,
}) => {
  await page.route("**/api/auto-alignment/fixture-job", (route) =>
    route.fulfill({
      json: {
        id: "fixture-job",
        status: "running",
        phase: "extracting",
        progress: 3,
        result: null,
        error: null,
      },
    }),
  );
  await enterImages(page);
  await page.getByLabel("源视频 FPS", { exact: true }).fill("10");
  await page.getByRole("button", { name: "取消识别", exact: true }).click();
  await expect(page.getByLabel("自动动作对齐", { exact: true })).toContainText(
    "自动识别已取消",
  );
  await expect(
    page.getByRole("button", { name: "重新识别", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "应用手动对齐", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "手动对齐", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "应用手动对齐", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "手动对齐", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({
    path: ".local/screenshots/alignment-manual.png",
    animations: "disabled",
  });
});

test("changing trials retains media, verifies the new trial and restores each saved offset", async ({
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reads = 0;
  await page.route("**/api/auto-alignment/fixture-job", async (route) => {
    if (route.request().method() !== "GET") return route.fulfill({ json: {} });
    const current = ++reads;
    if (current === 2) await pending;
    const value = complete();
    value.result.offset = current === 1 ? 0.3 : 0.6;
    await route.fulfill({ json: value });
  });
  await enterImages(page);
  await page.getByLabel("源视频 FPS", { exact: true }).fill("10");
  await expect(page.getByAltText("原视频帧 3", { exact: true })).toBeVisible();
  await switchTrial(page, "trial-b");
  await expect(page.getByLabel("源视频 FPS", { exact: true })).toHaveValue(
    "10",
  );
  await expect(
    page.getByRole("button", { name: "取消识别", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".trial-media-notice")).toContainText("正在检查");
  await expect(page.locator(".media-readout")).toContainText("正在自动对齐");
  await expect(page.getByAltText("原视频帧 0", { exact: true })).toBeVisible();
  await page.screenshot({
    path: ".local/screenshots/trial-media-recheck.png",
    animations: "disabled",
  });
  release();
  await expect(page.getByAltText("原视频帧 6", { exact: true })).toBeVisible();
  await switchTrial(page, "demo");
  await expect(page.locator(".trial-media-notice")).toContainText(
    "已恢复当前试次",
  );
  await expect(page.getByAltText("原视频帧 3", { exact: true })).toBeVisible();
  await expect(page.locator(".media-readout")).toContainText(
    "时间偏移 0.3000 秒",
  );
  expect(
    await page.evaluate(() => (window as any).__automaticStarts.length),
  ).toBe(2);
  await switchTrial(page, "trial-b");
  await expect(page.getByAltText("原视频帧 6", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => (window as any).__automaticStarts.length),
  ).toBe(2);
});

test("a trial that cannot be matched keeps the imported media without inheriting another trial's alignment", async ({
  page,
}) => {
  let reads = 0;
  await page.route("**/api/auto-alignment/fixture-job", (route) => {
    if (route.request().method() !== "GET") return route.fulfill({ json: {} });
    return route.fulfill({
      json: complete(++reads === 1 ? "accepted" : "rejected"),
    });
  });
  await enterImages(page);
  await page.getByLabel("源视频 FPS", { exact: true }).fill("10");
  await expect(page.getByAltText("原视频帧 3", { exact: true })).toBeVisible();
  await switchTrial(page, "unmatched");
  await expect(page.locator(".trial-media-notice")).toContainText(
    "尚未通过此试次的动作匹配",
  );
  await expect(page.locator(".media-readout")).toContainText("尚未对齐");
  await expect(page.getByAltText("原视频帧 0", { exact: true })).toBeVisible();
  await switchTrial(page, "demo");
  await expect(page.getByAltText("原视频帧 3", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => (window as any).__automaticStarts.length),
  ).toBe(2);
});

test("a late match from a previous trial cannot apply or enter the new trial's cache", async ({
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
  await page.route("**/api/auto-alignment/new-trial", (route) => {
    const value = complete();
    value.result.offset = 0.6;
    return route.fulfill({ json: value });
  });
  await enterImages(page);
  await page.getByLabel("源视频 FPS", { exact: true }).fill("10");
  await expect(
    page.getByRole("button", { name: "取消识别", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    (window as any).__jobId = "new-trial";
  });
  await switchTrial(page, "trial-b");
  await expect(page.getByAltText("原视频帧 6", { exact: true })).toBeVisible();
  release();
  await expect(page.locator(".media-readout")).toContainText(
    "时间偏移 0.6000 秒",
  );
  await switchTrial(page, "demo");
  await expect
    .poll(() => page.evaluate(() => (window as any).__automaticStarts.length))
    .toBe(3);
});
