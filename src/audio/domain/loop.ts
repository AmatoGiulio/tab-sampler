import type { LoadedSample, Selection } from './types';
import { clampSelection } from './selection';

export const BEATS_PER_BAR = 4;
const CROSSFADE_SECONDS = 0.012;
const MICRO_FADE_SECONDS = 0.003;

export type LoopSeam = 'preroll' | 'postroll' | 'fade' | 'none';

export interface RenderedLoop {
  channelData: Float32Array[];
  frames: number;
  seam: LoopSeam;
}

export function beatSeconds(bpm: number): number {
  return 60 / bpm;
}

/** Loop lengths a DAW grid likes: one beat, two beats, or whole bars. */
export function quantizeBeats(beats: number): number {
  if (beats < 1.5) return 1;
  if (beats < 3) return 2;
  return Math.max(1, Math.round(beats / BEATS_PER_BAR)) * BEATS_PER_BAR;
}

/** The longest grid length that is no longer than `beats`, or 0 if none. */
function fitBeats(beats: number, maxBeats: number): number {
  let candidate = quantizeBeats(beats);

  while (candidate > maxBeats + 1e-6) {
    if (candidate > BEATS_PER_BAR) candidate -= BEATS_PER_BAR;
    else if (candidate === BEATS_PER_BAR) candidate = 2;
    else if (candidate === 2) candidate = 1;
    else return 0;
  }

  return candidate;
}

/**
 * Moves one edge so the selection is a grid length at `bpm`, keeping the
 * other edge where it is. Returns null when not even one beat fits.
 */
export function snapSelectionToGrid(
  selection: Selection,
  edge: 'start' | 'end',
  bpm: number,
  duration: number,
): Selection | null {
  if (!(bpm > 0)) return null;

  const safe = clampSelection(selection, duration);
  const beat = beatSeconds(bpm);
  const room = edge === 'end' ? duration - safe.start : safe.end;
  const beats = fitBeats((safe.end - safe.start) / beat, room / beat);
  if (beats === 0) return null;

  const length = beats * beat;
  return edge === 'end'
    ? { start: safe.start, end: Math.min(duration, safe.start + length) }
    : { start: Math.max(0, safe.end - length), end: safe.end };
}

/** Whole grid beats in the selection, or null when it is off the grid. */
export function selectionBeats(selection: Selection, bpm: number): number | null {
  if (!(bpm > 0)) return null;

  const beats = (selection.end - selection.start) / beatSeconds(bpm);
  const grid = quantizeBeats(beats);
  return Math.abs(beats - grid) < 0.02 ? grid : null;
}

export function formatBeats(beats: number): string {
  if (beats < BEATS_PER_BAR) return beats === 1 ? '1 beat' : `${beats} beats`;
  const bars = beats / BEATS_PER_BAR;
  return bars === 1 ? '1 bar' : `${bars} bars`;
}

/**
 * Copies the selection so that its last frame flows into its first.
 *
 * A raw cut clicks at the wrap because the waveform jumps. Preferred fix: let
 * the last milliseconds dissolve into the audio that originally led up to the
 * start, so the wrap lands exactly where the recording itself went next and
 * the loop's opening transient is untouched. Without audio before the start,
 * the opening dissolves in from the audio that followed the end. With
 * neither, both ends get a fade short enough to pass as silence.
 */
export function renderSeamlessLoop(
  sample: LoadedSample,
  selection: Selection,
): RenderedLoop {
  const { sampleRate, frames: totalFrames, duration } = sample.meta;
  const safe = clampSelection(selection, duration);
  const startFrame = Math.min(totalFrames, Math.max(0, Math.round(safe.start * sampleRate)));
  const frames = Math.min(
    totalFrames - startFrame,
    Math.max(0, Math.round((safe.end - safe.start) * sampleRate)),
  );
  const endFrame = startFrame + frames;
  const channelData = sample.channelData.map(
    (channel) => channel.slice(startFrame, endFrame),
  );

  const fade = Math.min(Math.round(CROSSFADE_SECONDS * sampleRate), Math.floor(frames / 4));
  if (fade < 2) return { channelData, frames, seam: 'none' };

  if (startFrame >= fade) {
    channelData.forEach((out, index) => {
      const source = sample.channelData[index]!;
      for (let step = 0; step < fade; step += 1) {
        const mix = (step + 1) / (fade + 1);
        const at = frames - fade + step;
        out[at] = (out[at] ?? 0) * (1 - mix) + (source[startFrame - fade + step] ?? 0) * mix;
      }
    });
    return { channelData, frames, seam: 'preroll' };
  }

  if (endFrame + fade <= totalFrames) {
    channelData.forEach((out, index) => {
      const source = sample.channelData[index]!;
      for (let step = 0; step < fade; step += 1) {
        const mix = (step + 1) / (fade + 1);
        out[step] = (out[step] ?? 0) * mix + (source[endFrame + step] ?? 0) * (1 - mix);
      }
    });
    return { channelData, frames, seam: 'postroll' };
  }

  const micro = Math.min(Math.round(MICRO_FADE_SECONDS * sampleRate), Math.floor(frames / 4));
  channelData.forEach((out) => {
    for (let step = 0; step < micro; step += 1) {
      const gain = step / micro;
      out[step] = (out[step] ?? 0) * gain;
      out[frames - 1 - step] = (out[frames - 1 - step] ?? 0) * gain;
    }
  });
  return { channelData, frames, seam: 'fade' };
}
