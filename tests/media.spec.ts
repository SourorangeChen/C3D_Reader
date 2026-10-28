import { test, expect, type Page } from "@playwright/test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let folder: string, videoFile: string;
let pictures: { name: string; mimeType: string; buffer: Buffer }[];
test.beforeAll(async ({ browser }) => {
  folder = await mkdtemp(path.join(tmpdir(), "c3d-media-"));
  videoFile = path.join(folder, "synthetic-clock.webm");
  const capture = await browser.newPage();
  const fixture = await capture.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext("2d")!;
    const stream = canvas.captureStream(25);
    const recorder = new MediaRecorder(stream, {
      mimeType: "video/webm;codecs=vp8",
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const finished = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.start();
    for (let i = 0; i < 75; i++) {
      ctx.fillStyle = "#111113";
      ctx.fillRect(0, 0, 320, 180);
      ctx.fillStyle = "#72aef8";
      ctx.fillRect(10 + i * 3, 60, 30, 60);
      ctx.font = "20px sans-serif";
      ctx.fillStyle = "white";
      ctx.fillText(`Synthetic ${i}`, 20, 30);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    recorder.stop();
    await finished;
    stream.getTracks().forEach((track) => track.stop());
    const image = canvas.toDataURL("image/png").split(",")[1];
    return {
      bytes: [...new Uint8Array(await new Blob(chunks).arrayBuffer())],
      image,
    };
  });
  await capture.close();
  await writeFile(videoFile, Buffer.from(fixture.bytes));
  pictures = [5, 0, 2].map((i) => ({
    name: `frame_${String(i).padStart(6, "0")}.png`,
    mimeType: "image/png",
    buffer: Buffer.from(fixture.image, "base64"),
  }));
});
test.afterAll(async () => {
  if (folder) await rm(folder, { recursive: true, force: true });
});
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Synthetic walking", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "视频同步", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "视频与图片同步" }),
  ).toBeVisible();
});
async function loadVideo(page: Page) {
  await page.getByLabel("导入视频", { exact: true }).setInputFiles(videoFile);
  await expect(
    page.getByRole("button", { name: "时间对齐", exact: true }),
  ).toBeEnabled();
}

test("video anchors, seeks and drives Vicon playback from its own media clock", async ({
  page,
}) => {
  await loadVideo(page);
  const frame = page.getByRole("spinbutton", { name: "当前帧", exact: true });
  const video = page.getByLabel("参考视频", { exact: true });
  await frame.fill("51");
  await page.getByLabel("预览视频时间（秒）").fill("1.25");
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeCloseTo(1.25, 2);
  await page
    .getByRole("button", { name: "将当前画面对齐到此 C3D 帧", exact: true })
    .click();
  await frame.fill("101");
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeCloseTo(1.75, 2);
  await page.getByLabel("播放速度", { exact: true }).selectOption("0.5");
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await expect
    .poll(async () => Number(await frame.inputValue()))
    .toBeGreaterThan(105);
  expect(await video.evaluate((v: HTMLVideoElement) => v.playbackRate)).toBe(
    0.5,
  );
  // Freeze one presented picture before checking React's committed cursor.
  // Reading on a later animation frame can otherwise compare two pictures.
  const presentedTime = await video.evaluate(
    (v: HTMLVideoElement) =>
      new Promise<number>((resolve) => {
        v.requestVideoFrameCallback((_now, metadata) => {
          v.pause();
          resolve(metadata.mediaTime);
        });
      }),
  );
  await expect
    .poll(async () =>
      Math.abs(
        (Number(await frame.inputValue()) - 1) / 100 - (presentedTime - 0.75),
      ),
    )
    .toBeLessThanOrEqual(0.005001);
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(true);
  await page.getByRole("spinbutton", { name: "区间起始帧" }).fill("11");
  await page.getByRole("spinbutton", { name: "区间结束帧" }).fill("31");
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await page.waitForTimeout(750);
  expect(Number(await frame.inputValue())).toBeGreaterThanOrEqual(11);
  expect(Number(await frame.inputValue())).toBeLessThanOrEqual(31);
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await page.getByRole("button", { name: "循环", exact: true }).click();
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "播放", exact: true }),
  ).toBeVisible();
  await expect(frame).toHaveValue("31");
  await page.screenshot({
    path: ".local/screenshots/video-sync.png",
    fullPage: true,
  });
});

