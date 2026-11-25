/** Shared Python lookup for Electron, build scripts, and integration tests. */
const { execFileSync, spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");

let cached;
function resolvePython() {
  if (cached) return cached;
  if (process.env.C3D_READER_PYTHON) {
    cached = execFileSync(
      process.env.C3D_READER_PYTHON,
      ["-c", "import sys; print(sys.executable)"],
      { encoding: "utf8", timeout: 30000 },
    ).trim();
    return cached;
  }
  const name = process.env.C3D_READER_CONDA_ENV || "c3d-reader";
  const candidates = [
    process.env.CONDA_EXE,
    "conda",
    "/opt/homebrew/Caskroom/miniforge/base/bin/conda",
    ...["miniforge3", "miniconda3", "anaconda3"].map((folder) =>
      path.join(os.homedir(), folder, process.platform === "win32" ? "Scripts/conda.exe" : "bin/conda"),
    ),
  ];
  for (const executable of [...new Set(candidates.filter(Boolean))]) {
    try {
      const info = JSON.parse(execFileSync(executable, ["env", "list", "--json"], {
        encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"],
      }));
      const root = info.envs.find((prefix) => path.basename(prefix) === name && existsSync(path.join(prefix, "conda-meta")));
      if (!root) continue;
      const python = path.join(root, process.platform === "win32" ? "python.exe" : "bin/python");
      if (existsSync(python)) return (cached = python);
    } catch { /* Try the next known Conda installation. */ }
  }
  throw new Error(`缺少 Conda 环境 ${name}。请按 README 创建并安装依赖，或设置 C3D_READER_PYTHON。`);
}

module.exports = { resolvePython };
if (require.main === module) {
  const python = resolvePython();
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--print") console.log(python);
  else {
    const result = spawnSync(python, args, { stdio: "inherit" });
    if (result.error) throw result.error;
    process.exit(result.status ?? 1);
  }
}
