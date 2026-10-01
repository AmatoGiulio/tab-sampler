# Motion language

Motion is not decoration. It communicates changes in audio state.

## Four phenomena

1. **Pulse** - the toolbar record dot alternates between bright and dim red while capture is active.
2. **Materialize** - when the editor opens, the waveform expands from the red record seed.
3. **Density** - audio outside the trim range loses visual presence instead of receiving a heavy selection rectangle.
4. **Continuity** - loop behavior should read as one continuous object rather than a timeline reset.

## Direct manipulation rule

During pointer manipulation, input maps directly to the trim result. Do not put a spring between pointer and handle. Motion belongs before or after the gesture.

## Icons

Glyphs follow the platform's symbol language: filled where the control is the primary action, a 2px round stroke on a 24 grid elsewhere.

- **Play / pause** are filled. Both are built from the same two quadrilaterals: the triangle is split down the middle and each half straightens into one pause bar. The icon is not cross-fading between two drawings; it stays one solid object whose geometry changes (the shared-geometry idea from Benji Taylor's "Morphing icons with Claude", https://benji.org/morphing-icons-with-claude, applied to filled shapes).
- **Loop** is two arrows chasing each other ("repeat"). A single counter-clockwise arrow reads as undo. Turning it on answers with a small bounce of the glyph.
- **New / export** sit in 28px targets on the same centre line as the zoom indicator.

## Type

The platform UI face (SF on macOS) everywhere, in the card and in the island. Values that change use tabular figures instead of a monospace, so digits hold their columns without wide punctuation. Labels are 11px semibold with light tracking at secondary contrast.

The toolbar recording icon is intentionally different. Chrome action icons are bitmap frames, so the pulse uses two pre-rendered states and swaps them at a restrained cadence instead of pretending to run a continuous SVG animation in the browser toolbar.

## Island morph

The recording island and the editor are one surface. Stopping a capture changes the shape of that surface; nothing is swapped, cross-faded between proxies, or stretched.

- **One spring.** Shell geometry (width, height, corner radius) and the content riding it share a single damped spring (response 0.36 s, damping 0.8, ~1.5% overshoot), sampled into a CSS `linear()` curve over 600 ms. No bezier that sprints and then creeps.
- **Real geometry.** The shell animates its actual box, so the squircle corners, rim light and shadow stay correct on every frame.
- **Content follows the shell.** Island content and editor are pinned to the anchor corner and scaled by the island/editor width ratio (198 / 352) on the same spring, so their left edge is always the shell's left edge. The moving edge never cuts through content. Outgoing content scales up, blurs and fades; incoming content scales up into place.
- **Anticipation.** The frozen island compresses slightly while the sample is finalized and releases into the expansion.
- **Nothing else runs during the morph.** The editor announces readiness only after its first finished frame is painted; its own entrance (waveform, controls) starts on the island's reveal message. The island timer stops ticking once frozen. Content motion is transform/opacity/filter only.
- **No invisible cost.** Backdrop filters and blend modes that do not change a pixel (white-on-dark `screen`, backdrop blur inside the editor frame, which cannot see the page) are not used.

## Recording island

- **Capsule, then squircle.** The island is a true capsule (`corner-shape: round`); the card is a squircle. `corner-shape` interpolates on the morph spring together with the radius.
- **Bars do not travel.** Level history advances on a fixed 55 ms clock, independent of message jitter, and every bar eases toward its slot's value each frame. The wave moves at the display's refresh rate; silence is a row of dots.
- **Flat controls.** The stop control is a flat system red with a white rounded square: no gradient, gloss or glow.
- **States.** Hover lifts the island (1.025), pointer down compresses it (0.955). While capturing, a soft ring breathes out of the stop control. While the sample is finalized the stop glyph pulses: it reads as working, never as disabled.
- **Type.** System UI font with tabular figures for the timer; durations read `m:ss.cc`.
- **Metrics.** 13 + 24 + 12 + 90 + 12 + 29 + 18 = 198. The stop control is concentric with the capsule end, the wave is exactly 23 bars on whole device pixels, and both gaps are 12.
- **Continuity.** Island elements travel to what they become: the stop control flies to the play control's place, its square opening into the play triangle on the way (same two quadrilaterals, same relative size as the editor's glyph), and hands over once the real button is underneath it; the mini wave grows toward the waveform; the timer, which has no counterpart, softens away. Targets are the editor's layout measured from the anchor corner, so they must change together with the editor layout.
- **Arrival and exit.** The island emerges from, and returns to, the toolbar corner (scale + fade on the spring).
- **Material.** Tinted glass: density is one pair of variables (`--glass-top`, `--glass-bottom`) on the surface host.

## Trim and zoom

- **Density, in the bars.** Audio outside the selection is dimmed through the waveform's own mask. Nothing is laid over the glass, so there is no rectangle to see.
- **Handles are grabbers.** A white capsule on a hairline, always visible, with a 28px hit area. It swells on hover and again while held. While an edge moves, its exact time hangs from the handle, inward so it never leaves the card.
- **Direct manipulation.** No spring between pointer and handle. Arrow keys nudge a focused handle by 10 ms (100 ms with Shift).
- **Reach.** While zoomed in, holding a handle against either end of the view scrolls the waveform under it.
- **Pinch follows the fingers.** Ctrl/Cmd + wheel zooms continuously and keeps the time under the pointer under the pointer; events are folded into one waveform render per frame.
- **Discrete zoom glides.** `+` / `-` and double click animate over 240 ms on a geometric scale, anchored to the playhead or pointer. Double click zooms into the selection, and back out.
- **Orientation.** A small range indicator shows where the view sits in the sample, only while zoomed.

## Timing baseline

- island <-> editor morph: 600 ms spring (visually settled around 300 ms)
- outgoing island content: 130 ms fade, 160 ms blur
- incoming editor: 240 ms fade after 70 ms
- play <-> pause morph: 200 ms
- record pulse: 650 ms per frame change
- no bounce by default
- reduced-motion media query collapses decorative materialization to near-zero duration

These are baselines for real-browser tuning, not fixed product constants.
