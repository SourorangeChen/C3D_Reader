import { test, expect, type Page } from "@playwright/test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let folder: string, movie: string;
let identities: any[];
test.beforeAll(async ({ browser }) => {
  folder = await mkdtemp(path.join(tmpdir(), "c3d-training-"));
  movie = path.join(folder, "session.webm");
  const page = await browser.newPage();
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 180;
    canvas.height = 320;
    const ctx = canvas.getContext("2d")!;
    const stream = canvas.captureStream(10);
    const recorder = new MediaRecorder(stream, {
      mimeType: "video/webm;codecs=vp8",
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const done = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.start();
    for (let i = 0; i < 32; i++) {
      ctx.fillStyle = "#151719";
      ctx.fillRect(0, 0, 180, 320);
      ctx.fillStyle = "#72aef8";
      ctx.fillRect(50, 45 + i * 4, 50, 60);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    recorder.stop();
    await done;
    stream.getTracks().forEach((track) => track.stop());
    return [...new Uint8Array(await new Blob(chunks).arrayBuffer())];
  });
  await page.close();
  await writeFile(movie, Buffer.from(bytes));
});
test.afterAll(async () => {
  await rm(folder, { recursive: true, force: true });
});

test.beforeEach(async ({ page }) => {
  const demo = await (await page.request.get("/api/files/demo")).json();
  identities = ["WT04", "WT05", "Other"].map((name, i) => ({
    ...demo,
    id: `trial-${i}`,
    name: `${name}.c3d`,
    firstFrame: i * 100 + 1,
    lastFrame: i * 100 + demo.frameCount,
  }));
  await page.route("**/api/library", (route) =>
    route.fulfill({
      json: {
        folder: "/synthetic/trials",
        available: true,
        files: identities.map(({ id, name, size }) => ({ id, name, size })),
        demo: { id: "demo", name: "Synthetic walking", size: 1 },
      },
    }),
  );
  for (const meta of identities) {
    await page.route(`**/api/files/${meta.id}`, (route) =>
      route.fulfill({ json: meta }),
    );
    await page.route(`**/api/files/${meta.id}/**`, (route) =>
      route.continue({
        url: route
          .request()
          .url()
          .replace(`/api/files/${meta.id}/`, "/api/files/demo/"),
      }),
    );
  }
  await page.addInitScript(() => {
    (window as any).__starts = [];
    window.c3dDesktop = {
      platform: "macOS",
      openFile: async () => {},
      openFolder: async () => {},
      openDroppedFile: async () => {},
      onOpen: () => () => {},
      ready: async () => {},
      onSettings: () => () => {},
      setPreferences: async () => {},
      getPreferences: async () => ({
        theme: "light",
        language: "zh-CN",
        layout: { library: 230, inspector: 220, scene: 0.67 },
      }),
      startAutoAlignment: async (_files, options) => {
        (window as any).__starts.push(options);
        return {
          id: `group-${(window as any).__starts.length}`,
          status: "running",
          phase: "extracting",
          progress: 3,
          result: null,
          error: null,
        };
      },
    };
  });
});
function completed(lag = 0.2, referenceIndex = 0) {
  return {
    id: "group-1",
    status: "complete",
    phase: "complete",
    progress: 100,
    error: null,
    result: {
      status: "accepted",
      reason: "reference_lag_found",
      referenceTrial: identities[referenceIndex],
      referenceResult: { status: "accepted", offset: referenceIndex + lag },
      lag,
      candidates: [],
      trials: identities.map((acquisition, i) => ({
        acquisition,
        status: i === referenceIndex ? "accepted" : "shared",
        reason:
          i === referenceIndex
            ? "reference_match_found"
            : "shared_from_reference",
        baseline: i,
        lag,
        offset: i + lag,
        correlation: i === referenceIndex ? 0.96 : null,
      })),
    },
  };
}
async function importVideo(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "WT04.c3d", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "视频同步", exact: true }).click();
  await page.getByLabel("导入视频", { exact: true }).setInputFiles(movie);
}

