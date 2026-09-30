# Technology research notes

## WXT

Chosen instead of hand-maintaining Manifest V3 build plumbing. It provides file-based extension entrypoints, TypeScript, React integration, cross-browser targets, and a publishing path while still emitting a standard web extension.

## AudioWorklet instead of MediaRecorder

The capture target is editable PCM, not a compressed recording container. AudioWorklet keeps sample capture in the Web Audio rendering path and avoids introducing another lossy codec before trim/export.

## IndexedDB + idb

Raw Float32 audio grows quickly and does not belong in `chrome.storage`. IndexedDB is suited to larger binary values; `idb` adds a small typed promise wrapper without changing the storage model.

## wavesurfer.js

Waveform drawing, predecoded PCM rendering, scrolling, and zoom already solve the expensive visualization primitives. Playback is intentionally separated into a small native Web Audio engine, and the two trim boundaries are product-owned hit targets. This keeps audition and trim correctness independent from renderer/plugin behavior while still avoiding a custom waveform engine.

## @audio/encode-wav

The V1 needs one export format. This package is pure JS, accepts Float32 channel arrays, supports IEEE 32-bit float WAV, and has no runtime dependencies.

## Motion

Used only for the shared-shape icon morphs. CSS handles simple opacity/clip transitions so the animation dependency does not become the UI architecture.

## Typed messaging

`@webext-core/messaging` keeps message contracts shared between service worker, offscreen context, and popup instead of duplicating untyped string payloads.

## Existing projects reviewed

There are already browser audio recorders and samplers, so the project should reuse validated primitives rather than copy an entire existing product architecture.

### SMPL-1

Open-source browser sampler using WaveSurfer.js with tab recording, waveform regions, looping, effects, and a side-panel UI. It validates WaveSurfer as a practical editor primitive, but its product surface is substantially broader than this V1 and its side-panel-first interaction conflicts with the toolbar-as-recorder concept. We reuse WaveSurfer for the mature waveform and viewport primitives, not its UI architecture or source code.

### Chrome Tab Audio Recorder

Open-source MV3 recorder using `tabCapture`, an offscreen document, local IndexedDB, and audio monitoring. It validates the same browser-level lifecycle. Its recording pipeline is MediaRecorder/WebM and it injects a visible controller, while this project intentionally records Float32 PCM through AudioWorklet and keeps recording UI in the toolbar only.

### Chrome Audio Capture / similar recorders

Older recorders establish the basic `tabCapture` pattern but commonly use Recorder.js/MediaRecorder, broader permissions, and immediate file export. Those implementations are useful historical references, but they are not a good base for a low-latency trim/loop editor.

## Reuse decision

Reuse mature, narrow libraries where they own a solved problem:

- WXT for extension build/runtime structure
- wavesurfer.js for waveform rendering, scrolling, and zoom
- native Web Audio for deterministic PCM playback/seek/loop
- idb for IndexedDB ergonomics
- @audio/encode-wav for WAV encoding
- @webext-core/messaging for typed extension-context messaging
- Motion for the small shared-geometry icon transitions

Keep custom code only where it defines the product or performance model:

- toolbar capture state machine
- AudioWorklet PCM tap
- chunk persistence model
- editor composition/motion language
- Chrome tab-stream adapter

## Current Chrome Web Store landscape (September 2026)

A public release enters an existing category. Notable current products include `Tab Sampler`, `Sampler`, and `AudioSnip`, all of which already combine tab capture with some form of sample editing. This makes generic "record tab audio + waveform" insufficient as a product identity.

The differentiator to protect is the interaction model itself:

```text
toolbar click -> listen with no UI -> toolbar click -> editor appears -> trim -> loop -> export
```

In particular:

- no recorder popup to arm/start
- no side panel during capture
- no injected floating controller
- no library/dashboard in V1
- no effects rack in V1
- the action icon is the recording state
- the post-capture popup is the sample, not a navigation surface

This narrower behavior is also useful technically: fewer permissions, fewer extension contexts interacting during capture, less UI work while the source tab is active, and a clearer single-purpose store story.
