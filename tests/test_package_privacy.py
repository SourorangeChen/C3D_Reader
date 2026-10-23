import zipfile
from importlib import metadata
from pathlib import Path

import pytest

pytest.importorskip("PyInstaller")
from scripts import package_privacy as privacy
from scripts.package_privacy import check_bundle_privacy, sanitize_runtime_metadata


def test_install_records_removed_without_losing_runtime_version(tmp_path):
    info = tmp_path / "example-1.0.dist-info"
    info.mkdir()
    (info / "METADATA").write_text("Name: example\nVersion: 1.0\n")
    (info / "LICENSE").write_text("Keep this license.")
    (info / "RECORD").write_text("/Users/private-build/cache/example.pyc,,\n")
    (info / "direct_url.json").write_text('{"url":"file:///Users/private-build/source"}')
    assert sanitize_runtime_metadata(tmp_path) == 2
    assert metadata.Distribution.at(info).version == "1.0"
    assert (info / "LICENSE").read_text() == "Keep this license."
    assert check_bundle_privacy(tmp_path, ["/Users/private-build"])["files"] == 2


def test_gate_checks_compressed_content_and_rejects_recordings(tmp_path):
    archive = tmp_path / "base_library.zip"
    with zipfile.ZipFile(archive, "w") as file:
        file.writestr("module.pyc", b"compiled fixture /Users/private-build/source")
    with pytest.raises(ValueError, match="Build-machine path"):
        check_bundle_privacy(tmp_path, ["/Users/private-build"])
    archive.unlink()
    (tmp_path / "recording.c3d").write_bytes(b"fixture")
    with pytest.raises(ValueError, match="Non-distributable file"):
        check_bundle_privacy(tmp_path, ["/Users/private-build"])


def test_anonymous_ci_home_exception_still_blocks_project_workspace(tmp_path, monkeypatch):
    monkeypatch.setenv("GITHUB_ACTIONS", "true")
    monkeypatch.setattr(privacy.Path, "home", classmethod(lambda cls: Path("/Users/runner")))
    monkeypatch.setattr(privacy, "ROOT", Path("/Users/runner/work/example"))
    member = tmp_path / "upstream.txt"
    member.write_text("/Users/runner/work/upstream-library/src/lib.rs")
    assert check_bundle_privacy(tmp_path)["files"] == 1
    member.write_text("/Users/runner/work/example/build/module.pyc")
    with pytest.raises(ValueError, match="Build-machine path"):
        check_bundle_privacy(tmp_path)
    monkeypatch.delenv("GITHUB_ACTIONS")
    member.write_text("/Users/runner/private/source")
    with pytest.raises(ValueError, match="Build-machine path"):
        check_bundle_privacy(tmp_path)
