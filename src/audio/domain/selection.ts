import type { LoadedSample, Selection } from './types';

export function clampSelection(selection: Selection, duration: number): Selection {
  const start = Math.max(0, Math.min(selection.start, duration));
  const end = Math.max(start, Math.min(selection.end, duration));
  return { start, end };
}



export function moveSelectionEdge(
  selection: Selection,
  edge: 'start' | 'end',
  time: number,
  duration: number,
  minLength = 0,
): Selection {
  const safe = clampSelection(selection, duration);
  const minimum = Math.max(0, Math.min(minLength, duration));

  if (edge === 'start') {
    return {
      start: Math.max(0, Math.min(time, safe.end - minimum)),
      end: safe.end,
    };
  }

  return {
    start: safe.start,
    end: Math.min(duration, Math.max(time, safe.start + minimum)),
  };
}

export function selectionChannelViews(
  sample: LoadedSample,
  selection: Selection,
): Float32Array[] {
  const safe = clampSelection(selection, sample.meta.duration);
  const startFrame = Math.max(0, Math.floor(safe.start * sample.meta.sampleRate));
  const endFrame = Math.min(
    sample.meta.frames,
    Math.ceil(safe.end * sample.meta.sampleRate),
  );

  return sample.channelData.map((channel) => channel.subarray(startFrame, endFrame));
}

export function selectionDuration(selection: Selection): number {
  return Math.max(0, selection.end - selection.start);
}
