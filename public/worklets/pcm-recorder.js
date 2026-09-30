const CHUNK_FRAMES = 16384;

class PcmRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.channelBuffers = [];
    this.channelCount = 0;
    this.writeOffset = 0;

    this.port.onmessage = (event) => {
      if (event.data?.type === 'flush') {
        this.emitChunk(this.writeOffset);
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

  emitChunk(frames) {
    if (frames <= 0 || this.channelCount === 0) return;

    // Full chunks can transfer the worklet-owned buffers directly with no copy.
    // Only the final partial flush needs a right-sized copy.
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
