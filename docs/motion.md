# Motion language

Motion is not decoration. It communicates changes in audio state.

## Four phenomena

1. **Pulse** - the toolbar record dot alternates between bright and dim red while capture is active.
2. **Materialize** - when the editor opens, the waveform expands from the red record seed.
3. **Density** - audio outside the trim range loses visual presence instead of receiving a heavy selection rectangle.
4. **Continuity** - loop behavior should read as one continuous object rather than a timeline reset.

## Direct manipulation rule

During pointer manipulation, input maps directly to the trim result. Do not put a spring between pointer and handle. Motion belongs before or after the gesture.

## Morphing icons

The play/pause control follows the shared-geometry approach in Benji Taylor's "Morphing icons with Claude": every icon is represented by exactly three SVG lines; unused lines collapse to an invisible center point; compatible directional shapes share coordinates and rotate as a group; unrelated shapes interpolate their line coordinates.

This matters because the icon is not crossfading between two drawings. It remains one three-line object whose geometry changes state.

Reference: https://benji.org/morphing-icons-with-claude

The toolbar recording icon is intentionally different. Chrome action icons are bitmap frames, so the pulse uses two pre-rendered states and swaps them at a restrained cadence instead of pretending to run a continuous SVG animation in the browser toolbar.

## Timing baseline

- play <-> pause morph: 160 ms
- popup waveform materialize: 280 ms
- record pulse: 650 ms per frame change
- no bounce by default
- reduced-motion media query collapses decorative materialization to near-zero duration

These are baselines for real-browser tuning, not fixed product constants.
