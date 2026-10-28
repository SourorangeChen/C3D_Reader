# Build a relocatable one-directory service, then copy it into app Resources.
from pathlib import Path

root = Path(SPECPATH).parent
analysis = Analysis(
    [str(root / 'desktop' / 'server.py')],
    pathex=[str(root)],
    binaries=[(str(root / 'build' / 'pose-worker' / 'c3d-pose-worker'), 'native')],
    datas=[(str(root / 'frontend' / 'dist'), 'frontend/dist')],
    hiddenimports=['uvicorn.logging', 'uvicorn.loops.asyncio', 'uvicorn.protocols.http.h11_impl', 'uvicorn.lifespan.on'],
    hookspath=[], hooksconfig={}, runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'pytest', 'IPython'], noarchive=False,
)
pyz = PYZ(analysis.pure)
exe = EXE(pyz, analysis.scripts, [], exclude_binaries=True, name='c3d-service',
          debug=False, bootloader_ignore_signals=False, strip=False, upx=False,
          console=True, target_arch='arm64', codesign_identity=None, entitlements_file=None)
coll = COLLECT(exe, analysis.binaries, analysis.datas, strip=False, upx=False, name='c3d-service')
