export interface TempoEstimate {
  /** Beats per minute. */
  bpm: number;
  /** 0..1, how periodic the onsets are at that tempo. */
  confidence: number;
}

const ENVELOPE_RATE = 200;
const MIN_BPM = 60;
const MAX_BPM = 200;
const BPM_STEP = 0.1;
const REFINE_RANGE = 1.5;
const REFINE_STEP = 0.01;
const MIN_SECONDS = 1.5;
const MAX_SECONDS = 30;
const MAX_MULTIPLE = 16;
const SMOOTHING_REACH = 3;
const BAR_WEIGHT = 0.5;
const ONSET_FLOOR = 0.1;
const MIN_CONFIDENCE = 0.12;
const PREFERRED_BPM = 120;
const PREFERRED_SPREAD_OCTAVES = 0.7;
const INTEGER_PULL = 0.35;

/**
 * Onset strength at ENVELOPE_RATE Hz: the rise in log energy of the full band
 * plus a first-difference (treble-leaning) band, so hats and snares count as
 * much as kicks.
 */
function onsetEnvelope(channels: Float32Array[], sampleRate: number): Float32Array {
  const frames = channels[0]?.length ?? 0;
  const hop = Math.max(1, Math.round(sampleRate / ENVELOPE_RATE));
  const count = Math.floor(frames / hop);
  const envelope = new Float32Array(Math.max(0, count));
  const gain = 1 / Math.max(1, channels.length);

  const full = new Float32Array(count);
  const high = new Float32Array(count);
  let previousSample = 0;

  for (let index = 0; index < count; index += 1) {
    const from = index * hop;
    let fullEnergy = 0;
    let highEnergy = 0;

    for (let frame = from; frame < from + hop; frame += 1) {
      let mono = 0;
      for (const channel of channels) mono += channel[frame] ?? 0;
      mono *= gain;

      const difference = mono - previousSample;
      previousSample = mono;
      fullEnergy += mono * mono;
      highEnergy += difference * difference;
    }

    full[index] = fullEnergy / hop;
    high[index] = highEnergy / hop;
  }

  // Sustained notes beat against each other tens of times a second. That
  // flutter is periodic too, and reads as a confident, wrong tempo. A short
  // symmetric smoothing removes it and leaves onset timing where it was.
  const smooth = (values: Float32Array, index: number) => {
    let sum = 0;
    let weight = 0;
    for (let offset = -SMOOTHING_REACH; offset <= SMOOTHING_REACH; offset += 1) {
      const tap = SMOOTHING_REACH + 1 - Math.abs(offset);
      const value = values[index + offset];
      if (value === undefined) continue;
      sum += value * tap;
      weight += tap;
    }
    return sum / weight;
  };

  let previousFull = 0;
  let previousHigh = 0;

  for (let index = 0; index < count; index += 1) {
    const logFull = Math.log1p(smooth(full, index) * 1000);
    const logHigh = Math.log1p(smooth(high, index) * 1000);

    if (index > 0) {
      // Only rises that could be a note starting count. What is left of the
      // flutter after smoothing sits well under this; a drum hit is far over.
      envelope[index] = Math.max(
        0,
        Math.max(0, logFull - previousFull) + Math.max(0, logHigh - previousHigh) - ONSET_FLOOR,
      );
    }

    previousFull = logFull;
    previousHigh = logHigh;
  }

  let mean = 0;
  for (const value of envelope) mean += value;
  mean /= Math.max(1, envelope.length);
  for (let index = 0; index < envelope.length; index += 1) {
    envelope[index] = (envelope[index] ?? 0) - mean;
  }

  return envelope;
}

function autocorrelation(signal: Float32Array, maxLag: number): Float32Array {
  const result = new Float32Array(maxLag + 1);
  const length = signal.length;

  for (let lag = 0; lag <= maxLag; lag += 1) {
    let sum = 0;
    for (let index = lag; index < length; index += 1) {
      sum += (signal[index] ?? 0) * (signal[index - lag] ?? 0);
    }
    result[lag] = sum / (length - lag);
  }

  const energy = result[0] ?? 0;
  if (energy > 0) {
    for (let lag = 0; lag <= maxLag; lag += 1) {
      result[lag] = (result[lag] ?? 0) / energy;
    }
  }

  return result;
}

