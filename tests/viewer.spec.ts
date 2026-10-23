import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Synthetic walking" }),
  ).toBeVisible();
  await expect(page.locator(".signal-plot path").nth(1)).toBeVisible();
});

test("play, pause, frame stepping and loop inside one block", async ({
  page,
}) => {
  const frame = page.getByRole("spinbutton", { name: "当前帧", exact: true });
  await page.getByRole("button", { name: "下一帧", exact: true }).click();
  await expect(frame).toHaveValue("2");
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await expect
    .poll(async () => Number(await frame.inputValue()))
    .toBeGreaterThan(5);
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  const paused = await frame.inputValue();
  await expect(frame).toHaveValue(paused);
  await page.getByRole("spinbutton", { name: "区间结束帧" }).fill("8");
  await page.getByRole("button", { name: "跳至区间开头" }).click();
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "暂停", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => Number(await frame.inputValue()))
    .toBeLessThanOrEqual(8);
  await page.getByRole("button", { name: "暂停", exact: true }).click();
});

test("analog selection, original sample-rate CSV and parameters", async ({
  page,
}) => {
  await page.getByRole("tab", { name: "模拟4", exact: true }).click();
  await page
    .getByRole("button", { name: "Left force Fz N", exact: true })
    .click();
  await expect(page.locator(".signal-heading")).toContainText("Left force Fz");
  await expect(page.locator(".signal-heading")).toContainText("1000 Hz");
  await page.getByRole("button", { name: "导出 CSV", exact: true }).click();
  await page.getByLabel("导出内容", { exact: true }).selectOption("selected");
  await expect(page.getByRole("dialog")).toContainText("8,000");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "下载 CSV" }).click();
  expect((await download).suggestedFilename()).toBe("c3d-analog-export.csv");
  await page.getByRole("tab", { name: "参数", exact: true }).click();
  await page
    .locator("summary")
    .filter({ hasText: /^POINT/ })
    .click();
  await expect(
    page
      .locator(".parameters details[open]")
      .getByText("LABELS", { exact: true }),
  ).toBeVisible();
});

test("event navigation and marker missing data", async ({ page }) => {
  await page.getByRole("tab", { name: "事件", exact: true }).click();
  await page.locator(".event-row").first().click();
  await expect(
    page.getByRole("spinbutton", { name: "当前帧", exact: true }),
  ).toHaveValue("57");
  await page.getByRole("tab", { name: "信息", exact: true }).click();
  await page.getByRole("textbox", { name: "搜索通道" }).fill("LELB");
  await page.getByRole("button", { name: "LELB", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "当前帧", exact: true })
    .fill("300");
  await expect(page.locator(".coordinate-values")).toContainText("当前帧缺失");
});

test("invalid folder shows a recoverable error", async ({ page }) => {
  await page.getByRole("button", { name: "打开文件夹", exact: true }).click();
  await page
    .getByRole("textbox", { name: "文件夹路径" })
    .fill("/this-folder-does-not-exist-c3d-reader");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "打开文件夹", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("文件夹不存在");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Synthetic walking" }),
  ).toBeVisible();
});

