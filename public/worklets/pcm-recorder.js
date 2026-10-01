const CHUNK_FRAMES = 16384;
const METER_BLOCKS = 12;

class PcmRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.channelBuffers = [];
    this.channelCount = 0;
    this.writeOffset = 0;
    this.meterBlocks = 0;
    this.meterPeak = 0;
    this.meterSumSquares = 0;
    this.meterSamples = 0;

    this.port.onmessage = (event) => {
      if (event.data?.type === 'flush') {
        this.emitChunk(this.writeOffset);
        this.emitMeter();
        this.port.postMessage({ type: 'flushed' });
      }
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    if (this.channelCount !== input.length) {
      if (this.writeOffset > 0) this.emitChunk(this.writeOffset);
      this.channelCount = input.length;
      this.channelBuffers = Array.from(
        { length: this.channelCount },
        () => new Float32Array(CHUNK_FRAMES),
      );
      this.writeOffset = 0;
    }

    const blockFrames = input[0]?.length ?? 0;
    let readOffset = 0;

    for (let channel = 0; channel < this.channelCount; channel += 1) {
      const source = input[channel];
      if (!source) continue;
      for (let i = 0; i < source.length; i += 1) {
        const sample = source[i];
        const absolute = Math.abs(sample);
        if (absolute > this.meterPeak) this.meterPeak = absolute;
        this.meterSumSquares += sample * sample;
        this.meterSamples += 1;
      }
    }

    this.meterBlocks += 1;
    if (this.meterBlocks >= METER_BLOCKS) this.emitMeter();

    while (readOffset < blockFrames) {
      const available = CHUNK_FRAMES - this.writeOffset;
      const framesToCopy = Math.min(available, blockFrames - readOffset);

      for (let channel = 0; channel < this.channelCount; channel += 1) {
        const source = input[channel];
        const target = this.channelBuffers[channel];
        if (!source || !target) continue;
        target.set(
          source.subarray(readOffset, readOffset + framesToCopy),
          this.writeOffset,
        );
      }

      this.writeOffset += framesToCopy;
      readOffset += framesToCopy;

      if (this.writeOffset === CHUNK_FRAMES) {
        this.emitChunk(CHUNK_FRAMES);
      }
    }

    return true;
  }

  emitMeter() {
    if (this.meterSamples <= 0) return;

    const rms = Math.sqrt(this.meterSumSquares / this.meterSamples);
    this.port.postMessage({
      type: 'meter',
      peak: Math.min(1, this.meterPeak),
      rms: Math.min(1, rms),
    });

    this.meterBlocks = 0;
    this.meterPeak = 0;
    this.meterSumSquares = 0;
    this.meterSamples = 0;
  }

  emitChunk(frames) {
    if (frames <= 0 || this.channelCount === 0) return;

    const fullChunk = frames === CHUNK_FRAMES;
    const channelBuffers = this.channelBuffers.map((source) => {
      if (fullChunk) return source.buffer;

      const chunk = new Float32Array(frames);
      chunk.set(source.subarray(0, frames));
      return chunk.buffer;
    });

    this.port.postMessage(
      {
        type: 'chunk',
        frames,
        channels: channelBuffers,
      },
      channelBuffers,
    );

    this.channelBuffers = Array.from(
      { length: this.channelCount },
      () => new Float32Array(CHUNK_FRAMES),
    );
    this.writeOffset = 0;
  }
}

registerProcessor('pcm-recorder', PcmRecorderProcessor);
