const { app, BrowserWindow, dialog, ipcMain, Menu } = require("electron");
const { spawn } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const { createWriteStream, mkdirSync, existsSync } = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

let mainWindow, service, baseURL, serviceToken, logStream;
let rendererReady = false,
  quitting = false,
  pendingPaths = [],
  queue = Promise.resolve();
const root = path.join(__dirname, "..");
const launchedFiles = process.argv.filter(
  (arg) => /\.c3d$/i.test(arg) && path.isAbsolute(arg),
);
pendingPaths.push(...launchedFiles);

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("open-file", (event, filePath) => {
    event.preventDefault();
    pendingPaths.push(filePath);
    flushFiles();
  });
  app.on("second-instance", (_event, argv) => {
    pendingPaths.push(
      ...argv.filter((arg) => /\.c3d$/i.test(arg) && path.isAbsolute(arg)),
    );
    mainWindow?.show();
    mainWindow?.focus();
    flushFiles();
  });
  app
    .whenReady()
    .then(start)
    .catch((error) => {
      dialog.showErrorBox("C3D Reader 启动失败", error.message);
      app.quit();
    });
}

function checkSender(event) {
  if (
    !mainWindow ||
    event.sender !== mainWindow.webContents ||
    event.senderFrame !== mainWindow.webContents.mainFrame ||
    new URL(event.senderFrame.url).origin !== baseURL
  )
    throw new Error("Untrusted desktop request.");
}

async function serviceRequest(route, body) {
  const response = await fetch(baseURL + route, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Desktop-Token": serviceToken,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(60000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "无法读取文件。");
  return data;
}

async function openPath(filePath) {
  if (
    typeof filePath !== "string" ||
    !path.isAbsolute(filePath) ||
    !/\.c3d$/i.test(filePath)
  )
    throw new Error("请拖入一个 .c3d 文件。");
  const data = await serviceRequest("/api/desktop/open", { path: filePath });
  app.addRecentDocument(filePath);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("c3d:opened", data);
    mainWindow.setTitle(`${data.acquisition.name} — C3D Reader`);
    mainWindow.show();
    mainWindow.focus();
  }
}

function enqueueOpen(filePath) {
  const request = queue.then(() => openPath(filePath));
  queue = request.catch(() => {});
  return request;
}

function flushFiles() {
  if (!rendererReady || !baseURL) return;
  for (const filePath of pendingPaths.splice(0)) {
    void enqueueOpen(filePath).catch((error) => {
      mainWindow?.webContents.send("c3d:opened", { error: error.message });
    });
  }
}

async function chooseFile() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "打开 C3D 采集文件",
    properties: ["openFile"],
    filters: [{ name: "C3D Motion Capture", extensions: ["c3d"] }],
  });
  if (!result.canceled && result.filePaths[0])
    await enqueueOpen(result.filePaths[0]);
}

async function chooseFolder() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "选择 C3D 数据文件夹",
    properties: ["openDirectory"],
  });
  if (!result.canceled && result.filePaths[0]) {
    const library = await serviceRequest("/api/library", {
      path: result.filePaths[0],
    });
    mainWindow.webContents.send("c3d:opened", { library });
  }
}

