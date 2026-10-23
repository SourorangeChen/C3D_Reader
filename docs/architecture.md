# Architecture and validation

## Data path

```mermaid
flowchart LR
    Disk[Local C3D file] --> Metadata[py-c3d metadata decoder]
    Disk --> Map[Read-only numpy memory map]
    Metadata --> Acquisition[Acquisition metadata and calibration]
    Map --> Acquisition
    Acquisition --> API[Loopback FastAPI service]
    API --> Frames[500-frame float32 blocks]
    API --> Signals[Min/max display envelopes]
    API --> CSV[Streaming full-resolution CSV]
    Frames --> Viewer[Three.js marker scene]
    Signals --> Chart[SVG time-series chart]
    Clock[Shared playback frame] --> Viewer
    Clock --> Chart
```

The service does not load the entire recording into an in-memory acquisition. A structured NumPy memory map describes interleaved point and analog samples. Bounds use approximately 150 sampled frames; series requests copy only the selected channels. The browser retains a small neighborhood of frame blocks, prefetches the next block, and advances in recording time. Browser rendering can skip intermediate acquisition frames at high sample rates; frame stepping and exports retain the source resolution.

An LRU retains up to three metadata / mapping objects. Frame ranges are zero-based and half-open in the API; the UI converts the original C3D frame numbers at its boundary. Point data is transmitted as little-endian float32, shape `[frames, points, xyz]`, with NaN coordinates for invalid samples. JSON endpoints use `null` for missing values.

Analog series retain sample-level times. A min/max envelope also keeps a missing sample per bin to preserve visible discontinuities. No analysis or CSV export uses that display envelope.

## Format adaptations

1. **Numbered parameter arrays.** Vicon can split arrays at 255 entries, including `LABELS2`, `SCALE2`, `OFFSET2` and `UNITS2`. Each family is concatenated before channel indexing. py-c3d 0.6 does not concatenate these analog arrays in its default frame transformation.
2. **Long frame counters.** `TRIAL:ACTUAL_START_FIELD` stores two unsigned 16-bit words. The high word is multiplied by 65,536, correcting py-c3d 0.6's 65,535 multiplier. The patched subclass changes only the metadata accessor; data decoding remains independently testable.
3. **Model outputs.** `POINT:ANGLES`, `FORCES`, `MOMENTS`, `POWERS` and `SCALARS` identify non-positional data. They appear in the model channel tab and retain their declared units rather than entering the 3D marker cloud.
4. **Vicon local coordinate points.** A documented list of common segment-axis labels is hidden by default and can be enabled. Other labels remain untouched. Unknown marker sets display as a point cloud; the app does not invent segments for them.

## Tests

The Python suite checks float and integer coordinate scaling, calibrated analogs, missing samples, extended analog arrays at channel 255, long frame counters, nonzero-start event timing, truncation rejection, binary/JSON agreement, API bounds, CSV sample counts / timestamps, envelope extrema and local-origin protection.

Files removed or changed during a session produce recoverable errors before a cached map is accessed. Reopening a changed file refreshes the acquisition. The development validation can be repeated without copying recordings: `python -m scripts.validate_local /path/to/Vicon` prints aggregate results only.

Browser tests exercise playback and looping, frame stepping, channel selection, analog CSV downloads, event navigation, missing point display, parameter inspection, recoverable folder errors and layout at 1440×900, 1280×720, 768×1024 and 390×844.

### Local Vicon sample validation — 2026-10-23

A private external-disk dataset was used locally; no recordings, participant identifiers, private paths or screenshots are distributed here.

| Check                                        | Result                                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Files inspected                              | 19                                                                                                     |
| Total on-disk data                           | 1,949,133,440 bytes                                                                                    |
| Largest acquisition                          | 644,722,896 bytes; 51,065 point frames                                                                 |
| Analog channels per file                     | 296                                                                                                    |
| Reference checks                             | First 3 frames via upstream py-c3d frame decoder, with numbered calibration arrays supplied explicitly |
| Independent random-access checks             | First, middle and last records via Python `struct`, including channels 254, 255 and 295                |
| Maximum sampled point difference             | 0                                                                                                      |
| Maximum sampled calibrated analog difference | 0                                                                                                      |
| Validation process peak RSS                  | Approximately 31.9 MiB on the development Mac                                                          |

This is sampled numerical verification, not a full-sample equivalence proof. The memory figure describes this validation process, not total browser + server memory or an operating-system page-cache guarantee. Force plate calibration, COP / GRF and clinical interpretation are outside the implemented scope.

## Interface decisions

The workbench uses the Data terminal direction (design seed `196176706`): neutral dark surfaces, a blue selection rule, Public Sans text and IBM Plex Mono for frame counters / measurements. The largest region answers “What was the subject doing at this acquisition frame?”; the selected signal and event timeline provide synchronized evidence. No measurements are invented for the UI. Screenshots use the explicitly synthetic walking generator.

The browser design inspection at desktop, tablet and phone widths checks layout, contrast, loaded fonts and overflow. The intentional density leaves many secondary labels at 11–12 px, appropriate to a scientific workstation; all text remains at least 11 px. No shadow is used on resting panels; drawers and dialogs are overlays.
