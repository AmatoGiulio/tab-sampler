export function formatSeconds(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0.00';
  if (value < 60) return value.toFixed(2);

  const minutes = Math.floor(value / 60);
  const seconds = value - minutes * 60;
  return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`;
}

export function sampleFilename(createdAt = Date.now()): string {
  const date = new Date(createdAt);
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    'sample',
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`,
  ].join('-') + '.wav';
}
