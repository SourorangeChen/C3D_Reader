# Local video and image synchronization

The comparison area extends the current scientific workbench: the marker scene
and source media sit side by side above the existing signal and shared timeline.
At narrow widths they stack. Existing Public Sans / IBM Plex Mono typography and
theme tokens are retained: ground #1b1b1e, surface #111113, text #f5f5f7, muted
#b3b3bd, blue #72aef8. Controls describe source time, original frame and alignment
provenance; there are no new decorative cards or changes to the existing palette.

## Timing contract

This feature adapts the timing and bounded signed-correlation approach from the
user's COM workspace: `src/validation/validation_signals.py`,
`docs/methods/validation/Validation_Methodology.md` section C, and the
`patient-vicon-validation` synchronization reference. It is a viewer integration,
not the COM pose/clinical validation pipeline. It does not run PCT or SAM2,
and does not import recording-specific example constants.

```
C3D relative time = (original frame - firstFrame) / pointRate
video PTS = timestamp baseline + overall lag + C3D relative time
timestamp baseline = Capture start - video recording start
                     - Vicon clock advance + (firstFrame - 1) / pointRate
```

Positive lag selects later video moments. Negative baselines are retained.
Capture timestamps must carry a timezone and are distinct from Calibration or
filesystem modification times. Unknown device clock advance is not assumed zero.
Manual anchoring identifies the combined offset, not physical clock difference.
COM trial results must belong to the same continuous recording before their
accepted corrections can be summarized; different recordings must not be mixed.

Synchronized video is the playback clock: `requestVideoFrameCallback.mediaTime`
drives the C3D cursor, with `video.currentTime` as a fallback. Paused C3D seeks
position the video. A configurable PTS origin maps external raw PTS onto the
browser media timeline when their origins differ. No fixed video FPS is assumed.
Native browser codec support applies; unsupported files show an actionable error.

Image filenames retain source frame numbers, including gaps. Timing uses the
user's FPS for that recording and explicit zero/one-based numbering, or a CSV with
`frame,video_pts_s` (zero-based source frame). Missing image moments are blank;
the remaining files are not compacted into consecutive frames. Imported image
PTS is preferred for variable frame rate. A single timestamp cannot establish
an image frame interval; supply FPS or a sequence with additional timing evidence.

Playback loops within the intersection of source coverage and the C3D observation
range. Seeking outside coverage reports the mismatch, without pretending an
endpoint image is valid. Media is reselected on a C3D acquisition change so an
unrelated recording cannot silently inherit synchronization.

## Alignment methods and limitations

- Automatic motion matching (macOS desktop): importing a video starts local
  Apple Vision body-pose recognition. Images start after their FPS or PTS is
  supplied. The matcher adapts COM's normalized, confidence-weighted 3D-to-2D
  camera fitting (`align_video_vicon_signals.py`) across constant time offsets.
  It searches the whole media at coarse resolution, then refines the best
  candidates using denser actual decoded timestamps. Vicon Plug-in Gait joint
  centers are preferred; named anatomical skin markers are an explicit fallback.
  The selected observation range must be 2–60 seconds, and media at most one hour.
  Shoulders, hips, knees and ankles drive fitting; arm joints are diagnostic
  holdouts. Acceptance requires >=90% fit coverage, torso-normalized error <=0.2,
  signed motion correlation >=0.5, observable motion, and >=10% error separation
  from a competing candidate at least 0.5 seconds away. Boundary matches are
  rejected. Accepted offsets are applied automatically and marked for visual
  review. Repetitive walking, occlusion, missing joint channels and multiple
  people may prevent a reliable result; no zero-offset fallback is called aligned.
  Rejected candidates can be previewed explicitly. Retry uses the current ROI
  and selected subject position. Cancelling, replacing media, manual alignment,
  or closing the panel prevents stale results from applying.
- Automatic results are auxiliary viewer synchronization, not PCT outputs or
  clinical validation. The fitted camera and arm error are diagnostics, not
  independent calibration/accuracy claims. There is no drift or time-warp fit.
  The 0.01-second refinement grid is not a confidence interval. Review the first,
  middle and last actions against the actual video before downstream use.
- Manual anchor: independently preview a video/image and select the matching
  C3D frame; one constant offset is used thereafter.
- COM JSON: use `overall_lag_s` and the explicitly selected trial's
  `timestamp_only_start_s`. If the root lag is absent, only rows marked
  `accepted` contribute their `residual_correction_s` median. Never apply each
  trial's intermediate fitted correction as a separate final lag.
- Signal search: import an independently computed CSV with `video_pts_s` and
  numeric signal columns. `evaluation_valid=false/0` is retained as missing.
  Select a comparable Vicon channel, axis and predefined direction. Search a
  bounded constant lag using signed Pearson correlation, at least 95% coverage,
  correlation >= 0.5, and a competing-peak margin >= 0.02 at separation >= 0.25 s.
  Search/coverage-boundary maxima are rejected. Do not interpolate through null
  samples or gaps beyond the configured maximum. A candidate requires explicit
  application and subsequent visual review. Search step is not a synchronization
  confidence interval; repeated motion can be ambiguous. There is no DTW or
  automatic drift correction.

Signal searches use the full source samples in the selected observation range,
not the plot envelope. Request and work limits keep local service use bounded;
large requests should narrow the observation/search interval or increase step.
No claim of independent validation follows when the same signal is used for
alignment and later evaluation.

Files are selected with the platform/browser picker and played through local blob
URLs. Automatic recognition passes selected file paths through the private
desktop bridge to the local native worker, which reads the originals without
copying them. No media is uploaded. Signal arrays go only to the local service.
The worker is bundled and uses system Vision/AVFoundation frameworks; no model
download or Python pose dependency is required. Exported `c3d-video-sync.json` records timing and source names,
without absolute paths or source media. No files in the COM workspace are changed.
Profiles validate acquisition metadata and media names/sizes on import. Image
profiles also check all frame numbers and timestamps against the selected
sequence; reselect its original FPS / PTS settings before importing the profile.
Signal-search profiles include the selected channel, interval, quality settings
and diagnostic curve. These checks are metadata checks, not content hashes.
Automatic profiles include joint/model provenance, candidate scores, coverage,
correlation, camera fit, frame range, and a pending visual-review flag. Browser
mode keeps manual, COM-profile and CSV methods; native recognition requires macOS.
