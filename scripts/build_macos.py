"""Build a self-contained, locally ad-hoc signed Apple Silicon macOS app."""

import hashlib
import json
import platform
import shutil
import subprocess
import sys
import sysconfig
from importlib import metadata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(*args):
    subprocess.run(list(args), check=True, cwd=ROOT)


def collect_licenses():
    """Keep upstream runtime/font licenses in the distributed binary."""
    output = ROOT / "build" / "third-party-licenses"
    output.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / "LICENSE", output / "C3D-Reader-MIT.txt")
    python_license = Path(sysconfig.get_path("stdlib")) / "LICENSE.txt"
    if python_license.exists():
        shutil.copy2(python_license, output / "Python-LICENSE.txt")
    packages = [
        "c3d",
        "numpy",
        "fastapi",
        "starlette",
        "uvicorn",
        "pydantic",
        "pydantic-core",
        "annotated-types",
        "annotated-doc",
        "typing-extensions",
        "typing-inspection",
        "anyio",
        "idna",
        "h11",
        "click",
        "exceptiongroup",
        "importlib-metadata",
        "zipp",
        "pyinstaller",
    ]
    for name in packages:
        try:
            distribution = metadata.distribution(name)
        except metadata.PackageNotFoundError:
            continue
        for index, entry in enumerate(distribution.files or []):
            if any(
                term in entry.name.lower() for term in ["license", "licence", "copying", "notice"]
            ):
                source = distribution.locate_file(entry)
                if source.is_file():
                    destination = output / "python" / name / f"{index:04}-{entry.name}"
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(source, destination)
    for name in [
        "react",
        "react-dom",
        "three",
        "lucide-react",
        "@fontsource/public-sans",
        "@fontsource/ibm-plex-mono",
        "electron",
    ]:
        directory = ROOT / "node_modules" / name
        destination = output / "javascript" / name
        destination.mkdir(parents=True, exist_ok=True)
        for source in directory.glob("*"):
            if source.is_file() and "license" in source.name.lower():
                shutil.copy2(source, destination / source.name)
    shutil.copy2(
        ROOT / "node_modules/electron/dist/LICENSES.chromium.html",
        output / "Chromium-LICENSES.html",
    )


def main():
    if sys.platform != "darwin" or platform.machine() != "arm64":
        raise SystemExit("Build this target on an Apple Silicon Mac.")
    npm = shutil.which("npm")
    if not npm:
        raise SystemExit("Node.js is required on the build machine.")
    run(npm, "run", "build")
    assets = ROOT / "desktop" / "assets"
    assets.mkdir(parents=True, exist_ok=True)
    iconset = ROOT / "build" / "icon.iconset"
    iconset.parent.mkdir(parents=True, exist_ok=True)
    run("swift", str(ROOT / "scripts/make_icon.swift"), str(iconset))
    run("iconutil", "-c", "icns", str(iconset), "-o", str(assets / "icon.icns"))
    run(
        sys.executable,
        "-m",
        "PyInstaller",
        "--clean",
        "--noconfirm",
        "--distpath",
        "build/desktop-service",
        "--workpath",
        "build/pyinstaller",
        "desktop/service.spec",
    )
    # Electron's official installer can be skipped by restrictive npm script policies.
    if not (ROOT / "node_modules/electron/dist/Electron.app").exists():
        run("node", "node_modules/electron/install.js")
    collect_licenses()
    run(str(ROOT / "node_modules/.bin/electron-builder"), "--mac", "--arm64", "--publish", "never")
    bundle = ROOT / "release/mac-arm64/C3D Reader.app"
    run("codesign", "--verify", "--deep", "--strict", str(bundle))
    version = json.loads((ROOT / "package.json").read_text())["version"]
    archive = ROOT / "release" / f"C3D-Reader-{version}-macOS-arm64.zip"
    run("ditto", "-c", "-k", "--sequesterRsrc", "--keepParent", str(bundle), str(archive))
    disk_image = ROOT / "release" / f"C3D-Reader-{version}-macOS-arm64.dmg"
    run("hdiutil", "verify", str(disk_image))
    checksums = "".join(
        f"{hashlib.sha256(artifact.read_bytes()).hexdigest()}  {artifact.name}\n"
        for artifact in [disk_image, archive]
    )
    (ROOT / "release/SHA256SUMS.txt").write_text(checksums)
    print(f"\nApp: {bundle}\nDMG: {disk_image}\nArchive: {archive}", flush=True)


if __name__ == "__main__":
    main()
