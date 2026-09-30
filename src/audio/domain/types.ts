export type CaptureStatus = 'idle' | 'starting' | 'recording' | 'stopping';

export interface SampleMeta {
  id: string;
  createdAt: number;
  sampleRate: number;
  channels: number;
  frames: number;
  duration: number;
  chunkCount: number;
}

export interface SampleChunk {
  sampleId: string;
  index: number;
  frames: number;
  channels: ArrayBuffer[];
}

export interface LoadedSample {
  meta: SampleMeta;
  channelData: Float32Array[];
}

export interface Selection {
  start: number;
  end: number;
}
