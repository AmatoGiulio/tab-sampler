import type { SampleChunk, SampleMeta } from '../domain/types';

/**
 * Persistence boundary for the real-time recorder.
 *
 * PcmRecorder deliberately knows nothing about IndexedDB/OPFS. A future storage
 * backend only needs to satisfy this contract.
 */
export interface SampleSink {
  reset(): Promise<void>;
  writeChunk(chunk: SampleChunk): Promise<void>;
  finalize(meta: SampleMeta): Promise<void>;
}