test("numbered images retain source gaps and can use explicit PTS instead of FPS", async ({
  page,
}) => {
  await page
    .getByLabel("导入图片序列", { exact: true })
    .setInputFiles(pictures);
  await expect(
    page.getByRole("button", {
      name: "将当前画面对齐到此 C3D 帧",
      exact: true,
    }),
  ).toBeDisabled();
  await page.getByLabel("源视频 FPS", { exact: true }).fill("10");
  await page
    .getByRole("button", { name: "将当前画面对齐到此 C3D 帧", exact: true })
    .click();
  const frame = page.getByRole("spinbutton", { name: "当前帧", exact: true });
  await frame.fill("11");
  await expect(
    page.getByText("该时刻没有对应图片，保留采样缺口", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".media-stage img")).toHaveCount(0);
  await frame.fill("21");
  await expect(page.getByAltText("原视频帧 2", { exact: true })).toBeVisible();
  await frame.fill("61");
  await expect(
    page.getByText("当前 C3D 帧超出素材时间范围", { exact: true }),
  ).toBeVisible();
  await frame.fill("1");
  await page.getByLabel("导入 PTS 表", { exact: true }).setInputFiles({
    name: "pts.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("frame,video_pts_s\n0,0\n2,0.28\n5,0.95"),
  });
  await expect(page.getByLabel("源视频 FPS", { exact: true })).toBeDisabled();
  await page
    .getByRole("button", { name: "将当前画面对齐到此 C3D 帧", exact: true })
    .click();
  await frame.fill("29");
  await expect(page.getByAltText("原视频帧 2", { exact: true })).toBeVisible();
  await frame.fill("1");
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await expect
    .poll(async () => Number(await frame.inputValue()))
    .toBeGreaterThan(20);
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  const paused = await frame.inputValue();
  await page.waitForTimeout(120);
  await expect(frame).toHaveValue(paused);
});

test("COM trial import uses the shared lag and exports a reusable timing profile", async ({
  page,
}) => {
  await loadVideo(page);
  await page.getByRole("button", { name: "时间对齐", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "时间对齐", exact: true });
  await dialog.getByLabel("选择对齐 JSON", { exact: true }).setInputFiles({
    name: "alignment.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        overall_lag_s: 0.4,
        trials: [
          {
            trial: "A",
            timestamp_only_start_s: -0.5,
            residual_correction_s: 9,
          },
          { trial: "B", timestamp_only_start_s: 0.3, residual_correction_s: 8 },
        ],
      }),
    ),
  });
  await expect(
    dialog.getByRole("button", { name: "应用所选试次", exact: true }),
  ).toBeDisabled();
  await dialog.getByLabel("COM 试次", { exact: true }).selectOption("1");
  await dialog
    .getByRole("button", { name: "应用所选试次", exact: true })
    .click();
  await expect
    .poll(() =>
      page.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime),
    )
    .toBeCloseTo(0.7, 2);
  await page.getByRole("button", { name: "时间对齐", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "保存当前对齐", exact: true }).click();
  const saved = JSON.parse(
    await readFile((await (await download).path())!, "utf8"),
  );
  expect(saved.overall_lag_s).toBe(0.4);
  expect(saved.baseline).toBe(0.3);
  expect(saved.source).toBe("COM");
  await dialog.getByLabel("选择对齐 JSON", { exact: true }).setInputFiles({
    name: "saved.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect(dialog.getByLabel("统一偏移（秒）")).toHaveValue("0.4");
  await dialog.getByLabel("选择对齐 JSON", { exact: true }).setInputFiles({
    name: "wrong-media.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        ...saved,
        media: { ...saved.media, size: saved.media.size + 1 },
      }),
    ),
  });
  await expect(dialog.getByRole("alert")).toContainText(
    "对齐文件与当前素材不匹配",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("signal search applies a known offset using source samples and explicit channel selection", async ({
  page,
  request,
}) => {
  await loadVideo(page);
  await page.getByRole("spinbutton", { name: "区间起始帧" }).fill("21");
  await page.getByRole("spinbutton", { name: "区间结束帧" }).fill("200");
  const response = await request.get(
    "/api/files/demo/series?kind=point&ids=26&limit=10000",
  );
  const series = (await response.json()).series[2];
  const csv =
    "video_pts_s,value\n" +
    series.times
      .map(
        (time: number, i: number) => `${time + 0.12},${series.values[i] ?? ""}`,
      )
      .join("\n");
  await page.getByRole("button", { name: "时间对齐", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .locator("summary")
    .filter({ hasText: "从已有视频信号估计偏移" })
    .click();
  await dialog.getByLabel("导入视频信号 CSV", { exact: true }).setInputFiles({
    name: "synthetic-signal.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await dialog
    .getByLabel("Vicon 对齐通道", { exact: true })
    .selectOption("point:26");
  await dialog.getByLabel("搜索下限（秒）", { exact: true }).fill("-0.3");
  await dialog.getByLabel("搜索上限（秒）", { exact: true }).fill("0.3");
  await dialog
    .getByRole("button", { name: "估计时间偏移", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("0.1200");
  await expect(
    dialog.getByRole("button", { name: "应用候选偏移", exact: true }),
  ).toBeEnabled();
  await dialog
    .getByRole("button", { name: "应用候选偏移", exact: true })
    .click();
  await expect
    .poll(() =>
      page.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime),
    )
    .toBeCloseTo(0.32, 2);
});

test("English narrow media layout and alignment dialog stay accessible", async ({
  page,
}) => {
  await page
    .getByLabel("导入图片序列", { exact: true })
    .setInputFiles(pictures);
  await page.getByLabel("源视频 FPS", { exact: true }).fill("10");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByLabel("界面语言").selectOption("en");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Time alignment", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Time alignment",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByLabel("Timestamp baseline (s)", { exact: true }),
  ).toBeVisible();
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: ".local/screenshots/media-sync-narrow.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
