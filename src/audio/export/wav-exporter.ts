import createWavEncoder from '@audio/encode-wav';
import type { LoadedSample, Selection } from '../domain/types';
import { selectionChannelViews } from '../domain/selection';

export async function encodeSelectionAsWav(
  sample: LoadedSample,
  selection: Selection,
): Promise<Blob> {
  const channelData = selectionChannelViews(sample, selection);
  const encoder = await createWavEncoder({
    sampleRate: sample.meta.sampleRate,
    bitDepth: 32,
  });

  try {
    encoder.encode(channelData);
    const bytes = encoder.flush();
    // Own an ArrayBuffer-backed view for Blob typing and to decouple the file
    // bytes from any encoder-owned backing store before free().
    const wavBytes = new Uint8Array(bytes);
    return new Blob([wavBytes], { type: 'audio/wav' });
  } finally {
    encoder.free();
  }
}
