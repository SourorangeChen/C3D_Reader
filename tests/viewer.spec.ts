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
  await expect(page.getByRole("alert")).toContainText("does not exist");
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
