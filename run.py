#!/usr/bin/env python3
"""Bootstrap and launch C3D Reader, bound to this machine only."""

import argparse
import importlib.util
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
import venv
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description="C3D Reader — local motion capture workspace")
    parser.add_argument("--data", type=Path, help="Folder containing .c3d files")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--rebuild", action="store_true", help="Rebuild frontend assets")
    args = parser.parse_args()
    if args.data and not args.data.expanduser().is_dir():
        parser.error("The data folder does not exist or is not mounted.")
    if not 1 <= args.port <= 65535:
        parser.error("Port must be between 1 and 65535.")
    os.chdir(ROOT)
    python = ROOT / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if sys.prefix == sys.base_prefix:
        if not python.exists():
            print("Creating the local Python environment…", flush=True)
            venv.EnvBuilder(with_pip=True).create(ROOT / ".venv")
        subprocess.check_call([str(python), "-m", "pip", "install", "-r", "requirements.txt"])
        os.execv(str(python), [str(python), str(ROOT / "run.py"), *sys.argv[1:]])
    if importlib.util.find_spec("fastapi") is None or importlib.util.find_spec("c3d") is None:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
    if args.rebuild or not (ROOT / "frontend/dist/index.html").exists():
        npm = shutil.which("npm")
        if not npm:
            raise SystemExit(
                "Node.js 22.12+ or 24+ is required for the first build. Install it from https://nodejs.org/ then rerun."
            )
        if not (ROOT / "node_modules").exists():
            subprocess.check_call([npm, "ci"])
        subprocess.check_call([npm, "run", "build"])
    if args.data:
        os.environ["C3D_READER_DATA"] = str(args.data.expanduser().resolve())
    url = f"http://127.0.0.1:{args.port}"
    print(f"\nC3D Reader: {url}\nPress Ctrl+C to stop.\n", flush=True)
    if not args.no_browser:

        def open_when_ready():
            for _ in range(80):
                try:
                    with urllib.request.urlopen(url + "/api/health", timeout=0.3) as response:
                        if response.status == 200:
                            webbrowser.open(url)
                            return
                except OSError:
                    time.sleep(0.15)

        threading.Thread(target=open_when_ready, daemon=True).start()
    import uvicorn

    uvicorn.run("backend.app:app", host="127.0.0.1", port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
