/** Render README artwork and record the real workbench with synthetic data only.
 * Run after npm run build: FFMPEG_BINARY=/path/to/ffmpeg node scripts/readme-media.mjs
 * Requires Playwright Chromium (npx playwright install chromium).
 */
import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = join(root, ".local/readme-media");
const output = join(root, "docs/media");
const url = "http://127.0.0.1:8013";
const ffmpeg = process.env.FFMPEG_BINARY || "ffmpeg";
if (spawnSync(ffmpeg, ["-version"], { stdio: "ignore" }).status !== 0)
  throw new Error("Set FFMPEG_BINARY to an ffmpeg executable.");
await mkdir(scratch, { recursive: true });
await mkdir(output, { recursive: true });
// A separate configuration directory cannot load the user's library or recordings.
const config = join(scratch, "config");
await mkdir(config, { recursive: true });
await writeFile(join(config, "settings.json"), JSON.stringify({ folder: "" }));
const server = spawn(
  join(root, ".venv/bin/python"),
  ["-m", "uvicorn", "backend.app:app", "--host", "127.0.0.1", "--port", "8013"],
  {
    cwd: root,
    env: { ...process.env, C3D_READER_CONFIG_DIR: config, C3D_READER_DATA: "" },
    stdio: ["ignore", "ignore", "inherit"],
  },
);
let browser;
try {
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null)
      throw new Error("Demo service failed to start.");
    if (
      await fetch(`${url}/api/health`)
        .then((r) => r.ok)
        .catch(() => false)
    )
      break;
    await new Promise((r) => setTimeout(r, 250));
  }
  const library = await fetch(`${url}/api/library`).then((r) => r.json());
  if (library.folder || library.files.length)
    throw new Error("Demo library must be empty.");
  browser = await chromium.launch({
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(url);
  await page.getByRole("heading", { name: "Synthetic walking" }).waitFor();
  await page.locator(".signal-plot path").nth(1).waitFor();
  await page
    .getByRole("spinbutton", { name: "当前帧", exact: true })
    .fill("145");
  await page.getByRole("button", { name: "轨迹", exact: true }).click();
  await page.waitForTimeout(700);
  if (await page.locator(".error-text, .error-banner").count())
    throw new Error("Demo error.");
  const screenshot = await page.screenshot();
  const screens = { "zh-CN": `data:image/png;base64,${screenshot.toString("base64")}` };
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByLabel("界面语言").selectOption("en");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  screens.en = `data:image/png;base64,${(await page.screenshot()).toString("base64")}`;
  const fontData = (
    await readFile(
      join(
        root,
        "node_modules/@fontsource/public-sans/files/public-sans-latin-700-normal.woff2",
      ),
    )
  ).toString("base64");
  const bodyFontData = (
    await readFile(
      join(
        root,
        "node_modules/@fontsource/public-sans/files/public-sans-latin-400-normal.woff2",
      ),
    )
  ).toString("base64");
  const mark = `<svg viewBox="0 0 140 140" width="112" height="112" fill="none">
    <rect width="140" height="140" rx="31" fill="#15191f"/>
    <path d="M37 106L58 62L101 30M58 62L108 83" stroke="#d9e2ed" stroke-width="4" stroke-linecap="round"/>
    <circle cx="37" cy="106" r="7" fill="#72a8ed"/><circle cx="58" cy="62" r="7" fill="#edf1f6"/>
    <circle cx="101" cy="30" r="7" fill="#edf1f6"/><circle cx="108" cy="83" r="7" fill="#edf1f6"/>
  </svg>`;
  await page.setViewportSize({ width: 1440, height: 760 });
  for (const lang of ["zh-CN", "en"]) {
    const zh = lang === "zh-CN";
    await page.setContent(`<!doctype html><html lang="${lang}"><meta charset="utf-8">
      <style>
      @font-face{font-family:Public;src:url(data:font/woff2;base64,${fontData});font-weight:700}
      @font-face{font-family:Public;src:url(data:font/woff2;base64,${bodyFontData});font-weight:400}
      *{box-sizing:border-box}body{margin:0;background:#263341;color:#f0f3f6;font-family:Public,"PingFang SC",sans-serif}
      main{width:1440px;height:760px;display:grid;grid-template-columns:386px 1fr;padding:48px;gap:34px}
      .brand{display:flex;flex-direction:column;align-items:flex-start}
      h1{font-size:68px;line-height:1.02;letter-spacing:-3px;margin:30px 0 24px;font-weight:700}
      .tagline{font-size:${zh ? 27 : 28}px;line-height:1.5;margin:0;color:#f0f3f6}
      .description{font:18px/1.7 Public,"PingFang SC",sans-serif;color:#c1cedc;margin:20px 0 0}
      .platform{margin-top:auto;font-size:16px;color:#c1cedc;line-height:1.8}
      .platform b{color:#f0f3f6}.preview{align-self:center;min-width:0}
      .screen{overflow:hidden;border-radius:13px;border:1px solid #526070;background:#151519}
      .chrome{height:30px;display:flex;gap:6px;align-items:center;padding:0 12px;background:#31363d}
      .chrome i{width:8px;height:8px;border-radius:50%;background:#72808e}.chrome span{margin:auto;font-size:11px;color:#cbd3db;padding-right:38px}
      img{width:100%;display:block}.features{display:flex;justify-content:space-between;padding-top:23px;font-size:18px;color:#e0e8f2}
      .features span{display:flex;align-items:center;gap:9px}.features i{width:5px;height:5px;background:#83b2ef;border-radius:50%}
      .note{margin:18px 0 0;text-align:right;font:13px/1.5 Public,"PingFang SC",sans-serif;color:#a9b8c8}
      </style><main><div class="brand">${mark}<h1>C3D<br>Reader</h1>
      <p class="tagline">${zh ? "看见动作，<br>读懂数据。" : "Explore motion.<br>Inspect your data."}</p>
      <p class="description">${zh ? "本地 C3D 动作数据工作台<br>打开文件，查看信号，导出 CSV。" : "A local C3D motion workspace.<br>Open, inspect and export."}</p>
      <p class="platform"><b>macOS 14+ · Apple Silicon</b><br>${zh ? "开源 · 本地处理 · 只读访问" : "Open source · Local processing · Read-only"}</p></div>
      <div class="preview"><div class="screen"><div class="chrome"><i></i><i></i><i></i><span>C3D Reader · Synthetic walking</span></div><img src="${screens[lang]}"></div>
      <div class="features">${(zh ? ["3D 标记点", "同步信号与事件", "全采样率 CSV"] : ["3D markers", "Signals & events", "Full-rate CSV"]).map((t) => `<span><i></i>${t}</span>`).join("")}</div>
      <p class="note">${zh ? "真实界面 · 合成步行数据" : "Actual interface · Synthetic walking data"}</p></div></main></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(output, `overview.${lang}.png`) });
  }
  await context.close();

  // Record UI interaction, not an animated mockup. Only the synthetic acquisition is open.
  const videoContext = await browser.newContext({
    viewport: { width: 1280, height: 860 },
    recordVideo: { dir: scratch, size: { width: 1280, height: 860 } },
  });
  const demo = await videoContext.newPage();
  await demo.setContent(`<!doctype html><html><meta charset="utf-8"><style>
    body{margin:0;background:#171719;font-family:"Public Sans","PingFang SC",sans-serif;color:#eef0f3}
    header{height:60px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;padding:0 24px;border-bottom:1px solid #41414a}
    b{font-size:18px}span{font-size:16px;color:#a9c8ef}iframe{border:0;width:1280px;height:800px;display:block}
    </style><header><b>C3D Reader · Demo</b><span id="chapter">3D playback / 三维播放</span></header><iframe src="${url}"></iframe></html>`);
  const app = demo.frameLocator("iframe");
  await app.getByRole("heading", { name: "Synthetic walking" }).waitFor();
  await app.locator(".signal-plot path").nth(1).waitFor();
  await demo.waitForTimeout(700);
  const start = Date.now();
  const video = demo.video();
  const chapter = (text) =>
    demo.locator("#chapter").evaluate((node, text) => {
      node.textContent = text;
    }, text);
  await app.getByRole("button", { name: "播放", exact: true }).click();
  await demo.waitForTimeout(3500);
  await app.getByRole("button", { name: "暂停", exact: true }).click();
  await chapter("Views & marker trails / 视角与标记点轨迹");
  await app
    .getByRole("combobox", { name: "视角", exact: true })
    .selectOption("side");
  await app.getByRole("button", { name: "轨迹", exact: true }).click();
  await app.getByRole("button", { name: "播放", exact: true }).click();
  await demo.waitForTimeout(2200);
  await app.getByRole("button", { name: "暂停", exact: true }).click();
  await app
    .getByRole("combobox", { name: "视角", exact: true })
    .selectOption("perspective");
  await chapter("Analog signals at 1,000 Hz / 模拟信号");
  await app.getByRole("tab", { name: "模拟4", exact: true }).click();
  await app
    .getByRole("button", { name: "Left force Fz N", exact: true })
    .click();
  await app.locator(".signal-heading").getByText("1000 Hz").waitFor();
  await app.getByRole("button", { name: "播放", exact: true }).click();
  await demo.waitForTimeout(2800);
  await app.getByRole("button", { name: "暂停", exact: true }).click();
  await chapter("Gait event navigation / 步态事件定位");
  await app.getByRole("tab", { name: "事件", exact: true }).click();
  await app.locator(".event-row").first().click();
  await demo.waitForTimeout(1800);
  await chapter("Full-resolution CSV export / 全采样率导出");
  await app.getByRole("button", { name: "导出 CSV", exact: true }).click();
  await app.getByRole("dialog").getByText("8,000", { exact: true }).waitFor();
  await demo.waitForTimeout(2200);
  const downloadPromise = demo.waitForEvent("download");
  await app.getByRole("link", { name: "下载 CSV", exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs(join(scratch, "demo-analog.csv"));
  await chapter("Theme & language settings / 主题与语言设置");
  await app.getByRole("button", { name: "设置", exact: true }).click();
  await app.getByLabel("主题", { exact: true }).selectOption("light");
  await app.getByLabel("界面语言").selectOption("en");
  await demo.waitForTimeout(1800);
  await app.getByRole("button", { name: "Done", exact: true }).click();
  await chapter("Resizable workspace / 可调整工作区");
  const divider = app.getByRole("separator", { name: "Resize 3D and signal panels" });
  await divider.focus();
  for (let i = 0; i < 5; i++) { await divider.press("ArrowUp"); await demo.waitForTimeout(120); }
  await demo.waitForTimeout(1200);
  await chapter("Synthetic data only / 仅使用合成数据");
  await demo.waitForTimeout(900);
  const duration = (Date.now() - start) / 1000;
  // The video begins at page creation; omit startup frames before the first chapter.
  const total = await demo.evaluate(() => performance.now() / 1000);
  await videoContext.close();
  const rawVideo = await video.path();
  const trim = Math.max(0, total - duration);
  const encode = (args) => {
    const result = spawnSync(
      ffmpeg,
      ["-y", "-hide_banner", "-loglevel", "error", ...args],
      { stdio: "inherit" },
    );
    if (result.status !== 0) throw new Error("Demo encoding failed.");
  };
  encode([
    "-ss",
    String(trim),
    "-i",
    rawVideo,
    "-t",
    String(duration),
    "-vf",
    "fps=10,scale=1120:-2:flags=lanczos,setsar=1,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
    "-loop",
    "0",
    join(output, "demo.gif"),
  ]);
  encode([
    "-ss",
    String(trim),
    "-i",
    rawVideo,
    "-t",
    String(duration),
    "-an",
    "-c:v",
    "libx264",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    join(output, "demo.mp4"),
  ]);
  console.log(`README images, GIF and MP4 written to ${output}`);
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
