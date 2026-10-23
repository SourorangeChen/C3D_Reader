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
    args: packaged ? [] : ["."],
    env: {
      ...process.env,
      C3D_READER_CONFIG_DIR: path.join(folder, "settings"),
      C3D_READER_DATA: "",
      ...(process.env.CI ? { ELECTRON_DISABLE_SANDBOX: "1" } : {}),
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
    args: packaged ? [fixture] : [".", fixture],
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
