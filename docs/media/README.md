# README media

- `overview.zh-CN.png` and `overview.en.png`: localized introduction graphics with the project's marker-and-segment logo and the synthetic workbench example.
- `demo.gif`: looping demonstration for GitHub README rendering.
- `demo.mp4`: higher-quality video of the same synthetic demonstration.
- `../screenshot.png`: browser workbench capture using the synthetic example.
- `../desktop.jpg`: native Electron workbench capture of the synthetic example, regenerated with `--desktop`.

All current published media use the deterministic synthetic acquisition generated
by `backend/demo.py`: 800 frames at 100 Hz, with four illustrative analog channels
at 1000 Hz. Markers, force signals, EMG bursts, events and COM channels are generated
examples, not participant measurements or clinical validation outputs.

The recorder creates a fresh configuration directory with an empty library and
checks that only the built-in synthetic acquisition is selected. It rejects a
nonempty `C3D_MEDIA_SOURCE` environment variable before generating any output.
It does not open, alias or copy an external recording. Personal recordings,
parameters, video frames and local paths are excluded from published media.

The banner layout, logo and text are drawn in HTML/CSS/SVG by
`scripts/readme-media.mjs`; no external artwork is embedded. Public Sans comes
from the project's existing font dependency. The reference image supplied for
the design is not redistributed.

To regenerate on macOS after installing the project dependencies and Playwright
Chromium, build the frontend and provide a local FFmpeg executable:

```sh
npm run build
FFMPEG_BINARY=/path/to/ffmpeg node scripts/readme-media.mjs --desktop
```

The script uses the project's `.venv/bin/python` and existing Python dependencies.
FFmpeg is only a media-authoring dependency; it is not required by C3D Reader.
Intermediate recordings are written to the ignored `.local/readme-media/`
directory. Generated images, GIF and MP4 are intended for publication and tracked
in Git. Replacing current media does not erase media in older Git commits.
