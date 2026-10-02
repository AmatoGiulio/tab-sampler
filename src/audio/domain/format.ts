export function formatSeconds(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0.00';
  if (value < 60) return value.toFixed(2);

  const minutes = Math.floor(value / 60);
  const seconds = value - minutes * 60;
  return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`;
}

export interface LoopName {
  bpm?: number;
  beats?: number;
}

export function sampleFilename(createdAt = Date.now(), loop?: LoopName): string {
  const date = new Date(createdAt);
  const pad = (value: number) => String(value).padStart(2, '0');
  // Tempo and length lead the name: that is what gets read in a browser of
  // hundreds of loops.
  const prefix = loop
    ? [
        'loop',
        ...(loop.bpm ? [`${String(loop.bpm).replace('.', '_')}bpm`] : []),
        ...(loop.beats
          ? [loop.beats % 4 === 0 ? `${loop.beats / 4}bar` : `${loop.beats}beat`]
          : []),
      ]
    : ['sample'];

  return [
    ...prefix,
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`,
  ].join('-') + '.wav';
}