test("one reference trial determines lag and every other trial shares it without a new match", async ({
  page,
}) => {
  let complete = false,
    cancelled = 0;
  await page.route("**/api/auto-alignment/group-1", (route) => {
    if (route.request().method() === "DELETE") cancelled++;
    return route.fulfill({
      json: complete
        ? completed()
        : {
            id: "group-1",
            status: "running",
            phase: "matching",
            progress: 48,
            result: null,
            error: null,
          },
    });
  });
  await importVideo(page);
  await expect(
    page.getByLabel("单 trial 确定 lag", { exact: true }),
  ).toContainText("48%");
  const options = await page.evaluate(() => (window as any).__starts);
  expect(options).toHaveLength(1);
  expect(options[0].acquisitionIds).toEqual(identities.map((meta) => meta.id));
  expect(options[0]).not.toHaveProperty("lag");
  const url = await page.locator("video").getAttribute("src");
  await page.locator(".file-row").filter({ hasText: "WT05.c3d" }).click();
  await expect(
    page.getByRole("heading", { name: "WT05.c3d", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("单 trial 确定 lag", { exact: true }),
  ).toContainText("48%");
  expect(cancelled).toBe(0);
  complete = true;
  const status = page.getByLabel("单 trial 确定 lag", { exact: true });
  await expect(status).toContainText(
    "共同 lag 0.2000 秒；已供其他 2 个 trial 共享。",
  );
  await expect(page.locator(".media-readout")).toContainText(
    "共同 lag 0.2000 秒",
  );
  await expect(page.locator("video")).toHaveAttribute("src", url!);
  await expect
    .poll(() =>
      page.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime),
    )
    .toBeCloseTo(1.2, 2);
  await status.getByText("lag 共享范围", { exact: true }).click();
  await expect(status.getByRole("listitem")).toHaveCount(3);
  await status.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".local/screenshots/reference-lag-sharing.png",
    animations: "disabled",
  });
  await page.locator(".file-row").filter({ hasText: "Other.c3d" }).click();
  await expect(page.locator(".media-readout")).toContainText(
    "共享 lag · 待复核",
  );
  await expect(page.locator(".media-readout")).toContainText(
    "共同 lag 0.2000 秒",
  );
  await expect(page.locator("video")).toHaveAttribute("src", url!);
  await expect(page.locator(".trial-media-notice")).toContainText(
    "当前 trial 共享参考 trial 的 lag，未单独进行动作匹配。",
  );
  await page.screenshot({
    path: ".local/screenshots/reference-lag-other-trial.png",
    animations: "disabled",
  });
  await page.locator(".file-row").filter({ hasText: "WT04.c3d" }).click();
  await expect(page.locator(".media-readout")).toContainText(
    "共同 lag 0.2000 秒",
  );
  expect(await page.evaluate(() => (window as any).__starts.length)).toBe(1);
  await page.getByRole("button", { name: "关闭视频面板", exact: true }).click();
  await page.getByRole("button", { name: "视频同步", exact: true }).click();
  await expect(page.locator(".media-readout")).toContainText(
    "共同 lag 0.2000 秒",
  );
  expect(await page.evaluate(() => (window as any).__starts.length)).toBe(1);
  // Reimport after a cached trial remount must still start an entirely new group.
  await page.route("**/api/auto-alignment/group-2", (route) =>
    route.fulfill({ json: completed(0.4) }),
  );
  await page.getByLabel("导入视频", { exact: true }).setInputFiles(movie);
  await expect(
    page.getByLabel("单 trial 确定 lag", { exact: true }),
  ).toContainText("共同 lag 0.4000 秒");
  expect(await page.evaluate(() => (window as any).__starts.length)).toBe(2);
});

