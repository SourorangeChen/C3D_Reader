import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Optional local acceptance test; recordings and expected reference values stay
// outside the repository. No supplied offset enters the application or matcher.
test("raw media import finds the action and synchronizes without manual offsets", async () => {
  test.skip(
    !process.env.C3D_SYNC_C3D || !process.env.C3D_SYNC_VIDEO,
    "Set local recording paths for this acceptance test.",
  );
  test.setTimeout(180000);
  const folder = await mkdtemp(path.join(tmpdir(), "c3d-auto-acceptance-"));
  const packaged = process.env.C3D_TEST_APP;
  const app = await electron.launch({
    ...(packaged ? { executablePath: packaged } : {}),
    args: [...(packaged ? [] : ["."]), `--user-data-dir=${folder}/profile`],
    env: {
      ...process.env,
      C3D_READER_CONFIG_DIR: `${folder}/config`,
      C3D_READER_DATA: "",
    },
  });
  try {
    const page = await app.firstWindow();
    await expect(
      page.getByRole("heading", { name: "Synthetic walking" }),
    ).toBeVisible();
    await app.evaluate(
      ({ app }, file) => app.emit("open-file", { preventDefault() {} }, file),
      process.env.C3D_SYNC_C3D!,
    );
    await expect(
      page.getByRole("heading", {
        name: path.basename(process.env.C3D_SYNC_C3D!),
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "视频同步", exact: true }).click();
    await page
      .getByLabel("导入视频", { exact: true })
      .setInputFiles(process.env.C3D_SYNC_VIDEO!);
    const status = page.getByLabel("自动动作对齐", { exact: true });
    await expect(status).toContainText("已自动应用", { timeout: 130000 });
    await expect(page.locator(".media-readout")).toContainText(
      "自动对齐 · 待复核",
    );
    const initial = await page
      .locator("video")
      .evaluate((v: HTMLVideoElement) => v.currentTime);
    const expected = Number(process.env.C3D_SYNC_EXPECTED);
    if (Number.isFinite(expected))
      expect(Math.abs(initial - expected)).toBeLessThan(0.1);
    const frame = page.getByLabel("当前帧", { exact: true });
    const first = Number(await frame.inputValue());
    // Compare real frame metadata, not an assumed C3D sample rate.
    const files = await page.request.get(
      new URL("/api/library", page.url()).href,
    );
    const key = (await files.json()).files.find(
      (f: { name: string }) =>
        f.name === path.basename(process.env.C3D_SYNC_C3D!),
    ).id;
    const meta = await (
      await page.request.get(new URL(`/api/files/${key}`, page.url()).href)
    ).json();
    for (const seconds of [0, 2, (meta.frameCount - 1) / meta.pointRate]) {
      const relative = Math.round(seconds * meta.pointRate);
      await frame.fill(String(first + relative));
      await expect
        .poll(() =>
          page
            .locator("video")
            .evaluate((v: HTMLVideoElement) => v.currentTime),
        )
        .toBeCloseTo(initial + relative / meta.pointRate, 2);
      await page.screenshot({
        path: `.local/auto-sync-check/aligned-${relative}.png`,
      });
    }
    await frame.fill(String(first));
    await page.getByRole("button", { name: "播放", exact: true }).click();
    await expect
      .poll(async () => Number(await frame.inputValue()))
      .toBeGreaterThan(first + 70);
    await page.getByRole("button", { name: "暂停", exact: true }).click();
    const clock = await page
      .locator("video")
      .evaluate((v: HTMLVideoElement) => v.currentTime);
    expect(
      Math.abs(
        (Number(await frame.inputValue()) - first) / meta.pointRate -
          (clock - initial),
      ),
    ).toBeLessThan(0.08);
    const destination = `${folder}/alignment.json`;
    await app.evaluate(
      ({ session }, output) =>
        session.defaultSession.on("will-download", (_event, item) =>
          item.setSavePath(output),
        ),
      destination,
    );
    await page.getByRole("button", { name: "时间对齐", exact: true }).click();
    await page
      .getByRole("button", { name: "保存当前对齐", exact: true })
      .click();
    await expect
      .poll(async () => {
        try {
          return JSON.parse(await readFile(destination, "utf8")).source;
        } catch {
          return "";
        }
      })
      .toBe("auto");
    const result = JSON.parse(await readFile(destination, "utf8"));
    expect(result.evidence.model).toContain("Apple Vision");
    expect(result.evidence.coverage).toBeGreaterThan(0.9);
    console.log(
      JSON.stringify({
        offset: result.overall_lag_s,
        correlation: result.evidence.correlation,
        coverage: result.evidence.coverage,
        peakMargin: result.evidence.peakMargin,
      }),
    );
  } finally {
    await app.close();
  }
});

test("numbered images automatically align with FPS and with original PTS", async () => {
  test.skip(
    !process.env.C3D_SYNC_C3D || !process.env.C3D_SYNC_IMAGES,
    "Set local image sequence paths for this acceptance test.",
  );
  test.setTimeout(120000);
  const { readdir } = await import("node:fs/promises");
  const root = process.env.C3D_SYNC_IMAGES!;
  const folder = await mkdtemp(path.join(tmpdir(), "c3d-auto-images-"));
  const packaged = process.env.C3D_TEST_APP;
  const app = await electron.launch({
    ...(packaged ? { executablePath: packaged } : {}),
    args: [...(packaged ? [] : ["."]), `--user-data-dir=${folder}/profile`],
    env: {
      ...process.env,
      C3D_READER_CONFIG_DIR: `${folder}/config`,
      C3D_READER_DATA: "",
    },
  });
  try {
    const page = await app.firstWindow();
    await expect(
      page.getByRole("heading", { name: "Synthetic walking" }),
    ).toBeVisible();
    await app.evaluate(
      ({ app }, file) => app.emit("open-file", { preventDefault() {} }, file),
      process.env.C3D_SYNC_C3D!,
    );
    await expect(
      page.getByRole("heading", {
        name: path.basename(process.env.C3D_SYNC_C3D!),
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "视频同步", exact: true }).click();
    await page.getByLabel("导入图片序列", { exact: true }).setInputFiles(
      (await readdir(root))
        .filter((f) => f.endsWith(".jpg"))
        .map((f) => path.join(root, f))
        .reverse(),
    );
    const status = page.getByLabel("自动动作对齐", { exact: true });
    await expect(status).toContainText("填写图片 FPS");
    await page
      .getByLabel("源视频 FPS", { exact: true })
      .fill(process.env.C3D_SYNC_IMAGE_FPS || "15");
    await expect(status).toContainText("已自动应用", { timeout: 60000 });
    await expect(page.locator(".media-stage img")).toBeVisible();
    const fpsOffset = Number(
      (await status.innerText()).match(/素材 ([\d.]+) 秒/)![1],
    );
    const fpsImage = await page.locator(".media-stage img").getAttribute("alt");
    await page
      .getByLabel("导入 PTS 表", { exact: true })
      .setInputFiles(path.join(root, "timestamps.csv"));
    await expect(page.getByLabel("源视频 FPS", { exact: true })).toBeDisabled();
    await expect
      .poll(
        async () =>
          Number(
            (await status.innerText()).match(/素材 ([\d.]+) 秒/)?.[1] || 0,
          ),
        { timeout: 60000 },
      )
      .toBeGreaterThan(fpsOffset + 1);
    await expect(status).toContainText("已自动应用", { timeout: 60000 });
    const ptsOffset = Number(
      (await status.innerText()).match(/素材 ([\d.]+) 秒/)![1],
    );
    if (process.env.C3D_SYNC_EXPECTED)
      expect(
        Math.abs(ptsOffset - Number(process.env.C3D_SYNC_EXPECTED)),
      ).toBeLessThan(0.1);
    expect(await page.locator(".media-stage img").getAttribute("alt")).toBe(
      fpsImage,
    );
    await page.screenshot({
      path: ".local/auto-sync-check/aligned-images.png",
    });
    console.log(JSON.stringify({ fpsOffset, ptsOffset, fpsImage }));
  } finally {
    await app.close();
  }
});
