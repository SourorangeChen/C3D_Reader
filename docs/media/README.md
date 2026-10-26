# README media

- `overview.zh-CN.png` and `overview.en.png`: localized introduction graphics with the project's marker-and-segment logo and a screenshot of the real workbench.
- `demo.gif`: looping demonstration for GitHub README rendering.
- `demo.mp4`: higher-quality, smaller video alternative.
- `../screenshot.png`: full-size browser workbench capture.
- `../desktop.jpg`: native Electron workbench capture, regenerated with `--desktop`.

The current README captures use a user-selected measured Vicon walking acquisition: 1228 frames at 250 Hz, with 296 analog channels at 2000 Hz. Markers, joint angles, force-plate signals, EMG and gait events come directly from C3D. Waveforms retain source units and signs; the recording does not synthesize, filter or replace them. Three-dimensional connections remain label-based display aids. XCP is camera-calibration data and is not needed to render the reconstructed C3D points.

The recorder uses a fresh configuration directory and a symbolic link named `Walking-trial.c3d` to the explicitly selected local file. It reads the source in place without copying or modifying it. Only the neutral alias appears in the workbench. The original name, patient folder and local path are absent from captures. Raw parameters are not recorded because they may contain identifying metadata. This hides visible identifiers in the media; it does not anonymize the original C3D. Original C3D / XCP files and CSV exports are not included in the repository.

The video shows 3D playback, views and marker trails, measured knee angles, force and EMG channels, event navigation, CSV export, theme/language settings and panel resizing. The native desktop capture uses the same isolated library. The application's built-in synthetic example remains available separately.

The banner layout, logo and text are drawn in HTML/CSS/SVG by `scripts/readme-media.mjs`; no external artwork is embedded. Public Sans is loaded from the project's existing font dependency. The reference image supplied for the design is not redistributed.

To regenerate on macOS from the repository root, install the project dependencies and Playwright Chromium, build the frontend, and provide an FFmpeg executable:

```sh
npm run build
npx playwright install chromium
# Reproduce the published measured-data media with the approved local recording:
C3D_MEDIA_SOURCE="/path/to/approved-recording.c3d" FFMPEG_BINARY=/path/to/ffmpeg node scripts/readme-media.mjs --desktop
# Without C3D_MEDIA_SOURCE, use the built-in synthetic acquisition instead:
FFMPEG_BINARY=/path/to/ffmpeg node scripts/readme-media.mjs
```

The selected measured recording must contain `LKneeAngles`, `Force.Fz2` and `Sensor 1.EMG1`; the recorder checks those labels rather than substituting synthetic channels. The script uses the project's `.venv/bin/python` and existing Python dependencies. FFmpeg is only a media-authoring dependency; it is not required by C3D Reader. Intermediate recordings are written to the ignored `.local/readme-media/` directory. The generated images, GIF and MP4 are intended for publication and are tracked in Git.