test("replacing a video starts a new group and late old results never overwrite it", async ({
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let cancelled = 0;
  await page.route("**/api/auto-alignment/group-1", async (route) => {
    if (route.request().method() === "DELETE") cancelled++;
    else await pending;
    await route.fulfill({ json: completed(1) }).catch(() => {});
  });
  await page.route("**/api/auto-alignment/group-2", (route) =>
    route.fulfill({ json: completed(0.4) }),
  );
  await importVideo(page);
  await expect(
    page.getByRole("button", { name: "取消对齐", exact: true }),
  ).toBeVisible();
  await page.getByLabel("导入视频", { exact: true }).setInputFiles(movie);
  await expect(
    page.getByLabel("单 trial 确定 lag", { exact: true }),
  ).toContainText("共同 lag 0.4000 秒");
  release();
  await page.locator(".file-row").filter({ hasText: "WT05.c3d" }).click();
  await expect(page.locator(".media-readout")).toContainText(
    "共同 lag 0.4000 秒",
  );
  expect(await page.evaluate(() => (window as any).__starts.length)).toBe(2);
  expect(cancelled).toBeGreaterThanOrEqual(1);
});

test("manual mode cancels the group and is not overwritten by late results", async ({
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/auto-alignment/group-1", async (route) => {
    if (route.request().method() === "GET") await pending;
    await route.fulfill({ json: completed() }).catch(() => {});
  });
  await importVideo(page);
  await expect(
    page.getByRole("button", { name: "取消对齐", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "手动对齐", exact: true }).click();
  await page.getByRole("button", { name: "应用手动对齐", exact: true }).click();
  release();
  await expect(page.locator(".media-readout")).toContainText(
    "时间偏移 0.0000 秒",
  );
  await page.locator(".file-row").filter({ hasText: "WT05.c3d" }).click();
  await expect(page.locator(".media-readout")).toContainText("尚未对齐");
  expect(await page.evaluate(() => (window as any).__starts.length)).toBe(1);
});

test("retry uses the newly selected trial and replaces the lag for everyone", async ({
  page,
}) => {
  await page.route("**/api/auto-alignment/group-1", (route) =>
    route.fulfill({ json: completed() }),
  );
  await page.route("**/api/auto-alignment/group-2", (route) =>
    route.fulfill({ json: completed(0.6, 1) }),
  );
  await importVideo(page);
  await expect(page.locator(".media-readout")).toContainText(
    "共同 lag 0.2000 秒",
  );
  await page.locator(".file-row").filter({ hasText: "WT05.c3d" }).click();
  await expect(
    page.getByRole("heading", { name: "WT05.c3d", exact: true }),
  ).toBeVisible();
  await page.getByLabel("区间起始帧", { exact: true }).fill("201");
  await page.getByLabel("区间结束帧", { exact: true }).fill("600");
  await page
    .getByRole("button", { name: "以当前 trial 重新确定 lag", exact: true })
    .click();
  await expect(
    page.getByLabel("单 trial 确定 lag", { exact: true }),
  ).toContainText("参考 trial：WT05.c3d");
  await expect(page.locator(".media-readout")).toContainText(
    "共同 lag 0.6000 秒",
  );
  const starts = await page.evaluate(() => (window as any).__starts);
  expect(starts).toHaveLength(2);
  expect(starts[1].acquisitionId).toBe("trial-1");
  expect(starts[1].start).toBe(100);
  expect(starts[1].stop).toBe(500);
  await page.locator(".file-row").filter({ hasText: "WT04.c3d" }).click();
  await expect(page.locator(".media-readout")).toContainText(
    "共享 lag · 待复核",
  );
  await expect(page.locator(".media-readout")).toContainText(
    "共同 lag 0.6000 秒",
  );
  expect(await page.evaluate(() => (window as any).__starts.length)).toBe(2);
});

test("an ambiguous reference leaves all other trials unshared without trying them", async ({
  page,
}) => {
  const failed = completed();
  failed.result.status = "rejected";
  failed.result.lag = null as any;
  failed.result.reason = "reference_not_matched";
  failed.result.trials.forEach((trial) => {
    trial.status = "rejected";
    trial.reason = "reference_not_matched";
    trial.offset = null as any;
  });
  await page.route("**/api/auto-alignment/group-1", (route) =>
    route.fulfill({ json: failed }),
  );
  await importVideo(page);
  await expect(page.locator(".trial-media-notice")).toContainText(
    "参考 trial 未能可靠确定 lag，请更换 trial 重试。",
  );
  await page.locator(".file-row").filter({ hasText: "Other.c3d" }).click();
  await expect(page.locator(".media-readout")).toContainText("尚未对齐");
  await expect(page.locator(".trial-media-notice")).toContainText(
    "参考 trial 未能可靠确定 lag",
  );
  await expect(page.locator(".trial-media-notice")).not.toContainText(
    "不是同一次训练",
  );
  expect(await page.evaluate(() => (window as any).__starts.length)).toBe(1);
});
