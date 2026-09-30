import type { SampleSink } from '../capture/sample-sink';
import { clearSamples, putSampleChunk, putSampleMeta } from './sample-store';

export const indexedDbSampleSink: SampleSink = {
  reset: clearSamples,
  writeChunk: putSampleChunk,
  finalize: putSampleMeta,
};
