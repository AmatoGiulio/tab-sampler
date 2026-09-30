import type { CaptureStatus, SampleMeta } from '../domain/types';
import type { SampleSink } from './sample-sink';

interface WorkletChunkMessage {
  type: 'chunk';
  frames: number;
  channels: ArrayBuffer[];
}

interface WorkletFlushedMessage {
  type: 'flushed';
}

type WorkletMessage = WorkletChunkMessage | WorkletFlushedMessage;

export class PcmRecorder {
  constructor(private readonly sink: SampleSink) {}

  private status: CaptureStatus = 'idle';
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private recorderNode: AudioWorkletNode | null = null;
  private silentGain: GainNode | null = null;
  private sample: SampleMeta | null = null;
  private chunkIndex = 0;
  private writeChain: Promise<void> = Promise.resolve();
  private flushResolve: (() => void) | null = null;
  private unexpectedEndHandler: ((meta: SampleMeta) => void) | null = null;

  getStatus(): CaptureStatus {
    return this.status;
  }

  onUnexpectedEnd(handler: (meta: SampleMeta) => void): void {
    this.unexpectedEndHandler = handler;
  }

  async start(stream: MediaStream, workletUrl: string): Promise<SampleMeta> {
    if (this.status !== 'idle') {
      throw new Error(`Cannot start while recorder is ${this.status}`);
    }

    this.status = 'starting';
    this.stream = stream;

    try {
      await this.sink.reset();
      const context = new AudioContext({ latencyHint: 'interactive' });
      this.context = context;
      await context.audioWorklet.addModule(workletUrl);

      const source = context.createMediaStreamSource(stream);
      const recorderNode = new AudioWorkletNode(context, 'pcm-recorder', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCountMode: 'max',
      });
      const silentGain = context.createGain();
      silentGain.gain.value = 0;

      // Chrome tabCapture suppresses local tab playback. Monitor the stream
      // directly while a separate silent branch taps PCM frames for recording.
      source.connect(context.destination);
      source.connect(recorderNode);
      recorderNode.connect(silentGain);
      silentGain.connect(context.destination);

      this.source = source;
      this.recorderNode = recorderNode;
      this.silentGain = silentGain;
      this.chunkIndex = 0;
      this.writeChain = Promise.resolve();
      this.sample = {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        sampleRate: context.sampleRate,
        channels: 0,
        frames: 0,
        duration: 0,
        chunkCount: 0,
      };

      recorderNode.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
        const message = event.data;
        if (message.type === 'chunk') {
          this.handleChunk(message);
          return;
        }
        this.flushResolve?.();
        this.flushResolve = null;
      };

      const [track] = stream.getAudioTracks();
      track?.addEventListener(
        'ended',
        () => {
          if (this.status !== 'recording') return;
          void this.stop().then((meta) => this.unexpectedEndHandler?.(meta));
        },
        { once: true },
      );

      await context.resume();
      this.status = 'recording';
      return this.sample;
    } catch (error) {
      this.status = 'idle';
      await this.releaseGraph();
      throw error;
    }
  }

  async stop(): Promise<SampleMeta> {
    if (this.status !== 'recording' || !this.sample) {
      throw new Error('Recorder is not active');
    }

    this.status = 'stopping';

    try {
      await this.flushWorklet();
      await this.writeChain;

      const meta: SampleMeta = {
        ...this.sample,
        duration: this.sample.frames / this.sample.sampleRate,
      };
      await this.sink.finalize(meta);
      this.sample = meta;
      return meta;
    } finally {
      await this.releaseGraph();
      this.status = 'idle';
    }
  }

  private handleChunk(message: WorkletChunkMessage): void {
    const sample = this.sample;
    if (!sample || message.frames <= 0 || message.channels.length === 0) return;

    sample.channels = Math.max(sample.channels, message.channels.length);
    const index = this.chunkIndex++;
    sample.frames += message.frames;
    sample.chunkCount = this.chunkIndex;

    this.writeChain = this.writeChain.then(() =>
      this.sink.writeChunk({
        sampleId: sample.id,
        index,
        frames: message.frames,
        channels: message.channels,
      }),
    );
  }

  private async flushWorklet(): Promise<void> {
    if (!this.recorderNode) return;

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      this.flushResolve = finish;
      this.recorderNode?.port.postMessage({ type: 'flush' });
      window.setTimeout(finish, 1000);
    });
  }

  private async releaseGraph(): Promise<void> {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.source?.disconnect();
    this.recorderNode?.disconnect();
    this.silentGain?.disconnect();

    if (this.context && this.context.state !== 'closed') {
      await this.context.close();
    }

    this.stream = null;
    this.context = null;
    this.source = null;
    this.recorderNode = null;
    this.silentGain = null;
    this.flushResolve = null;
  }
}
