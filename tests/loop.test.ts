import { describe, expect, it } from 'vitest';
import {
  formatBeats,
  quantizeBeats,
  renderSeamlessLoop,
  selectionBeats,
  snapSelectionToGrid,
} from '../src/audio/domain/loop';
import { sampleFilename } from '../src/audio/domain/format';
import type { LoadedSample } from '../src/audio/domain/types';
import { appendLoopChunks } from '../src/audio/export/wav-loop-chunks';

const SAMPLE_RATE = 48_000;

function sine(seconds: number, hertz: number): LoadedSample {
  const frames = Math.round(seconds * SAMPLE_RATE);
  const channel = Float32Array.from(
    { length: frames },
    (_, n) => Math.sin((2 * Math.PI * hertz * n) / SAMPLE_RATE),
  );
  return {
    meta: {
      id: 'sample',
      createdAt: 0,
      sampleRate: SAMPLE_RATE,
      channels: 1,
      frames,
      duration: seconds,
      chunkCount: 1,
    },
    channelData: [channel],
  };
}

// Largest sample-to-sample jump, including the wrap from the last frame to the first.
function largestStep(data: Float32Array): number {
  let largest = 0;
  for (let n = 0; n < data.length; n += 1) {
    const next = data[(n + 1) % data.length]!;
    largest = Math.max(largest, Math.abs(next - data[n]!));
  }
  return largest;
}

describe('loop grid', () => {
  it('quantizes to one beat, two beats, or whole bars', () => {
    expect(quantizeBeats(0.7)).toBe(1);
    expect(quantizeBeats(2.4)).toBe(2);
    expect(quantizeBeats(3.4)).toBe(4);
    expect(quantizeBeats(9.9)).toBe(8);
    expect(quantizeBeats(10.1)).toBe(12);
  });

  it('snaps the moved edge to the nearest grid length', () => {
    // 120 bpm: a beat is 0.5s, a bar 2s.
    expect(snapSelectionToGrid({ start: 1, end: 4.7 }, 'end', 120, 10)).toEqual({ start: 1, end: 5 });
    expect(snapSelectionToGrid({ start: 1.2, end: 5 }, 'start', 120, 10)).toEqual({ start: 1, end: 5 });
  });

  it('never snaps past the audio that exists', () => {
    expect(snapSelectionToGrid({ start: 0, end: 3.24 }, 'end', 120, 3.24)).toEqual({ start: 0, end: 2 });
    expect(snapSelectionToGrid({ start: 0, end: 0.3 }, 'end', 120, 0.3)).toBeNull();
  });

  it('names grid lengths', () => {
    expect(selectionBeats({ start: 1, end: 5 }, 120)).toBe(8);
    expect(selectionBeats({ start: 1, end: 4.7 }, 120)).toBeNull();
    expect(formatBeats(1)).toBe('1 beat');
    expect(formatBeats(4)).toBe('1 bar');
    expect(formatBeats(8)).toBe('2 bars');
  });
});

describe('renderSeamlessLoop', () => {
  // 440 Hz moves at most ~0.058 per frame; a raw cut at an arbitrary phase jumps far more.
  const smooth = 0.07;

  it('removes the click at the wrap using the audio before the start', () => {
    const sample = sine(2, 440);
    const selection = { start: 0.5, end: 1.2013 };
    const raw = sample.channelData[0]!.slice(24_000, 57_662);
    expect(largestStep(raw)).toBeGreaterThan(0.3);

    const loop = renderSeamlessLoop(sample, selection);
    expect(loop.seam).toBe('preroll');
    expect(loop.frames).toBe(33_662);
    expect(largestStep(loop.channelData[0]!)).toBeLessThan(smooth);
    // The opening of the loop is the recording, untouched.
    expect(loop.channelData[0]![0]).toBe(sample.channelData[0]![24_000]);
  });

  it('falls back to the audio after the end when the loop starts at zero', () => {
    const loop = renderSeamlessLoop(sine(2, 440), { start: 0, end: 0.7013 });
    expect(loop.seam).toBe('postroll');
    expect(largestStep(loop.channelData[0]!)).toBeLessThan(smooth);
  });

  it('fades both ends when the loop is the whole recording', () => {
    const loop = renderSeamlessLoop(sine(0.7013, 440), { start: 0, end: 0.7013 });
    expect(loop.seam).toBe('fade');
    expect(largestStep(loop.channelData[0]!)).toBeLessThan(smooth);
  });

  it('does not touch the source audio', () => {
    const sample = sine(2, 440);
    const before = sample.channelData[0]!.slice();
    renderSeamlessLoop(sample, { start: 0.5, end: 1.2013 });
    expect(sample.channelData[0]).toEqual(before);
  });
});

describe('loop metadata', () => {
  const wav = new Uint8Array(44 + 8);
  new DataView(wav.buffer).setUint32(4, wav.length - 8, true);

  it('appends loop points and tempo and fixes the RIFF size', () => {
    const out = appendLoopChunks(wav, { sampleRate: 48_000, frames: 1000, bpm: 124, beats: 8 });
    const view = new DataView(out.buffer);
    const tag = (at: number) => String.fromCharCode(...out.slice(at, at + 4));

    expect(view.getUint32(4, true)).toBe(out.length - 8);
    expect(tag(52)).toBe('smpl');
    expect(view.getUint32(52 + 8 + 36 + 12, true)).toBe(999);
    expect(tag(52 + 68)).toBe('acid');
    expect(view.getUint32(52 + 68 + 20, true)).toBe(8);
    expect(view.getFloat32(52 + 68 + 28, true)).toBe(124);
  });

  it('writes only loop points when the tempo is unknown', () => {
    const out = appendLoopChunks(wav, { sampleRate: 48_000, frames: 1000 });
    expect(out.length).toBe(wav.length + 68);
  });

  it('puts tempo and length first in the filename', () => {
    const at = new Date(2026, 8, 30, 9, 12, 5).getTime();
    expect(sampleFilename(at, { bpm: 124, beats: 8 })).toBe('loop-124bpm-2bar-2026-09-30-09-12-05.wav');
    expect(sampleFilename(at, { bpm: 126.5, beats: 2 })).toBe('loop-126_5bpm-2beat-2026-09-30-09-12-05.wav');
    expect(sampleFilename(at, {})).toBe('loop-2026-09-30-09-12-05.wav');
  });
});
