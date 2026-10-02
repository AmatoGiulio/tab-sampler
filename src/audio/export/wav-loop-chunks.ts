export interface LoopMetadata {
  sampleRate: number;
  frames: number;
  /** Omit when the tempo is unknown: only the loop points are written. */
  bpm?: number;
  beats?: number;
}

const MIDI_MIDDLE_C = 60;

function writeTag(view: DataView, offset: number, tag: string): void {
  for (let index = 0; index < 4; index += 1) {
    view.setUint8(offset + index, tag.charCodeAt(index));
  }
}

/** `smpl`: one forward loop over the whole file, repeated forever. */
function samplerChunk({ sampleRate, frames }: LoopMetadata): Uint8Array {
  const bytes = new Uint8Array(8 + 36 + 24);
  const view = new DataView(bytes.buffer);

  writeTag(view, 0, 'smpl');
  view.setUint32(4, 36 + 24, true);
  view.setUint32(16, Math.round(1e9 / sampleRate), true); // sample period, ns
  view.setUint32(20, MIDI_MIDDLE_C, true); // unity note
  view.setUint32(36, 1, true); // loop count
  view.setUint32(44 + 8, 0, true); // loop start frame
  view.setUint32(44 + 12, Math.max(0, frames - 1), true); // loop end frame, inclusive

  return bytes;
}

/** `acid`: tempo and length in beats, flagged as a loop rather than a one-shot. */
function acidChunk(bpm: number, beats: number): Uint8Array {
  const bytes = new Uint8Array(8 + 24);
  const view = new DataView(bytes.buffer);

  writeTag(view, 0, 'acid');
  view.setUint32(4, 24, true);
  view.setUint32(8, 0, true); // flags: bit 0 clear = loop
  view.setUint16(12, MIDI_MIDDLE_C, true);
  view.setUint16(14, 0x8000, true);
  view.setFloat32(16, 0, true);
  view.setUint32(20, beats, true);
  view.setUint16(24, 4, true); // meter denominator
  view.setUint16(26, 4, true); // meter numerator
  view.setFloat32(28, bpm, true);

  return bytes;
}

/**
 * Appends loop metadata to a finished RIFF/WAVE file so samplers and DAWs
 * that read it import the file as a loop at the right tempo.
 */
export function appendLoopChunks(wav: Uint8Array, metadata: LoopMetadata): Uint8Array {
  const chunks = [samplerChunk(metadata)];
  if (metadata.bpm && metadata.beats) chunks.push(acidChunk(metadata.bpm, metadata.beats));

  // RIFF chunks start on even offsets.
  const padding = wav.length % 2;
  const extra = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(wav.length + padding + extra);
  result.set(wav, 0);

  let offset = wav.length + padding;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  new DataView(result.buffer).setUint32(4, result.length - 8, true);
  return result;
}
