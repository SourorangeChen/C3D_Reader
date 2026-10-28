import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdtemp, readFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

let application: ElectronApplication,
  page: Page,
  folder: string,
  fixture: string;

test.beforeEach(async () => {
  folder = await mkdtemp(path.join(tmpdir(), "c3d-desktop-"));
  fixture = path.join(folder, "拖入 文件.C3D");
  execFileSync(path.resolve(".venv/bin/python"), [
    "-c",
    `from backend.demo import create_demo; import sys; create_demo(sys.argv[1])`,
    fixture,
  ]);
  const packaged = process.env.C3D_TEST_APP;
  application = await electron.launch({
    ...(packaged ? { executablePath: packaged } : {}),
    args: packaged
      ? [`--user-data-dir=${folder}/electron-profile`]
      : [".", `--user-data-dir=${folder}/electron-profile`],
    env: {
      ...process.env,
      C3D_READER_CONFIG_DIR: path.join(folder, "settings"),
      C3D_READER_DATA: "",
    },
  });
  page = await application.firstWindow();
  await expect(
    page.getByRole("heading", { name: "Synthetic walking" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "打开 C3D", exact: true }),
  ).toBeVisible();
});
test.afterEach(async () => {
  await application?.close();
});

test("native-backed drop opens without copying the acquisition", async () => {
  // Chromium supplies a disk-backed File object. It passes through the actual
  // renderer -> preload webUtils -> IPC -> frozen/local service path.
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.id = "desktop-drop-fixture";
    document.body.appendChild(input);
  });
  await page.locator("#desktop-drop-fixture").setInputFiles(fixture);
  await page.evaluate(() => {
    const file = (
      document.getElementById("desktop-drop-fixture") as HTMLInputElement
    ).files![0];
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const app = document.querySelector(".app")!;
    app.dispatchEvent(
      new DragEvent("dragenter", { bubbles: true, dataTransfer: transfer }),
    );
    app.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }),
    );
  });
  await expect(
    page.getByRole("heading", { name: "拖入 文件.C3D" }),
  ).toBeVisible();
  await expect(page.locator(".trial-stats")).toContainText("800");
  await expect(page.locator(".signal-plot path").nth(1)).toBeVisible();
  expect(await page.title()).toContain("C3D Reader");
  const settings = JSON.parse(
    await readFile(path.join(folder, "settings/settings.json"), "utf8"),
  );
  expect(settings.folder).toBe(await realpath(folder));
  await page.screenshot({ path: ".local/desktop-drop.png" });
});

test("Finder open-file event switches the running application", async () => {
  await application.evaluate(({ app }, file) => {
    app.emit("open-file", { preventDefault() {} }, file);
  }, fixture);
  await expect(
    page.getByRole("heading", { name: "拖入 文件.C3D" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "下一帧", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", { name: "当前帧", exact: true }),
  ).toHaveValue("2");
});

test("native open dialog opens a chosen file", async () => {
  await application.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, fixture);
  await page.getByRole("button", { name: "打开 C3D", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "拖入 文件.C3D" }),
  ).toBeVisible();
});

test("cold launch with a C3D file wins over the default demo", async () => {
  await application.close();
  const packaged = process.env.C3D_TEST_APP;
  application = await electron.launch({
    ...(packaged ? { executablePath: packaged } : {}),
    args: packaged
      ? [`--user-data-dir=${folder}/cold-profile`, fixture]
      : [".", `--user-data-dir=${folder}/cold-profile`, fixture],
    env: {
      ...process.env,
      C3D_READER_CONFIG_DIR: path.join(folder, "cold-settings"),
      C3D_READER_DATA: "",
    },
  });
  page = await application.firstWindow();
  await expect(
    page.getByRole("heading", { name: "拖入 文件.C3D" }),
  ).toBeVisible();
  await expect(page.locator(".trial-stats")).toContainText("800");
});

test("wrong extension is rejected and the service exits with the app", async () => {
  await application.evaluate(
    ({ app }, file) => {
      app.emit("open-file", { preventDefault() {} }, file);
    },
    path.join(folder, "notes.txt"),
  );
  await expect(page.getByRole("alert")).toContainText(".c3d");
  const url = page.url();
  await application.close();
  await expect
    .poll(async () => {
      try {
        return (await fetch(url + "/api/health")).ok;
      } catch {
        return false;
      }
    })
    .toBe(false);
});

