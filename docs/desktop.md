# macOS desktop application — v0.3.1

The desktop build embeds the existing workbench in an Electron window and packages the Python service with PyInstaller. End users do not need Python, Node.js, a terminal or an external browser. The current deliverable targets Apple Silicon, macOS 14 and newer. It has an ad-hoc signature; it is not notarized or signed with an Apple Developer ID distribution certificate.

## Opening acquisitions

- A dropped disk-backed `File` crosses the isolated preload through `webUtils.getPathForFile`, then a restricted IPC call passes its path to the main process.
- The main process validates that path and calls the private service with a per-launch token. C3D parsing succeeds before the library folder or active acquisition changes. Recordings are neither uploaded nor copied into the bundle.
- Native “Open” and “Open folder” dialogs, Finder `open-file`, initial command-line file arguments and subsequent open-file events all reach the same serialized opening path. Chinese names, spaces and uppercase `.C3D` extensions are covered by tests.
- Finder events that arrive before renderer readiness are queued. The selected acquisition wins over the default demo even on a cold launch.
- The app registers `.c3d` as a Viewer with Alternate rank. It does not replace an existing default application without the user's choice.

## Service and window lifecycle

The service binds an OS-assigned loopback port and reports readiness over stdout. The main process waits before loading the window. The frontend and fonts load only from that service; renderer navigation, popups, permission requests and external network requests are denied. Node integration is off; context isolation and renderer sandboxing are on. IPC checks the sender's window, main frame and origin.

Quitting closes the service, with a bounded forced-stop fallback. A parent-process watcher also shuts it down if the main process disappears. Settings and local error logs belong in the application support directory, not the app bundle. The existing browser workflow remains available separately.

## Settings, layout and batch exports

Settings is available from the app menu (⌘,) and the bottom-left toolbar. Themes cover native dialogs, controls, WebGL and charts. Interface language changes immediately; standard macOS menu roles retain the system language. The main process validates and atomically stores `preferences.json` separately from the selected folder. Persistence does not depend on the service's random origin. The browser version uses localStorage. Side-panel widths and the 3D / signal proportion are saved, constrained at small window sizes, and resettable. Dividers support pointer capture, cancellation, arrow keys, Home / End and Enter.

Batch export snapshots the current directory and runs one background worker. It writes full-resolution CSVs in bounded chunks, stages one acquisition at a time, and creates a ZIP with a JSON manifest; errors expose filenames without absolute paths or raw OS errors. Corrupt acquisitions are skipped. CSV and ZIP writing are cancellable. Completed files expire after 30 idle minutes, are replaced by a new batch, and are removed at normal shutdown. Native downloads use the macOS save dialog. Exports preserve source labels and filenames, so they are not anonymous datasets.

The main CSV dialog now defaults to all point channels and the full acquisition. It offers a COM-only mode, the selected channel, all analog channels, and an optional observation range. COM identification uses exact normalized source labels, with 3D COM and floor projection distinguished; it does not estimate or recompute values. Existing direct export links retain selected-channel behavior for compatibility.

## Verification on the development Mac

- 42 Python/API/packaging regression tests, including authorization, direct file registration, invalid-drop preservation and package privacy checks.
- 14 browser regression tests.
- 8 Electron integration tests, run against both the development launcher and the **packaged app**: native-backed drag/drop, running-app Finder events, native dialog selection, cold launch with a file, invalid-extension handling child-service shutdown, native Settings and preference persistence across app restarts / changing ports, native batch ZIP downloads, and full-point CSV downloads including source COM.
- The packaged Python executable was tested with the synthetic walking acquisition: 800 point frames, 35 markers and 4 analog channels, generated from `backend/demo.py`. Its bundled frontend, final frame and full-rate CSV export were checked without participant files.
- `codesign --verify --deep --strict` passed. This verifies local signature consistency, not Developer ID trust or notarization.

The icon is drawn from the existing marker-and-segment brand by `scripts/make_icon.swift`. `scripts/build_macos.py` freezes the service, embeds assets, builds and signs the app, then creates a DMG, ZIP and checksums. The DMG includes an Applications link for drag-to-install and is verified with `hdiutil verify`. Build outputs are ignored by Git; only the standalone application DMG, ZIP and checksum file should be attached to a release. Source `.c3d` files, settings, recent-file state and local logs are excluded.

Before signing, `scripts/package_privacy.py` removes `.dist-info/RECORD` and `direct_url.json`. Runtime package versions, dependency metadata and licenses remain available. The build then checks the signed bundle's regular files, ZIP members and decompressed frozen Python modules for its source/home paths, common credential formats and non-distributable filenames. The check reports package member names without echoing matched private values. On GitHub Actions, the generic `/Users/runner` or `/home/runner` home prefix is exempt because upstream wheels can contain that same anonymous account; this project's full workspace is always blocked. Personal build homes remain blocked outside that exception. Upstream runtime build paths are not personal paths belonging to this project's builder; identifier detection still requires manual review. Use `npm run desktop:build -- --output .local/desktop-build` to choose an isolated output directory.

## Packaging references

- [Electron webUtils](https://www.electronjs.org/docs/latest/api/web-utils): native path access from an isolated preload.
- [electron-builder macOS configuration](https://www.electron.build/v26/docs/mac/): file associations, ad-hoc signing and entitlements.
- [PyInstaller operating model](https://pyinstaller.org/en/stable/operating-mode.html): bundled interpreter and platform-specific artifacts.
