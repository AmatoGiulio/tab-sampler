import { describe, expect, it } from 'vitest';
import { detectTempo } from '../src/audio/analysis/tempo';

const SAMPLE_RATE = 16_000;

// Kick on every beat, a quieter hat on the off-beat eighths.
function drumLoop(bpm: number, seconds: number): Float32Array {
  const frames = Math.floor(SAMPLE_RATE * seconds);
  const out = new Float32Array(frames);
  const beat = (60 / bpm) * SAMPLE_RATE;
  let seed = 7;
  const noise = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647 - 0.5;
  };

  for (let start = 0; start < frames; start += beat) {
    const kick = Math.round(start);
    for (let n = 0; n < 2400 && kick + n < frames; n += 1) {
      out[kick + n]! += Math.sin((2 * Math.PI * 60 * n) / SAMPLE_RATE) * Math.exp(-n / 500) * 0.8;
    }

    const hat = Math.round(start + beat / 2);
    for (let n = 0; n < 600 && hat + n < frames; n += 1) {
      out[hat + n]! += noise() * Math.exp(-n / 120) * 0.35;
    }
  }

  return out;
}

describe('detectTempo', () => {
  it.each([90, 100, 124, 128, 140])('finds %i bpm', (bpm) => {
    const estimate = detectTempo([drumLoop(bpm, 8)], SAMPLE_RATE);
    expect(estimate?.bpm).toBe(bpm);
  });

  it('holds on a short clip', () => {
    expect(detectTempo([drumLoop(124, 4)], SAMPLE_RATE)?.bpm).toBe(124);
  });

  it('keeps a deliberate fractional tempo', () => {
    const estimate = detectTempo([drumLoop(126.5, 10)], SAMPLE_RATE);
    expect(estimate?.bpm).toBeCloseTo(126.5, 0);
  });

  it('declines audio with no pulse', () => {
    let seed = 3;
    const noise = Float32Array.from({ length: SAMPLE_RATE * 6 }, () => {
      seed = (seed * 16807) % 2147483647;
      return (seed / 2147483647 - 0.5) * 0.4;
    });
    expect(detectTempo([noise], SAMPLE_RATE)).toBeNull();
  });

  it('declines sustained tones, whose beating is periodic but is not a beat', () => {
    const chord = Float32Array.from({ length: SAMPLE_RATE * 8 }, (_, n) => {
      const at = (hertz: number) => Math.sin((2 * Math.PI * hertz * n) / SAMPLE_RATE);
      return (at(220) + at(277) + at(330)) * 0.1;
    });
    expect(detectTempo([chord], SAMPLE_RATE)).toBeNull();
  });

  it('declines audio that is too short to judge', () => {
    expect(detectTempo([drumLoop(124, 1)], SAMPLE_RATE)).toBeNull();
  });
});