test("native Settings menu, theme and language survive a full app restart", async () => {
  await application.evaluate(({ Menu }) => {
    const item = Menu.getApplicationMenu()!.items[0].submenu!.items.find(
      (item) => item.accelerator === "CmdOrCtrl+,",
    )!;
    item.click();
  });
  await expect(
    page.getByRole("dialog", { name: "设置", exact: true }),
  ).toBeVisible();
  await page.getByLabel("主题", { exact: true }).selectOption("light");
  await page.getByLabel("界面语言").selectOption("en");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("separator", { name: "Resize inspector" }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect
    .poll(async () =>
      application.evaluate(({ Menu, nativeTheme }) => ({
        file: Menu.getApplicationMenu()!.items[1].label,
        theme: nativeTheme.themeSource,
      })),
    )
    .toEqual({ file: "File", theme: "light" });
  const previousOrigin = new URL(page.url()).origin;
  await application.close();
  const saved = JSON.parse(
    await readFile(path.join(folder, "settings/preferences.json"), "utf8"),
  );
  expect(saved.language).toBe("en");
  expect(saved.layout.inspector).toBe(230);
  const packaged = process.env.C3D_TEST_APP;
  application = await electron.launch({
    ...(packaged ? { executablePath: packaged } : {}),
    // A fresh browser profile proves persistence does not depend on localStorage.
    args: packaged
      ? [`--user-data-dir=${folder}/second-profile`]
      : [".", `--user-data-dir=${folder}/second-profile`],
    env: {
      ...process.env,
      C3D_READER_CONFIG_DIR: path.join(folder, "settings"),
      C3D_READER_DATA: "",
    },
  });
  page = await application.firstWindow();
  await expect(
    page.getByRole("button", { name: "Settings", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(
    page.getByRole("separator", { name: "Resize inspector" }),
  ).toHaveAttribute("aria-valuenow", "230");
  expect(new URL(page.url()).origin).not.toBe(previousOrigin);
  await page.screenshot({ path: ".local/desktop-settings-en.png" });
});

test("desktop folder export uses the native download flow", async () => {
  await application.evaluate(({ app }, file) => {
    app.emit("open-file", { preventDefault() {} }, file);
  }, fixture);
  await expect(
    page.getByRole("heading", { name: "拖入 文件.C3D" }),
  ).toBeVisible();
  const output = path.join(folder, "export.zip");
  await application.evaluate(({ session }, destination) => {
    session.defaultSession.on("will-download", (_event, item) => {
      item.setSavePath(destination);
    });
  }, output);
  await page.getByRole("button", { name: "批量导出 CSV", exact: true }).click();
  await page.getByRole("button", { name: "开始导出", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("成功 1，失败 0");
  // A reload must reconnect to the backend task without sessionStorage state.
  await page.reload();
  await page.getByRole("button", { name: "批量导出 CSV", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("成功 1，失败 0");
  await page.getByRole("link", { name: "下载 ZIP" }).click();
  await expect
    .poll(async () => {
      try {
        return (await readFile(output)).subarray(-22, -18).toString("hex");
      } catch {
        return "";
      }
    })
    .toBe("504b0506");
  execFileSync(path.resolve(".venv/bin/python"), [
    "-c",
    `
import csv, io, json, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    assert archive.testzip() is None
    record = json.loads(archive.read('manifest.json'))['files'][0]
    assert record['status'] == 'ok'
    points = list(csv.reader(io.StringIO(archive.read(record['directory']+'/points.csv').decode('utf-8-sig'))))
    analog = list(csv.reader(io.StringIO(archive.read(record['directory']+'/analog.csv').decode('utf-8-sig'))))
    assert len(points) == 801 and len(points[0]) == 142
    assert len(analog) == 8001 and len(analog[0]) == 7
`,
    output,
  ]);
});

test("native CSV download includes every point and source COM by default", async () => {
  const comFixture = path.join(folder, "synthetic-com.c3d");
  execFileSync(path.resolve(".venv/bin/python"), [
    "-c",
    "from backend.demo import create_demo; import sys; create_demo(sys.argv[1], include_com=True)",
    comFixture,
  ]);
  await application.evaluate(({ app }, file) => {
    app.emit("open-file", { preventDefault() {} }, file);
  }, comFixture);
  await expect(
    page.getByRole("heading", { name: "synthetic-com.c3d" }),
  ).toBeVisible();
  const output = path.join(folder, "all-points.csv");
  await application.evaluate(({ session }, destination) => {
    session.defaultSession.on("will-download", (_event, item) => {
      item.setSavePath(destination);
    });
  }, output);
  await page.getByRole("button", { name: "导出 CSV", exact: true }).click();
  await expect(page.getByLabel("导出内容", { exact: true })).toHaveValue(
    "all-points",
  );
  await expect(page.locator(".com-summary")).toContainText(
    "Demo:CentreOfMassFloor",
  );
  await page.getByRole("link", { name: "下载 CSV", exact: true }).click();
  await expect
    .poll(async () => {
      try {
        return (await readFile(output, "utf8")).trim().split(/\r?\n/).length;
      } catch {
        return 0;
      }
    })
    .toBe(801);
  const header = (await readFile(output, "utf8")).split(/\r?\n/)[0];
  expect(header.split(",")).toHaveLength(2 + 37 * 4);
  expect(header).toContain("Demo:CentreOfMass:Z (mm)");
  expect(header).toContain("Demo:CentreOfMassFloor:Z (mm)");
});

test("local image synchronization and profile downloads work inside the desktop network policy", async () => {
  await page.getByRole("button", { name: "视频同步", exact: true }).click();
  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 40;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#72aef8";
    context.fillRect(0, 0, 40, 40);
    return canvas.toDataURL().split(",")[1];
  });
  await page.getByLabel("导入图片序列", { exact: true }).setInputFiles(
    [0, 1, 2].map((frame) => ({
      name: `frame_${frame}.png`,
      mimeType: "image/png",
      buffer: Buffer.from(image, "base64"),
    })),
  );
  await page.getByLabel("源视频 FPS", { exact: true }).fill("10");
  await page
    .getByRole("button", { name: "将当前画面对齐到此 C3D 帧", exact: true })
    .click();
  await page.getByLabel("当前帧", { exact: true }).fill("11");
  const picture = page.getByAltText("原视频帧 1", { exact: true });
  await expect(picture).toBeVisible();
  await expect
    .poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(40);
  const output = path.join(folder, "sync.json");
  await application.evaluate(({ session }, destination) => {
    session.defaultSession.on("will-download", (_event, item) =>
      item.setSavePath(destination),
    );
  }, output);
  await page.getByRole("button", { name: "时间对齐", exact: true }).click();
  await page.getByRole("button", { name: "保存当前对齐", exact: true }).click();
  await expect
    .poll(async () => {
      try {
        return JSON.parse(await readFile(output, "utf8")).format;
      } catch {
        return "";
      }
    })
    .toBe("c3d-reader-sync");
});

test("bundled video playback and signal alignment use the packaged service", async () => {
  const { version } = JSON.parse(
    await readFile(path.resolve("package.json"), "utf8"),
  );
  await expect(page.locator(".version")).toHaveText(version);
  const health = await page.request.get(
    new URL("/api/health", page.url()).href,
  );
  expect((await health.json()).version).toBe(version);
  expect(await application.evaluate(({ app }) => app.getVersion())).toBe(
    version,
  );

  const movie = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext("2d")!;
    const stream = canvas.captureStream(25);
    const recorder = new MediaRecorder(stream, {
      mimeType: "video/webm;codecs=vp8",
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.start();
    for (let i = 0; i < 60; i++) {
      context.fillStyle = "#111113";
      context.fillRect(0, 0, 320, 180);
      context.fillStyle = "#72aef8";
      context.fillRect(10 + i * 4, 60, 30, 60);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((track) => track.stop());
    return [...new Uint8Array(await new Blob(chunks).arrayBuffer())];
  });
  await page.getByRole("button", { name: "视频同步", exact: true }).click();
  await page.getByLabel("导入视频", { exact: true }).setInputFiles({
    name: "synthetic-clock.webm",
    mimeType: "video/webm",
    buffer: Buffer.from(movie),
  });
  await expect(
    page.getByRole("button", { name: "时间对齐", exact: true }),
  ).toBeEnabled();
  const frame = page.getByLabel("当前帧", { exact: true });
  const video = page.getByLabel("参考视频", { exact: true });
  await frame.fill("51");
  await page.getByLabel("预览视频时间（秒）").fill("0.75");
  await page
    .getByRole("button", { name: "将当前画面对齐到此 C3D 帧", exact: true })
    .click();
  await frame.fill("101");
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeCloseTo(1.25, 2);
  await page.getByLabel("播放速度", { exact: true }).selectOption("0.5");
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await expect
    .poll(async () => Number(await frame.inputValue()))
    .toBeGreaterThan(105);
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
        (Number(await frame.inputValue()) - 1) / 100 - (presentedTime - 0.25),
      ),
    )
    .toBeLessThanOrEqual(0.005001);
  await page.getByRole("button", { name: "暂停", exact: true }).click();

  const seriesResponse = await page.request.get(
    new URL("/api/files/demo/series?kind=point&ids=26&limit=10000", page.url())
      .href,
  );
  expect(seriesResponse.ok()).toBe(true);
  const series = (await seriesResponse.json()).series[2];
  const aligned = await page.request.post(
    new URL("/api/files/demo/alignment", page.url()).href,
    {
      data: {
        times: series.times.map((time: number) => time + 0.12),
        values: series.values,
        kind: "point",
        channel: 26,
        axis: 2,
        start: 100,
        stop: 400,
        low: -0.3,
        high: 0.3,
        step: 0.01,
      },
    },
  );
  expect(aligned.ok()).toBe(true);
  const result = await aligned.json();
  expect(result.status).toBe("accepted");
  expect(result.lag).toBeCloseTo(0.12, 5);
});