for (const [width, height] of [
  [1440, 900],
  [1280, 720],
  [768, 1024],
  [390, 844],
]) {
  test(`layout ${width} × ${height} has no horizontal overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Synthetic walking" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (width >= 768) {
      const timeline = await page.locator(".timeline-panel").boundingBox();
      expect(timeline!.y + timeline!.height).toBeLessThanOrEqual(height - 26);
    }
    await page.screenshot({
      path: `.local/screenshots/demo-${width}.png`,
      fullPage: true,
    });
  });
}

test("settings switch themes and language immediately, persist, and follow the system", async ({
  page,
}) => {
  const issues: string[] = [];
  const sceneBrightness = () =>
    page.locator(".viewer-shell canvas").evaluate((canvas) => {
      const gl = (canvas as HTMLCanvasElement).getContext("webgl2")!;
      const color = gl.getParameter(gl.COLOR_CLEAR_VALUE) as Float32Array;
      return (color[0] + color[1] + color[2]) / 3;
    });
  page.on("pageerror", (error) => issues.push(error.message));
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByLabel("主题", { exact: true }).selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  // WebGL must adopt the same theme without waiting for another UI change.
  await expect.poll(sceneBrightness).toBeGreaterThan(0.9);
  await page.getByLabel("界面语言").selectOption("en");
  await expect(
    page.getByRole("dialog", { name: "Settings", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Theme", exact: true }),
  ).toHaveValue("light");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Next frame", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next frame", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", { name: "Current frame", exact: true }),
  ).toHaveValue("2");
  await page.screenshot({
    path: ".local/screenshots/light-en.png",
    fullPage: true,
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Theme", { exact: true }).selectOption("system");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(sceneBrightness).toBeLessThan(0.2);
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect.poll(sceneBrightness).toBeGreaterThan(0.9);
  // Focus remains inside the settings window and Escape restores the trigger.
  await page.getByRole("button", { name: "Done", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Close dialog", exact: true }),
  ).toBeFocused();
  await page.screenshot({ path: ".local/screenshots/settings-light-en.png" });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Settings", exact: true }),
  ).toBeFocused();
  expect(issues).toEqual([]);
});

test("drag and keyboard resize panels, persist sizes and reset the layout", async ({
  page,
}) => {
  const library = page.getByRole("separator", { name: "调整文件面板宽度" });
  const scene = page.getByRole("separator", { name: "调整三维与曲线区域" });
  const inspector = page.getByRole("separator", { name: "调整信息面板宽度" });
  const sceneBefore = await page.locator(".scene-panel").boundingBox();
  const initial = await page.locator(".explorer").boundingBox();
  const box = (await library.boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + 180);
  await page.mouse.down();
  await page.mouse.move(box.x + 69, box.y + 180, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => (await page.locator(".explorer").boundingBox())!.width)
    .toBeCloseTo(initial!.width + 65, 0);
  await inspector.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(inspector).toHaveAttribute("aria-valuenow", "230");
  await page
    .getByRole("spinbutton", { name: "当前帧", exact: true })
    .fill("100");
  await inspector.focus();
  await page.keyboard.press("End");
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("spinbutton", { name: "当前帧", exact: true }),
  ).toHaveValue("100");
  await scene.focus();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect
    .poll(
      async () => (await page.locator(".scene-panel").boundingBox())!.height,
    )
    .toBeLessThan(sceneBefore!.height - 10);
  const sceneBox = (await scene.boundingBox())!;
  await page.mouse.move(sceneBox.x + 100, sceneBox.y + 4);
  await page.mouse.down();
  await page.mouse.move(sceneBox.x + 100, sceneBox.y - 25, { steps: 5 });
  // A cancelled gesture must release state and permit the next drag.
  await scene.dispatchEvent("pointercancel", { pointerId: 1 });
  await page.mouse.up();
  await expect(scene).not.toHaveClass(/resizing/);
  await page.reload();
  await expect(library).toHaveAttribute("aria-valuenow", "295");
  await expect(inspector).toHaveAttribute("aria-valuenow", "220");
  await library.dblclick({ position: { x: 4, y: 160 } });
  await expect(library).toHaveAttribute("aria-valuenow", "230");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "恢复默认布局" }).click();
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await expect(inspector).toHaveAttribute("aria-valuenow", "220");
  await expect(scene).toHaveAttribute("aria-valuenow", "0.67");
});

test("folder export includes files hidden by search and downloads a ZIP", async ({
  page,
}) => {
  const { execFileSync } = await import("node:child_process");
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const folder = await mkdtemp(path.join(tmpdir(), "c3d-batch-browser-"));
  try {
    execFileSync(process.env.CI ? "python3" : ".venv/bin/python", [
      "-c",
      "from backend.demo import create_demo; import sys; from pathlib import Path; p=Path(sys.argv[1]); create_demo(p/'合成 walking.C3D'); create_demo(p/'second.c3d')",
      folder,
    ]);
    await page.getByRole("button", { name: "打开文件夹", exact: true }).click();
    await page.getByLabel("文件夹路径").fill(folder);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "打开文件夹", exact: true })
      .click();
    await expect(page.locator(".file-row")).toHaveCount(2);
    await page
      .getByRole("textbox", { name: "搜索文件", exact: true })
      .fill("second");
    await expect(page.locator(".file-row")).toHaveCount(1);
    await page
      .getByRole("button", { name: "批量导出 CSV", exact: true })
      .click();
    await page.getByRole("button", { name: "开始导出", exact: true }).click();
    // Closing a progress window does not destroy the background job.
    await page.getByRole("button", { name: "关闭窗口", exact: true }).click();
    await page
      .getByRole("button", { name: "批量导出 CSV", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("成功 2，失败 0");
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "下载 ZIP" }).click();
    const result = await download;
    expect(result.suggestedFilename()).toBe("c3d-folder-csv.zip");
    expect(await result.failure()).toBeNull();
    await page.screenshot({ path: ".local/screenshots/batch-export.png" });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("English narrow layouts keep drawers and settings accessible", async ({
  page,
}) => {
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByLabel("界面语言").selectOption("en");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  for (const width of [1280, 768, 390]) {
    await page.setViewportSize({ width, height: width === 1280 ? 720 : 900 });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Synthetic walking" }),
    ).toBeVisible();
    if (!(await page.locator(".explorer").isVisible()))
      await page
        .getByRole("button", { name: "Files and channels", exact: true })
        .click();
    await expect(
      page.getByRole("complementary", { name: "Files and channels" }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page
      .getByRole("button", { name: "Files and channels", exact: true })
      .click();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByLabel("Theme", { exact: true })).toBeVisible();
    await page.getByLabel("Theme", { exact: true }).selectOption("light");
    await page.screenshot({
      path: `.local/screenshots/settings-en-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Done", exact: true }).click();
  }
});

