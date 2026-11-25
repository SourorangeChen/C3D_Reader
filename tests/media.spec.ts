import { resolvePython } from "./python-runtime";
import { openAlignmentSettings } from "./media-helpers";
import { test, expect, type Page } from "@playwright/test";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

let folder: string, videoFile: string, vfrFile: string;
let pictures: { name: string; mimeType: string; buffer: Buffer }[];
test.beforeAll(async ({ browser }) => {
  folder = await mkdtemp(path.join(tmpdir(), "c3d-media-"));
  videoFile = path.join(folder, "synthetic-clock.webm");
  const capture = await browser.newPage();
  const fixture = await capture.evaluate(async () => {
    const canvas = document.createElement("canvas");
    // Portrait video reproduces the small subject in the reported layout.
    canvas.width = 180;
    canvas.height = 320;
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
      ctx.fillRect(0, 0, canvas.width, canvas.height);
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
  // Remux real VP8 frames onto known, unequal presentation intervals.
  const {
    Input,
    BufferSource,
    WEBM,
    EncodedPacketSink,
    EncodedVideoPacketSource,
    Output,
    BufferTarget,
    WebMOutputFormat,
  } = await import("mediabunny");
  const source = new Input({
    source: new BufferSource(new Uint8Array(fixture.bytes)),
    formats: [WEBM],
  });
  const track = (await source.getPrimaryVideoTrack())!;
  const target = new BufferTarget();
  const output = new Output({ format: new WebMOutputFormat(), target });
  const packets = new EncodedVideoPacketSource((await track.getCodec())!);
  output.addVideoTrack(packets);
  await output.start();
  let timestamp = 0,
    sample = 0;
  for await (const packet of new EncodedPacketSink(track).packets()) {
    const duration = [0.04, 0.12, 0.02, 0.08][sample++ % 4];
    await packets.add(packet.clone({ timestamp, duration }), {
      decoderConfig: (await track.getDecoderConfig())!,
    });
    timestamp += duration;
  }
  await output.finalize();
  source.dispose();
  vfrFile = path.join(folder, "variable-frame-rate.webm");
  await writeFile(vfrFile, Buffer.from(target.buffer!));
  pictures = [5, 0, 2].map((i) => ({
    name: `frame_${String(i).padStart(6, "0")}.png`,
    mimeType: "image/png",
    buffer: Buffer.from(fixture.image, "base64"),
  }));
  const trials = path.join(folder, "trials");
  await mkdir(trials);
  execFileSync(resolvePython(), [
    "-c",
    "from backend.demo import create_demo; import sys; from pathlib import Path; p=Path(sys.argv[1]); create_demo(p/'WT04.c3d'); create_demo(p/'WT05.c3d')",
    trials,
  ]);
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
    page.getByRole("button", { name: "应用手动对齐", exact: true }),
  ).toBeEnabled();
}

test("comparison bar uses actual variable-rate video frames and links both frame controls", async ({
  page,
}) => {
  await page.getByLabel("导入视频", { exact: true }).setInputFiles(vfrFile);
  const bar = page.getByRole("group", {
    name: "视频与 Vicon 对照",
    exact: true,
  });
  const videoFrame = bar.getByLabel("视频帧号", { exact: true });
  const videoTime = bar.getByLabel("视频时间（秒）", { exact: true });
  const viconFrame = bar.getByLabel("Vicon 帧号", { exact: true });
  const movie = page.getByLabel("参考视频", { exact: true });
  await expect(videoFrame).toHaveValue("0");
  const boxes = await Promise.all(
    [videoTime, videoFrame, viconFrame].map((field) => field.boundingBox()),
  );
  expect(
    Math.max(...boxes.map((b) => b!.y)) - Math.min(...boxes.map((b) => b!.y)),
  ).toBeLessThan(2);
  await page.getByRole("button", { name: "应用手动对齐", exact: true }).click();
  await videoFrame.fill("2");
  await expect(viconFrame).toHaveValue("17");
  await expect(videoFrame).toHaveValue("2");
  await expect
    .poll(async () => Number(await videoTime.inputValue()))
    .toBeCloseTo(0.16, 4);
  await bar.getByRole("button", { name: "下一视频帧", exact: true }).click();
  await expect(videoFrame).toHaveValue("3");
  await expect(viconFrame).toHaveValue("19");
  await bar.getByRole("button", { name: "下一 Vicon 帧", exact: true }).click();
  await expect(viconFrame).toHaveValue("20");
  await expect(videoFrame).toHaveValue("3");
  await expect
    .poll(() => movie.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeCloseTo(0.19, 4);
  await bar.getByRole("button", { name: "画面延后", exact: true }).click();
  await expect(viconFrame).toHaveValue("20");
  await expect(bar).toContainText("时间偏移 0.0100 秒");
  await expect
    .poll(() => movie.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeCloseTo(0.2, 4);
  await bar.getByRole("button", { name: "撤销对齐微调", exact: true }).click();
  await expect(bar).toContainText("时间偏移 0.0000 秒");
  await expect(viconFrame).toHaveValue("20");
  await viconFrame.fill("51");
  await expect(page.getByLabel("当前帧", { exact: true })).toHaveValue("51");
  await videoFrame.fill("2");
  await expect(viconFrame).toHaveValue("17");
  await expect(videoFrame).toHaveValue("2");
  await page.getByRole("button", { name: "放大视频", exact: true }).click();
  await expect(bar).toBeVisible();
  await page.screenshot({
    path: ".local/screenshots/comparison-expanded.png",
    animations: "disabled",
  });
});

test("comparison preserves original Vicon frame numbers and zero-based video frame numbers", async ({
  page,
}) => {
  await page.route("**/api/files/demo", async (route) => {
    const response = await route.fetch();
    const meta = await response.json();
    await route.fulfill({
      json: {
        ...meta,
        firstFrame: 2725,
        lastFrame: 2725 + meta.frameCount - 1,
      },
    });
  });
  await page.reload();
  await page.getByRole("button", { name: "视频同步", exact: true }).click();
  await page.getByLabel("导入视频", { exact: true }).setInputFiles(vfrFile);
  await expect(page.getByLabel("视频帧号", { exact: true })).toHaveValue("0");
  await expect(page.getByLabel("Vicon 帧号", { exact: true })).toHaveValue(
    "2725",
  );
  await page.getByRole("button", { name: "应用手动对齐", exact: true }).click();
  await page.getByLabel("视频帧号", { exact: true }).fill("2");
  await expect(page.getByLabel("Vicon 帧号", { exact: true })).toHaveValue(
    "2741",
  );
  await expect(page.getByLabel("当前帧", { exact: true })).toHaveValue("2741");
});

test("video stepping retains the selected picture when Vicon samples are coarser", async ({
  page,
}) => {
  await page.route("**/api/files/demo", async (route) => {
    const response = await route.fetch();
    const meta = await response.json();
    await route.fulfill({ json: { ...meta, pointRate: 10 } });
  });
  await page.reload();
  await page.getByRole("button", { name: "视频同步", exact: true }).click();
  await page.getByLabel("导入视频", { exact: true }).setInputFiles(vfrFile);
  const videoFrame = page.getByLabel("视频帧号", { exact: true });
  const viconFrame = page.getByLabel("Vicon 帧号", { exact: true });
  const videoTime = page.getByLabel("视频时间（秒）", { exact: true });
  await expect(videoFrame).toHaveValue("0");
  await page.getByRole("button", { name: "应用手动对齐", exact: true }).click();
  await videoFrame.fill("2");
  await expect(viconFrame).toHaveValue("3");
  await expect
    .poll(async () => Number(await videoTime.inputValue()))
    .toBeCloseTo(0.16, 4);
  await page.getByRole("button", { name: "下一视频帧", exact: true }).click();
  await expect(videoFrame).toHaveValue("3");
  await expect(viconFrame).toHaveValue("3");
  await page
    .getByRole("button", { name: "下一 Vicon 帧", exact: true })
    .click();
  await expect(viconFrame).toHaveValue("4");
  await expect(videoFrame).toHaveValue("5");
  await page
    .getByRole("button", { name: "上一 Vicon 帧", exact: true })
    .click();
  await expect(videoFrame).toHaveValue("3");
  // Keep the user's fractional input intact while decoded-frame updates arrive.
  await videoTime.fill("");
  await videoTime.pressSequentially("0.16");
  await videoTime.press("Enter");
  await expect(videoFrame).toHaveValue("2");
});

test("independent video playback enlarges the portrait image and can be restored without interrupting playback", async ({
  page,
}) => {
  await loadVideo(page);
  const stage = page.locator(".media-stage");
  const video = page.getByLabel("参考视频", { exact: true });
  const initial = (await stage.boundingBox())!;
  const frame = page.getByLabel("当前帧", { exact: true });
  const initialFrame = await frame.inputValue();
  await video.evaluate((v: HTMLVideoElement) => v.play());
  await expect(page.locator(".media-panel")).toHaveClass(/expanded/);
  expect((await stage.boundingBox())!.height).toBeGreaterThan(
    initial.height * 2,
  );
  await expect(page.locator(".signal-panel")).toBeHidden();
  await expect(page.locator(".viewer-shell canvas")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "播放时间轴", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("视频时间（秒）", { exact: true }),
  ).toBeVisible();
  await expect(frame).toHaveValue(initialFrame);
  await video.evaluate((v: HTMLVideoElement) => v.pause());
  await page.screenshot({
    path: ".local/screenshots/portrait-video-expanded.png",
    animations: "disabled",
  });
  await video.evaluate((v: HTMLVideoElement) => v.play());
  await page.getByRole("button", { name: "还原视频", exact: true }).click();
  await expect(page.locator(".media-panel")).not.toHaveClass(/expanded/);
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(false);
  await expect(page.locator(".signal-panel")).toBeVisible();
  expect((await stage.boundingBox())!.height).toBeCloseTo(initial.height, 0);
  await video.evaluate((v: HTMLVideoElement) => v.pause());
  await page.getByRole("button", { name: "放大视频", exact: true }).click();
  await video.focus();
  await page.keyboard.press("Escape");
  await expect(page.locator(".media-panel")).not.toHaveClass(/expanded/);
  await page.getByRole("button", { name: "放大视频", exact: true }).click();
  await page.getByRole("button", { name: "关闭视频面板", exact: true }).click();
  await expect(page.locator(".signal-panel")).toBeVisible();
  await page.getByRole("button", { name: "视频同步", exact: true }).click();
  await loadVideo(page);
  await expect(page.locator(".media-panel")).not.toHaveClass(/expanded/);
});

test("video anchors, seeks and drives Vicon playback from its own media clock", async ({
  page,
}) => {
  await loadVideo(page);
  const frame = page.getByRole("spinbutton", { name: "当前帧", exact: true });
  const video = page.getByLabel("参考视频", { exact: true });
  await frame.fill("51");
  await page.getByLabel("视频时间（秒）").fill("1.25");
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeCloseTo(1.25, 2);
  await page.getByRole("button", { name: "应用手动对齐", exact: true }).click();
  await frame.fill("101");
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeCloseTo(1.75, 2);
  await page.getByLabel("播放速度", { exact: true }).selectOption("0.5");
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await expect(page.locator(".media-panel")).toHaveClass(/expanded/);
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
  await page.getByRole("button", { name: "暂停视频", exact: true }).click();
  await expect(page.locator(".media-panel")).toHaveClass(/expanded/);
  await expect(
    page.getByRole("button", { name: "播放视频", exact: true }),
  ).toBeVisible();
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
      name: "应用手动对齐",
      exact: true,
    }),
  ).toBeDisabled();
  await page.getByLabel("源视频 FPS", { exact: true }).fill("10");
  await expect(page.getByLabel("视频帧号", { exact: true })).toHaveValue("0");
  await page.getByRole("button", { name: "下一视频帧", exact: true }).click();
  await expect(page.getByLabel("视频帧号", { exact: true })).toHaveValue("2");
  await expect(page.getByLabel("Vicon 帧号", { exact: true })).toHaveValue("1");
  await page.getByRole("button", { name: "上一视频帧", exact: true }).click();
  await expect(page.getByLabel("视频帧号", { exact: true })).toHaveValue("0");
  await page.getByRole("button", { name: "应用手动对齐", exact: true }).click();
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
  await page.getByRole("button", { name: "应用手动对齐", exact: true }).click();
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
  await openAlignmentSettings(page);
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
  await openAlignmentSettings(page);
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
  await openAlignmentSettings(page);
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

test("video URLs and each trial's own association survive switching, while changed trial revisions are rechecked", async ({
  page,
}) => {
  const trials = path.join(folder, "trials");
  try {
    await page.getByRole("button", { name: "打开文件夹", exact: true }).click();
    await page.getByLabel("文件夹路径").fill(trials);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "打开文件夹", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "WT04.c3d", exact: true }),
    ).toBeVisible();
    await loadVideo(page);
    await page.getByLabel("视频时间（秒）", { exact: true }).fill("0.5");
    await page
      .getByRole("button", { name: "应用手动对齐", exact: true })
      .click();
    const originalURL = await page.locator("video").getAttribute("src");
    await page.locator(".file-row").filter({ hasText: "WT05.c3d" }).click();
    await expect(
      page.getByRole("heading", { name: "WT05.c3d", exact: true }),
    ).toBeVisible();
    await expect(page.locator("video")).toHaveAttribute("src", originalURL!);
    await expect(page.locator(".media-readout")).toContainText("尚未对齐");
    await expect(
      page.getByRole("button", { name: "应用手动对齐", exact: true }),
    ).toBeEnabled();
    await expect
      .poll(() =>
        page.locator("video").evaluate((v: HTMLVideoElement) => v.duration),
      )
      .toBeGreaterThan(1);
    await page.getByLabel("导入视频", { exact: true }).setInputFiles(vfrFile);
    await expect(page.getByLabel("视频帧号", { exact: true })).toHaveValue("0");
    await page.getByLabel("视频时间（秒）", { exact: true }).fill("1");
    await page
      .getByRole("button", { name: "应用手动对齐", exact: true })
      .click();
    const secondURL = await page.locator("video").getAttribute("src");
    expect(secondURL).not.toBe(originalURL);
    await page.locator(".file-row").filter({ hasText: "WT04.c3d" }).click();
    await expect(page.locator("video")).toHaveAttribute("src", originalURL!);
    await expect(page.locator(".trial-media-notice")).toContainText(
      "已恢复当前试次",
    );
    await expect(page.locator(".media-readout")).toContainText(
      "时间偏移 0.5000 秒",
    );
    await expect
      .poll(() =>
        page.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime),
      )
      .toBeCloseTo(0.5, 3);
    await page.screenshot({
      path: ".local/screenshots/trial-media-restored.png",
      animations: "disabled",
    });
    await page.locator(".file-row").filter({ hasText: "WT05.c3d" }).click();
    await expect(page.locator("video")).toHaveAttribute("src", secondURL!);
    await expect(page.locator(".media-readout")).toContainText(
      "时间偏移 1.0000 秒",
    );
    await page.route(/\/api\/files\/[^/]+$/, async (route) => {
      const response = await route.fetch();
      const meta = await response.json();
      await route.fulfill({ json: { ...meta, revision: "changed-source" } });
    });
    await page.locator(".file-row").filter({ hasText: "WT04.c3d" }).click();
    await expect(page.locator(".media-readout")).toContainText("尚未对齐");
    await expect(page.locator(".trial-media-notice")).toContainText(
      "当前试次尚未对齐",
    );
  } finally {
    await page.request.post("/api/library", { data: { path: folder } });
  }
});

test("English narrow media layout and alignment dialog stay accessible", async ({
  page,
}) => {
  await page
    .getByLabel("导入图片序列", { exact: true })
    .setInputFiles(pictures);
  await page.getByLabel("源视频 FPS", { exact: true }).fill("10");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByLabel("主题", { exact: true }).selectOption("light");
  await page.getByLabel("界面语言").selectOption("en");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".close-inspector").click();
  await page.locator(".rail-top button").first().click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Apply manual alignment", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("button", { name: "Manual alignment", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Automatic alignment", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: ".local/screenshots/alignment-manual-light-narrow.png",
    fullPage: true,
    animations: "disabled",
  });
  const smallStage = (await page.locator(".media-stage").boundingBox())!;
  await page
    .getByRole("button", { name: "Enlarge video", exact: true })
    .click();
  expect(
    (await page.locator(".media-stage").boundingBox())!.height,
  ).toBeGreaterThan(smallStage.height * 1.5);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Restore video size", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".local/screenshots/portrait-media-expanded-narrow.png",
    fullPage: true,
    animations: "disabled",
  });
  await openAlignmentSettings(page, true);
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
