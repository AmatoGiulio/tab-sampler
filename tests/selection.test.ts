import { describe, expect, it } from 'vitest';
import { clampSelection, moveSelectionEdge, selectionChannelViews, selectionDuration } from '../src/audio/domain/selection';
import type { LoadedSample } from '../src/audio/domain/types';

describe('selection', () => {
  it('clamps a selection to sample bounds', () => {
    expect(clampSelection({ start: -1, end: 5 }, 3)).toEqual({ start: 0, end: 3 });
    expect(clampSelection({ start: 2.5, end: 1 }, 3)).toEqual({ start: 2.5, end: 2.5 });
  });

  it('reports non-negative duration', () => {
    expect(selectionDuration({ start: 1.25, end: 2.5 })).toBe(1.25);
    expect(selectionDuration({ start: 2, end: 1 })).toBe(0);
  });


  it('moves trim edges while preserving a minimum selection length', () => {
    expect(moveSelectionEdge({ start: 1, end: 4 }, 'start', 3.99, 5, 0.25)).toEqual({
      start: 3.75,
      end: 4,
    });
    expect(moveSelectionEdge({ start: 1, end: 4 }, 'end', 1.01, 5, 0.25)).toEqual({
      start: 1,
      end: 1.25,
    });
  });

  it('creates zero-copy channel views on frame boundaries', () => {
    const sample: LoadedSample = {
      meta: {
        id: 'sample',
        createdAt: 0,
        sampleRate: 4,
        channels: 2,
        frames: 8,
        duration: 2,
        chunkCount: 1,
      },
      channelData: [
        new Float32Array([0, 1, 2, 3, 4, 5, 6, 7]),
        new Float32Array([10, 11, 12, 13, 14, 15, 16, 17]),
      ],
    };

    const result = selectionChannelViews(sample, { start: 0.5, end: 1.25 });
    expect(Array.from(result[0] ?? [])).toEqual([2, 3, 4]);
    expect(Array.from(result[1] ?? [])).toEqual([12, 13, 14]);
    expect(result[0]?.buffer).toBe(sample.channelData[0]?.buffer);
  });
});