test("CSV defaults to all points and full recording, with optional ROI and selected channel", async ({
  page,
}) => {
  await page.getByRole("spinbutton", { name: "区间结束帧" }).fill("8");
  await page.getByRole("textbox", { name: "搜索通道" }).fill("LANK");
  await page.getByRole("button", { name: "导出 CSV", exact: true }).click();
  await expect(page.getByLabel("导出内容", { exact: true })).toHaveValue(
    "all-points",
  );
  await expect(page.getByLabel("导出区间", { exact: true })).toHaveValue(
    "full",
  );
  await expect(page.getByRole("dialog")).toContainText(
    "未识别到文件自带的 COM",
  );
  const [all] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "下载 CSV", exact: true }).click(),
  ]);
  const { readFile } = await import("node:fs/promises");
  const full = await readFile((await all.path())!, "utf8");
  const rows = full.trim().split(/\r?\n/);
  expect(all.suggestedFilename()).toBe("c3d-all-points.csv");
  expect(rows).toHaveLength(801);
  expect(rows[0].split(",")).toHaveLength(2 + 35 * 4);
  expect(rows[0]).toContain("LFHD:X (mm)");
  expect(rows[0]).toContain("RTOE:Z (mm)");
  await page.getByRole("button", { name: "导出 CSV", exact: true }).click();
  await page.getByLabel("导出区间", { exact: true }).selectOption("roi");
  const [roi] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "下载 CSV", exact: true }).click(),
  ]);
  expect(
    (await readFile((await roi.path())!, "utf8")).trim().split(/\r?\n/),
  ).toHaveLength(9);
});

