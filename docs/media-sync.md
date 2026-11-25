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

The comparison toolbar keeps displayed video PTS, source video frame number and
original Vicon frame number together above both views, including enlarged mode.
Mediabunny reads local packet metadata to index video frames in presentation
order; `requestVideoFrameCallback` identifies the picture actually on screen.
Video indices start at zero and do not use nominal FPS or `presentedFrames`
counters. Unreadable indexes remain unavailable while time seeking still works.
Images keep their filename frame numbers and missing samples stay blank.

Seeking a video frame selects its actual PTS and the nearest Vicon sample. When
Vicon samples are coarser than the video, the explicitly selected video picture
is retained while paused; subsequent Vicon stepping resumes timestamp mapping.
The separate video and Vicon step controls respect each source's sampling.
Earlier/later image adjustments pause playback, hold the Vicon frame and change
the offset by one Vicon sample interval; undo restores the mapping from before
the adjustment sequence. These edits retain the visual-review status.

Image filenames retain source frame numbers, including gaps. Timing uses the
user's FPS for that recording and explicit zero/one-based numbering, or a CSV with
`frame,video_pts_s` (zero-based source frame). Missing image moments are blank;
the remaining files are not compacted into consecutive frames. Imported image
PTS is preferred for variable frame rate. A single timestamp cannot establish
an image frame interval; supply FPS or a sequence with additional timing evidence.

Playback loops within the intersection of source coverage and the C3D observation
range. Seeking outside coverage reports the mismatch, without pretending an
endpoint image is valid. On macOS, importing a video matches **only the currently
selected trial and observation interval**. Once that reference supplies a reliable
lag, all other C3D trials currently listed in the folder (up to 200) share it
directly. The demo remains a separate scope. There is no per-trial pose extraction,
search, scoring, consensus or training-identity test for the other trials.

The reference uses the existing coarse/fine Apple Vision joint-camera fit and
motion reliability checks. It needs a usable 2–60 second observation interval.
An ambiguous or rejected reference leaves every trial unaligned; the app asks
the user to select another trial and retry instead of automatically scanning
other trials. The retry button uses the newly selected trial and its current ROI.
A successfully recalculated reference replaces the shared lag for the folder.

```
trial baseline = (firstFrame - 1) / pointRate
shared lag = reference combined offset - reference baseline
video PTS = trial baseline + shared lag + C3D relative time
          = (original Vicon frame - 1) / pointRate + shared lag
```

Other trials require only readable C3D timing metadata; missing joint channels
or a different action do not prevent sharing. Their first-frame baselines may
differ, but their lag is exactly the reference lag. A trial whose timing metadata
cannot be read is marked unreadable. Video coverage is checked during playback;
source moments outside the recording remain unavailable. Sharing does not claim
that another trial's motion was matched or that its training identity was verified.
The file list and scope list distinguish “Reference matched” from “Shared lag”.
Exported evidence identifies the reference and records `motionChecked=false` for
shared trials, without copying reference correlation into their own motion score.

Trial switching and closing the panel do not cancel the app-owned task or rerun
recognition. Replacing the video, cancelling, or choosing manual mode cancels an
active task, and late responses cannot overwrite the next selection. The video,
reference provenance and mappings remain available in the current app session.
Starting a new reference match clears previous associations. C3D revisions prevent
restoring stale mappings after source changes. Media object URLs are released
when the app session ends; exported alignment JSON is the durable handoff.

The comparison toolbar displays the shared lag. Per-trial nudge controls are
hidden in this automatic sharing mode to keep the lag identical. Manual alignment
remains an explicit alternative for the current trial. Image sequences retain
their existing per-trial matching workflow; browser mode supports manual alignment
without native recognition.

Starting media playback enlarges the video area beside the 3D view, temporarily
hiding setup controls and the signal chart. The shared timeline stays available;
synced playback also has a play/pause button in the media heading. Pausing keeps
the enlarged view for frame inspection. Restore video size or Escape brings back
the previous layout without changing its saved panel proportions or alignment.
The heading also offers manual enlargement before playback. Media retains its
aspect ratio and is displayed without cropping.

## Alignment methods and limitations

The panel separates automatic and manual alignment. The macOS desktop app
defaults to automatic matching; the browser defaults to manual anchors. Switching
to manual stops recognition and exposes independent media seeking and the apply
action. Changing image timing keeps the selected method. While recognition runs,
manual anchors and time-offset settings are hidden; selecting manual cancels the
job before editing. COM imports and numeric offsets are under More alignment
options. Trying a rejected candidate applies a provisional mapping marked for
review rather than presenting it as an accepted automatic result.

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
