import type { Page } from "@playwright/test";

export async function openAlignmentSettings(page: Page, english = false) {
  const restore = page.getByRole("button", {
    name: english ? "Restore video size" : "还原视频",
    exact: true,
  });
  if (await restore.isVisible()) await restore.click();
  const more = page.locator(".media-alignment-more");
  if ((await more.getAttribute("open")) === null)
    await more.locator("summary").click();
  await page
    .getByRole("button", {
      name: english ? "Import result / time offset" : "导入结果 / 时间偏移",
      exact: true,
    })
    .click();
}