test("source COM and floor projection are visible and exportable, including English and narrow layout", async ({
  page,
}) => {
  const { execFileSync } = await import("node:child_process");
  const { mkdtemp, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const folder = await mkdtemp(path.join(tmpdir(), "c3d-com-browser-"));
  try {
    execFileSync(process.env.CI ? "python3" : ".venv/bin/python", [
      "-c",
      "from backend.demo import create_demo; import sys; from pathlib import Path; create_demo(Path(sys.argv[1])/'synthetic-com.c3d', include_com=True)",
      folder,
    ]);
    await page.getByRole("button", { name: "打开文件夹", exact: true }).click();
    await page.getByLabel("文件夹路径").fill(folder);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "打开文件夹", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "synthetic-com.c3d" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "导出 CSV", exact: true }).click();
    await expect(page.locator(".com-summary")).toContainText(
      "三维质心: Demo:CentreOfMass",
    );
    await expect(page.locator(".com-summary")).toContainText(
      "质心地面投影: Demo:CentreOfMassFloor",
    );
    await page.getByLabel("导出内容", { exact: true }).selectOption("com");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "下载 CSV", exact: true }).click(),
    ]);
    const rows = (await readFile((await download.path())!, "utf8"))
      .trim()
      .split(/\r?\n/);
    expect(download.suggestedFilename()).toBe("c3d-com.csv");
    expect(rows).toHaveLength(801);
    expect(rows[0].split(",")).toHaveLength(10);
    expect(rows[0]).toContain("Demo:CentreOfMass:Z (mm)");
    expect(rows[0]).toContain("Demo:CentreOfMassFloor:Z (mm)");
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await page.getByLabel("界面语言").selectOption("en");
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.getByRole("button", { name: "Export CSV", exact: true }).click();
    await expect(
      page.getByLabel("Export contents", { exact: true }),
    ).toHaveValue("all-points");
    await expect(page.locator(".com-summary")).toContainText(
      "3D center of mass",
    );
    await page.screenshot({ path: ".local/screenshots/export-com-en.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: ".local/screenshots/export-com-en-mobile.png",
    });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("batch export reconnects, shows frame progress and recovers a lost task", async ({
  page,
}) => {
  const library = await (await page.request.get("/api/library")).json();
  await page.route("**/api/library", (route) =>
    route.fulfill({
      json: {
        ...library,
        folder: "/synthetic",
        files: [{ id: "demo", name: "synthetic.c3d", size: 1024 }],
      },
    }),
  );
  const job = {
    id: "synthetic-progress-task",
    folderName: "Synthetic recordings",
    status: "running",
    total: 2,
    completed: 0,
    succeeded: 0,
    failed: 0,
    current: "synthetic.c3d",
    errors: [],
    stage: "point",
    processed: 256,
    stageTotal: 800,
    elapsedSeconds: 3,
    errorCode: null,
  };
  let missing = false;
  let offline = false;
  await page.route("**/api/library/exports", (route) =>
    route.fulfill({ json: job }),
  );
  await page.route("**/api/library/exports/synthetic-progress-*", (route) => {
    if (offline) return route.abort();
    return missing
      ? route.fulfill({ status: 404, json: { detail: "Export not found" } })
      : route.fulfill({ json: job });
  });
  await page.reload();
  await page.getByRole("button", { name: "批量导出 CSV", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("256 / 800 帧");
  await expect(
    page.getByRole("button", { name: "取消导出", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "取消导出", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "正在取消…", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "关闭窗口", exact: true }).click();
  job.id = "synthetic-progress-next";
  await page.getByRole("button", { name: "批量导出 CSV", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "取消导出", exact: true }),
  ).toBeEnabled();
  job.processed = 512;
  await expect(page.getByRole("dialog")).toContainText("512 / 800 帧");
  job.stage = "analog";
  job.processed = 128;
  await expect(page.getByRole("dialog")).toContainText("正在转换全部模拟通道");
  await page.screenshot({ path: ".local/screenshots/batch-progress-zh.png" });
  await page.getByRole("button", { name: "关闭窗口", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "批量导出 CSV", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("128 / 800 帧");
  job.stage = "zip";
  job.processed = 400;
  await expect(page.getByRole("dialog")).toContainText("正在压缩 ZIP");
  await expect(page.getByRole("dialog")).toContainText("50%");
  await page.getByRole("button", { name: "关闭窗口", exact: true }).click();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByLabel("界面语言").selectOption("en");
  await page.getByLabel("Theme", { exact: true }).selectOption("light");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", { name: "Export folder CSV", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("dialog")).toContainText("Compressing ZIP");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".local/screenshots/batch-progress-en-mobile.png",
  });
  offline = true;
  await expect(page.getByRole("alert")).toContainText("Retrying");
  offline = false;
  await expect(page.getByRole("alert")).toHaveCount(0, { timeout: 5000 });
  missing = true;
  await expect(page.getByRole("alert")).toContainText("no longer available");
  await expect(
    page.getByRole("button", { name: "Start export", exact: true }),
  ).toBeEnabled();
});

test("a lost batch-start response reconnects to the worker that was created", async ({
  page,
}) => {
  const library = await (await page.request.get("/api/library")).json();
  await page.route("**/api/library", (route) =>
    route.fulfill({
      json: {
        ...library,
        folder: "/synthetic",
        files: [{ id: "demo", name: "synthetic.c3d", size: 1024 }],
      },
    }),
  );
  const job = {
    id: "synthetic-lost-response",
    folderName: "Synthetic recordings",
    status: "running",
    total: 1,
    completed: 0,
    succeeded: 0,
    failed: 0,
    current: "synthetic.c3d",
    errors: [],
    stage: "point",
    processed: 256,
    stageTotal: 800,
    elapsedSeconds: 3,
    errorCode: null,
  };
  let started = false;
  await page.route("**/api/library/exports", (route) => {
    if (route.request().method() === "POST") {
      started = true;
      return route.abort("timedout");
    }
    return route.fulfill({ json: started ? job : null });
  });
  await page.route("**/api/library/exports/synthetic-lost-response", (route) =>
    route.fulfill({ json: job }),
  );
  await page.reload();
  await page.getByRole("button", { name: "批量导出 CSV", exact: true }).click();
  await page.getByRole("button", { name: "开始导出", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("256 / 800 帧");
  await expect(
    page.getByRole("button", { name: "取消导出", exact: true }),
  ).toBeEnabled();
});
