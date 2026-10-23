"""Remove installation-only metadata and reject private material in desktop bundles.

This checks the builder's own source/home paths, not every possible identifier.
It does not import or execute the packaged application or its embedded modules.
"""

import os
import re
import zipfile
from pathlib import Path

from PyInstaller.archive.readers import CArchiveReader

ROOT = Path(__file__).resolve().parents[1]
DATA_SUFFIXES = {".c3d", ".csv", ".tsv", ".xcp", ".vsk", ".vst", ".dcm", ".nii", ".log"}
SECRET = re.compile(
    rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|"
    rb"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|"
    rb"AKIA[0-9A-Z]{16}|sk-(?:proj-|ant-)[A-Za-z0-9_-]{20,})\b"
)


def sanitize_runtime_metadata(runtime):
    """Keep package metadata/licenses; discard build-machine installation records."""
    removed = 0
    for directory in Path(runtime).rglob("*.dist-info"):
        if not directory.is_dir() or directory.is_symlink():
            continue
        for name in ["RECORD", "direct_url.json"]:
            path = directory / name
            if path.is_file() and not path.is_symlink():
                path.unlink()
                removed += 1
    return removed


def check_bundle_privacy(bundle, forbidden_roots=None):
    """Inspect files, ZIP members and frozen Python bytecode before publication.

    Error messages identify the package member, never the matched private value.
    Upstream runtime build paths unrelated to this builder are outside this gate.
    """
    bundle = Path(bundle)
    if forbidden_roots is not None:
        roots = forbidden_roots
    else:
        roots = [ROOT]
        home = Path.home()
        # Hosted wheels can contain the same generic account used by GitHub CI.
        # Always reject this project's workspace; exempt only that anonymous home.
        anonymous_ci_home = os.environ.get("GITHUB_ACTIONS") == "true" and str(home) in {
            "/Users/runner", "/home/runner",
        }
        if not anonymous_ci_home:
            roots.append(home)
    needles = {
        str(root).rstrip("/").encode(encoding)
        for root in roots
        for encoding in ["utf-8", "utf-16-le", "utf-16-be"]
        if len(str(root).rstrip("/")) > 1
    }
    files = modules = 0

    def inspect(data, member):
        if any(needle in data for needle in needles):
            raise ValueError(f"Build-machine path in package member: {member}")
        if SECRET.search(data):
            raise ValueError(f"Credential-like content in package member: {member}")

    for path in bundle.rglob("*"):
        if path.is_symlink() or not path.is_file():
            continue
        member = str(path.relative_to(bundle))
        if (
            path.suffix.lower() in DATA_SUFFIXES
            or path.name in {"settings.json", ".DS_Store"}
            or path.name.startswith(".env")
            or (path.parent.name.endswith(".dist-info") and path.name in {"RECORD", "direct_url.json"})
        ):
            raise ValueError(f"Non-distributable file in package: {member}")
        files += 1
        inspect(path.read_bytes(), member)
        if path.suffix == ".zip":
            with zipfile.ZipFile(path) as archive:
                for entry in archive.infolist():
                    if not entry.is_dir():
                        inspect(archive.read(entry), f"{member}!{entry.filename}")
        if path.name == "c3d-service":
            archive = CArchiveReader(str(path))
            for name, entry in archive.toc.items():
                if entry[-1] == "z":
                    pyz = archive.open_embedded_archive(name)
                    for module in pyz.toc:
                        data = pyz.extract(module, raw=True)
                        if data:
                            modules += 1
                            inspect(data, f"{member}!{module}")
                elif entry[-1] == "s":
                    modules += 1
                    inspect(archive.extract(name), f"{member}!{name}")
    return {"files": files, "frozen_modules": modules}
