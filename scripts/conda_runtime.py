"""Resolve the C3D Reader Conda interpreter without creating a venv."""

import json
import os
import shutil
import subprocess
from pathlib import Path


def python_executable():
    override = os.environ.get("C3D_READER_PYTHON")
    if override:
        candidate = shutil.which(override) or str(Path(override).expanduser())
        if not Path(candidate).is_file():
            raise RuntimeError("C3D_READER_PYTHON does not point to a Python executable.")
        return Path(candidate)

    name = os.environ.get("C3D_READER_CONDA_ENV", "c3d-reader")
    candidates = [
        os.environ.get("CONDA_EXE"),
        shutil.which("conda"),
        "/opt/homebrew/Caskroom/miniforge/base/bin/conda",
        *[str(Path.home() / folder / "bin/conda") for folder in
          ("miniforge3", "miniconda3", "anaconda3")],
    ]
    for executable in dict.fromkeys(filter(None, candidates)):
        if not Path(executable).is_file():
            continue
        try:
            result = subprocess.run(
                [executable, "env", "list", "--json"],
                capture_output=True, text=True, check=True, timeout=30,
            )
            prefixes = json.loads(result.stdout).get("envs", [])
        except (OSError, ValueError, subprocess.SubprocessError):
            continue
        for prefix in prefixes:
            root = Path(prefix)
            python = root / ("python.exe" if os.name == "nt" else "bin/python")
            if root.name == name and (root / "conda-meta").is_dir() and python.is_file():
                return python
    raise RuntimeError(
        "C3D Reader needs its Conda environment. Run: "
        f"conda create -n {name} python=3.9 pip; conda activate {name}; "
        "python -m pip install -r requirements-dev.txt -r requirements-desktop.txt"
    )
