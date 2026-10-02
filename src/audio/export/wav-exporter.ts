import createWavEncoder from '@audio/encode-wav';
import { renderSeamlessLoop } from '../domain/loop';
import { selectionChannelViews } from '../domain/selection';
import type { LoadedSample, Selection } from '../domain/types';
import { appendLoopChunks } from './wav-loop-chunks';

export interface LoopExport {
  bpm?: number;
  beats?: number;
}

async function encodeWav(
  channelData: Float32Array[],
  sampleRate: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const encoder = await createWavEncoder({ sampleRate, bitDepth: 32 });

  try {
    encoder.encode(channelData);
    // Own an ArrayBuffer-backed view for Blob typing and to decouple the file
    // bytes from any encoder-owned backing store before free().
    return new Uint8Array(encoder.flush());
  } finally {
    encoder.free();
  }
}

export async function encodeSelectionAsWav(
  sample: LoadedSample,
  selection: Selection,
): Promise<Blob> {
  const bytes = await encodeWav(
    selectionChannelViews(sample, selection),
    sample.meta.sampleRate,
  );
  return new Blob([bytes], { type: 'audio/wav' });
}

/**
 * Exports the selection as a loop a DAW can drop on its grid: the seam is
 * rendered click-free and the file carries its loop points and, when the
 * tempo is known, its tempo and length in beats.
 */
export async function encodeLoopAsWav(
  sample: LoadedSample,
  selection: Selection,
  loop: LoopExport = {},
): Promise<Blob> {
  const rendered = renderSeamlessLoop(sample, selection);
  const wav = await encodeWav(rendered.channelData, sample.meta.sampleRate);
  const bytes = appendLoopChunks(wav, {
    sampleRate: sample.meta.sampleRate,
    frames: rendered.frames,
    ...loop,
  });
  return new Blob([new Uint8Array(bytes)], { type: 'audio/wav' });
}