/**
 * Estimates the tempo of captured audio.
 *
 * Scores every candidate tempo by how strongly the onset envelope repeats
 * across whole numbers of beats, weighted toward the range most music sits
 * in so that half and double tempo resolve sensibly. Returns null when the
 * audio is too short or has no stable pulse.
 */
export function detectTempo(
  channels: Float32Array[],
  sampleRate: number,
): TempoEstimate | null {
  const frames = channels[0]?.length ?? 0;
  if (sampleRate <= 0 || frames < sampleRate * MIN_SECONDS) return null;

  // Half a minute is plenty to lock a tempo and keeps the analysis instant.
  const window = Math.min(frames, Math.round(sampleRate * MAX_SECONDS));
  const envelope = onsetEnvelope(
    channels.map((channel) => channel.subarray(0, window)),
    sampleRate,
  );
  const rate = sampleRate / Math.max(1, Math.round(sampleRate / ENVELOPE_RATE));
  const longestBeat = (60 / MIN_BPM) * rate;
  // Long lags are what make the estimate precise: an error in the beat
  // length is multiplied by the number of beats it is measured across.
  const maxLag = Math.min(
    Math.floor(envelope.length / 2),
    Math.ceil(longestBeat * MAX_MULTIPLE),
  );
  if (maxLag < longestBeat) return null;

  const correlation = autocorrelation(envelope, maxLag);
  if (!((correlation[0] ?? 0) > 0)) return null;

  const at = (lag: number) => {
    const low = Math.floor(lag);
    const mix = lag - low;
    return (correlation[low] ?? 0) * (1 - mix) + (correlation[low + 1] ?? 0) * mix;
  };

  const periodicityAt = (bpm: number) => {
    const lag = (60 / bpm) * rate;
    let sum = 0;
    let terms = 0;

    for (let multiple = 1; multiple <= MAX_MULTIPLE && lag * multiple < maxLag; multiple += 1) {
      sum += at(lag * multiple);
      terms += 1;
    }

    return terms > 0 ? sum / terms : -Infinity;
  };

  // A real beat also repeats bar by bar. A candidate at two thirds or three
  // halves of the tempo lines up with eighth notes just as well, but its
  // "bars" land in the middle of the pattern: that is what tells them apart.
  const barPeriodicityAt = (bpm: number) => {
    const bar = (60 / bpm) * rate * 4;
    if (bar >= maxLag) return null;
    return bar * 2 < maxLag ? (at(bar) + at(bar * 2)) / 2 : at(bar);
  };

  // Pass 1: which tempo, among its relatives, is the musical one.
  let coarse = { bpm: 0, score: -Infinity };

  for (let bpm = MIN_BPM; bpm <= MAX_BPM; bpm += BPM_STEP) {
    const octaves = Math.log2(bpm / PREFERRED_BPM) / PREFERRED_SPREAD_OCTAVES;
    const beat = periodicityAt(bpm);
    const bar = barPeriodicityAt(bpm);
    const evidence = bar === null ? beat : beat * (1 - BAR_WEIGHT) + bar * BAR_WEIGHT;
    const score = evidence * Math.exp(-0.5 * octaves * octaves);
    if (score > coarse.score) coarse = { bpm, score };
  }

  // Pass 2: the exact value, without the preference pulling it off the peak.
  let best = { bpm: coarse.bpm, periodicity: periodicityAt(coarse.bpm) };

  for (let bpm = coarse.bpm - REFINE_RANGE; bpm <= coarse.bpm + REFINE_RANGE; bpm += REFINE_STEP) {
    const periodicity = periodicityAt(bpm);
    if (periodicity > best.periodicity) best = { bpm, periodicity };
  }

  if (best.periodicity < MIN_CONFIDENCE) return null;

  // Produced music is almost always at a whole tempo; a near-whole estimate
  // is more likely measurement error than a deliberate fraction.
  const whole = Math.round(best.bpm);
  const bpm = Math.abs(best.bpm - whole) <= INTEGER_PULL
    ? whole
    : Math.round(best.bpm * 10) / 10;

  return { bpm, confidence: Math.min(1, Math.max(0, best.periodicity)) };
}
