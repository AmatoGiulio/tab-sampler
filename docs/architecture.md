# Architecture

## Product invariant

The interaction model is fixed for V1:

```text
click -> listen -> click -> trim -> loop -> export
```

Architecture should make that path faster and more reliable, not add modes.

## Contexts

### Background service worker

Owns browser-level state only:

- toolbar click routing
- dynamic popup assignment
- offscreen document lifecycle
- tab capture stream-id acquisition from the active tab action gesture
- toolbar recording pulse
- recovery of action state after service-worker restarts

It does not process PCM.

### Offscreen document

Owns the long-lived recording graph:

- consumes the Chrome tab stream id
- opens the tab `MediaStream`
- keeps captured tab audio audible
- runs the AudioWorklet tap
- writes PCM chunks to IndexedDB

The recording survives popup absence by design.

### Editor popup

Exists only after a sample exists. It owns:

- waveform rendering
- trim, zoom, and playhead interaction
- native Web Audio playback and looping
- export

It does not own recording state.

## Module boundaries

```text
src/audio/domain     pure data and selection logic
src/audio/capture    browser/storage-agnostic PCM recorder graph + sink contract
src/audio/store      IndexedDB repository + SampleSink adapter
src/audio/export     WAV encoding
src/audio/playback   native Web Audio audition/seek/loop engine
src/platform/chrome  Chrome-specific stream acquisition
src/extension        messages and toolbar icon state
src/ui               reusable visual primitives
src/entrypoints      WXT runtime contexts
```

The important separation is two-dimensional: the PCM recorder receives a `MediaStream`, so Chrome-specific `chromeMediaSource` constraints stay in `platform/chrome`; and the recorder writes through a `SampleSink`, so IndexedDB stays outside the real-time capture engine. A future Firefox/Safari source adapter or OPFS storage backend can therefore be added without rewriting the recorder.

## Permission minimization

The capture request intentionally calls `tabCapture.getMediaStreamId()` without a `targetTabId`. Because capture begins directly from the toolbar action gesture, Chrome can target the current active tab without adding an `activeTab` permission solely to name that same tab explicitly. The V1 manifest therefore stays at `tabCapture` + `offscreen`.

## Data path

PCM is transferred from the AudioWorklet to the offscreen main thread in chunks of 16,384 frames. The ArrayBuffers are transferred, not cloned, then persisted incrementally to IndexedDB.

At 48 kHz stereo Float32 this is roughly 384 KB/s of raw PCM. Chunked persistence prevents the recorder from retaining the whole capture in memory.

The V1 editor assembles the completed recording in memory once. wavesurfer.js consumes the already-decoded PCM only for visualization/zoom, while a separate native Web Audio playback engine owns audition, seek, and looping. Keeping those responsibilities separate prevents waveform-library playback behavior from becoming a correctness dependency. For short sampling workflows this is the simplest robust tradeoff. If the product evolves toward long recordings, the next scaling step is a peak pyramid for rendering plus chunk-streamed export/playback windows.

## Recovery

The service worker does not assume it stays alive. On startup it checks:

1. whether the offscreen context is recording
2. otherwise whether a completed sample exists in IndexedDB
3. otherwise it restores the idle action

This keeps the toolbar state coherent across service-worker suspension/restart.

## Expansion points

Later capabilities should be adapters around the core, not branches inside the popup:

- exporters: PCM16 WAV, FLAC, AIFF
- analysis: transient/zero-crossing snap, BPM/key metadata
- processing: normalize/fades as non-destructive transforms
- persistence: recent-sample library
- platform: Firefox/Safari source adapters
- UI surfaces: side panel or detached editor while retaining the same capture domain

Avoid introducing a global state framework until there is actual cross-surface state complexity. V1 state is small enough for local React state plus typed extension messages.
