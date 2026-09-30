import { describe, expect, it } from 'vitest';
import { formatSeconds, sampleFilename } from '../src/audio/domain/format';

describe('formatSeconds', () => {
  it('formats short and long durations', () => {
    expect(formatSeconds(4.827)).toBe('4.83');
    expect(formatSeconds(65.2)).toBe('1:05.20');
  });

  it('guards invalid values', () => {
    expect(formatSeconds(-1)).toBe('0.00');
    expect(formatSeconds(Number.NaN)).toBe('0.00');
  });
});

describe('sampleFilename', () => {
  it('produces a wav filename', () => {
    const name = sampleFilename(new Date(2026, 8, 30, 9, 12, 5).getTime());
    expect(name).toBe('sample-2026-09-30-09-12-05.wav');
  });
});