function launchService() {
  serviceToken = randomBytes(32).toString("hex");
  const configDir =
    process.env.C3D_READER_CONFIG_DIR || app.getPath("userData");
  mkdirSync(configDir, { recursive: true });
  logStream = createWriteStream(path.join(configDir, "desktop.log"), {
    flags: "a",
  });
  const packaged = path.join(process.resourcesPath, "backend", "c3d-service");
  const python =
    process.env.C3D_READER_PYTHON || path.join(root, ".venv", "bin", "python");
  if (!app.isPackaged && !existsSync(python))
    throw new Error("开发环境缺少 .venv，请先安装 Python 依赖。");
  service = spawn(
    app.isPackaged ? packaged : python,
    app.isPackaged ? [] : [path.join(root, "desktop", "server.py")],
    {
      env: {
        ...process.env,
        C3D_READER_CONFIG_DIR: configDir,
        C3D_READER_DESKTOP_TOKEN: serviceToken,
        C3D_READER_PARENT_PID: String(process.pid),
        PYTHONUNBUFFERED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  service.stderr.pipe(logStream);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(new Error("本地读取服务未能在 45 秒内启动。请查看应用日志。")),
      45000,
    );
    const lines = readline.createInterface({ input: service.stdout });
    lines.on("line", (line) => {
      try {
        const message = JSON.parse(line);
        if (
          message.ready &&
          Number.isInteger(message.port) &&
          message.port > 0 &&
          message.port < 65536
        ) {
          baseURL = `http://127.0.0.1:${message.port}`;
          clearTimeout(timer);
          resolve();
        }
      } catch {
        logStream.write(line + "\n");
      }
    });
    service.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    service.on("exit", (code) => {
      clearTimeout(timer);
      if (!baseURL)
        reject(
          new Error(
            `本地读取服务退出（${code}），日志位于 ${configDir}/desktop.log`,
          ),
        );
      else if (!quitting) {
        dialog.showErrorBox(
          "读取服务已停止",
          "请重新打开 C3D Reader。文件没有被修改。",
        );
        app.quit();
      }
    });
  });
}

async function start() {
  await launchService();
  mainWindow = new BrowserWindow({
    title: "C3D Reader",
    width: 1440,
    height: 940,
    minWidth: 860,
    minHeight: 680,
    backgroundColor: "#171719",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== baseURL) event.preventDefault();
  });
  mainWindow.webContents.session.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  mainWindow.webContents.session.setPermissionCheckHandler(() => false);
  // All acquisition data and bundled fonts stay on the private loopback service.
  mainWindow.webContents.session.webRequest.onBeforeRequest(
    (details, callback) => {
      callback({
        cancel:
          !details.url.startsWith(baseURL + "/") &&
          !details.url.startsWith("devtools:"),
      });
    },
  );
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  ipcMain.handle("c3d:choose-file", (event) => {
    checkSender(event);
    return chooseFile();
  });
  ipcMain.handle("c3d:choose-folder", (event) => {
    checkSender(event);
    return chooseFolder();
  });
  ipcMain.handle("c3d:open-path", (event, filePath) => {
    checkSender(event);
    return enqueueOpen(filePath);
  });
  ipcMain.handle("c3d:ready", (event) => {
    checkSender(event);
    rendererReady = true;
    flushFiles();
  });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "C3D Reader",
        submenu: [
          { role: "about" },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      {
        label: "文件",
        submenu: [
          {
            label: "打开 C3D 文件…",
            accelerator: "CmdOrCtrl+O",
            click: () => void chooseFile().catch(showOpenError),
          },
          {
            label: "打开数据文件夹…",
            accelerator: "CmdOrCtrl+Shift+O",
            click: () => void chooseFolder().catch(showOpenError),
          },
          { type: "separator" },
          {
            role: "recentDocuments",
            submenu: [{ role: "clearRecentDocuments" }],
          },
          { type: "separator" },
          { role: "close" },
        ],
      },
      { role: "editMenu" },
      {
        label: "视图",
        submenu: [
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { type: "separator" },
          { role: "togglefullscreen" },
        ],
      },
      { role: "windowMenu" },
    ]),
  );
  await mainWindow.loadURL(baseURL);
  mainWindow.webContents.session.on("will-download", (_event, item) => {
    item.setSaveDialogOptions({
      title: "导出 C3D 信号 CSV",
      defaultPath: path.join(app.getPath("downloads"), item.getFilename()),
    });
  });
}

function showOpenError(error) {
  mainWindow?.webContents.send("c3d:opened", { error: error.message });
}
app.on("window-all-closed", () => app.quit());
app.on("before-quit", (event) => {
  if (!service || service.exitCode !== null || quitting) return;
  event.preventDefault();
  quitting = true;
  const timer = setTimeout(() => {
    service.kill("SIGKILL");
    app.quit();
  }, 3000);
  service.once("exit", () => {
    clearTimeout(timer);
    logStream?.end();
    app.quit();
  });
  service.kill("SIGTERM");
});
