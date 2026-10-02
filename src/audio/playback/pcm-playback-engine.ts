import { renderSeamlessLoop } from '../domain/loop';
import type { LoadedSample, Selection } from '../domain/types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeSelection(selection: Selection, duration: number): Selection {
  const start = clamp(selection.start, 0, duration);
  const end = clamp(selection.end, start, duration);
  return { start, end };
}

/**
 * Small playback engine for captured PCM.
 *
 * WaveSurfer remains responsible for visualization and trim/zoom gestures.
 * Playback is intentionally independent so UI/library changes cannot break audio.
 */
export class PcmPlaybackEngine {
  private readonly sample: LoadedSample;
  private context: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private selection: Selection;
  private looping = false;
  // True while the live source is playing a rendered, click-free copy of the
  // loop rather than a region of the recording.
  private seamless = false;
  private position = 0;
  private startedAt = 0;
  private startedOffset = 0;
  private generation = 0;
  private endedHandler: (() => void) | null = null;

  constructor(sample: LoadedSample) {
    this.sample = sample;
    this.selection = { start: 0, end: sample.meta.duration };
  }

  onEnded(handler: () => void): void {
    this.endedHandler = handler;
  }

  isPlaying(): boolean {
    return this.source !== null;
  }

  getCurrentTime(): number {
    if (!this.source || !this.context) return this.position;

    const elapsed = Math.max(0, this.context.currentTime - this.startedAt);
    const rawTime = this.startedOffset + elapsed;
    const length = this.selection.end - this.selection.start;

    if (this.looping && length > 0) {
      const relative = rawTime - this.selection.start;
      const wrapped = ((relative % length) + length) % length;
      return this.selection.start + wrapped;
    }

    return clamp(rawTime, this.selection.start, this.selection.end);
  }

  setSelection(selection: Selection): void {
    const current = this.getCurrentTime();
    this.selection = normalizeSelection(selection, this.sample.meta.duration);
    this.position = clamp(current, this.selection.start, this.selection.end);

    if (!this.source) return;

    // A rendered loop is fixed audio. While its edges are being moved, fall
    // back to looping the recording directly so the change is heard live;
    // the seamless copy is rebuilt when playback restarts in the selection.
    if (this.seamless && this.context) {
      this.start(this.context, this.position, false);
      return;
    }

    this.source.loopStart = this.selection.start;
    this.source.loopEnd = this.selection.end;
  }

  async setLoop(looping: boolean): Promise<void> {
    if (this.looping === looping) return;

    const current = this.getCurrentTime();
    const wasPlaying = this.isPlaying();
    this.looping = looping;

    if (wasPlaying) {
      await this.play(current);
    }
  }

  async play(fromTime = this.position): Promise<void> {
    const context = await this.ensureContext();
    this.start(context, fromTime, this.looping);
  }

  private start(context: AudioContext, fromTime: number, seamless: boolean): void {
    const selection = this.selection;
    const length = selection.end - selection.start;

    if (length <= 0) return;

    const offset = fromTime >= selection.end || fromTime < selection.start
      ? selection.start
      : fromTime;

    this.stopSource();

    const source = context.createBufferSource();
    const generation = ++this.generation;

    if (seamless) {
      // What loops in the editor is the same audio the loop export writes.
      const loop = renderSeamlessLoop(this.sample, selection);
      const buffer = context.createBuffer(
        this.sample.meta.channels,
        Math.max(1, loop.frames),
        this.sample.meta.sampleRate,
      );
      loop.channelData.forEach((data, channel) => {
        buffer.copyToChannel(data as Float32Array<ArrayBuffer>, channel);
      });
      source.buffer = buffer;
      source.loop = true;
    } else {
      source.buffer = this.buffer!;
      source.loop = this.looping;
      source.loopStart = selection.start;
      source.loopEnd = selection.end;
    }

    source.connect(context.destination);

    source.onended = () => {
      if (generation !== this.generation || this.source !== source) return;
      this.source = null;
      this.position = this.looping ? this.getCurrentTime() : selection.end;
      if (!this.looping) this.endedHandler?.();
    };

    this.source = source;
    this.seamless = seamless;
    this.position = offset;
    this.startedAt = context.currentTime;
    this.startedOffset = offset;

    if (seamless) {
      source.start(0, offset - selection.start);
    } else if (this.looping) {
      source.start(0, offset);
    } else {
      source.start(0, offset, Math.max(0, selection.end - offset));
    }
  }

  pause(): number {
    const current = this.getCurrentTime();
    this.position = current;
    this.stopSource();
    return current;
  }

  async seek(time: number): Promise<number> {
    const next = clamp(time, this.selection.start, this.selection.end);
    const wasPlaying = this.isPlaying();
    this.position = next;

    if (wasPlaying) {
      await this.play(next);
    }

    return next;
  }

  async restartInsideSelection(): Promise<void> {
    if (!this.isPlaying()) {
      this.position = clamp(this.position, this.selection.start, this.selection.end);
      return;
    }

    const current = clamp(this.getCurrentTime(), this.selection.start, this.selection.end);
    await this.play(current >= this.selection.end ? this.selection.start : current);
  }

  async dispose(): Promise<void> {
    this.stopSource();
    const context = this.context;
    this.context = null;
    this.buffer = null;

    if (context && context.state !== 'closed') {
      await context.close().catch(() => undefined);
    }
  }

  private stopSource(): void {
    const source = this.source;
    if (!source) return;

    this.source = null;
    this.generation += 1;
    source.onended = null;

    try {
      source.stop();
    } catch {
      // The source may have already ended between frames.
    }

    try {
      source.disconnect();
    } catch {
      // Already disconnected.
    }
  }

  private async ensureContext(): Promise<AudioContext> {
    if (!this.context) {
      const context = new AudioContext({ latencyHint: 'interactive' });
      const buffer = context.createBuffer(
        this.sample.meta.channels,
        this.sample.meta.frames,
        this.sample.meta.sampleRate,
      );

      for (let channel = 0; channel < this.sample.meta.channels; channel += 1) {
        const data = this.sample.channelData[channel];
        // Captured PCM is always backed by a plain ArrayBuffer.
        if (data) buffer.copyToChannel(data as Float32Array<ArrayBuffer>, channel);
      }

      this.context = context;
      this.buffer = buffer;
    }

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }

    return this.context;
  }
}
