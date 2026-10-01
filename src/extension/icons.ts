import { browser } from 'wxt/browser';

type IconState = 'idle' | 'recording' | 'recordingDim' | 'editing';

let cache = new Map<string, Record<number, ImageData>>();

function roundedRect(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawPillIcon(size: number, state: IconState): ImageData {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to create toolbar icon canvas');

  const s = size / 16;
  ctx.clearRect(0, 0, size, size);

  const x = 0.6 * s;
  const y = 3.25 * s;
  const w = 14.8 * s;
  const h = 9.5 * s;
  const r = 3.2 * s;

  const isRecording = state === 'recording' || state === 'recordingDim';

  roundedRect(ctx, x, y, w, h, r);

  if (isRecording) {
    const gradient = ctx.createLinearGradient(0, y, 0, y + h);
    gradient.addColorStop(0, state === 'recording' ? '#FF453A' : '#D52C27');
    gradient.addColorStop(1, state === 'recording' ? '#E6241D' : '#AE211C');
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.strokeStyle = state === 'recording'
      ? 'rgba(255,255,255,.26)'
      : 'rgba(255,255,255,.14)';
    ctx.lineWidth = .65 * s;
    ctx.stroke();
  } else {
    const gradient = ctx.createLinearGradient(0, y, 0, y + h);
    gradient.addColorStop(0, 'rgba(54,54,56,.98)');
    gradient.addColorStop(1, 'rgba(24,24,26,.98)');
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,.34)';
    ctx.lineWidth = .65 * s;
    ctx.stroke();
  }

  // Left-side capture marker.
  const markerX = 3.55 * s;
  const markerY = 8 * s;
  if (isRecording) {
    ctx.beginPath();
    ctx.arc(markerX, markerY, 1.45 * s, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.globalAlpha = state === 'recording' ? 1 : .72;
    ctx.fill();
    ctx.globalAlpha = 1;
  } else {
    ctx.beginPath();
    ctx.arc(markerX, markerY, 1.25 * s, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,.94)';
    ctx.lineWidth = .8 * s;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(markerX, markerY, .45 * s, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.94)';
    ctx.fill();
  }

  ctx.fillStyle = isRecording
    ? '#FFFFFF'
    : 'rgba(255,255,255,.94)';
  ctx.font = `700 ${4.75 * s}px Arial, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('REC', 6.05 * s, 8.1 * s);

  if (state === 'editing') {
    ctx.globalAlpha = .78;
  }

  return ctx.getImageData(0, 0, size, size);
}

function getIconData(state: IconState): Record<number, ImageData> {
  const existing = cache.get(state);
  if (existing) return existing;

  const data = {
    16: drawPillIcon(16, state),
    32: drawPillIcon(32, state),
  };

  cache.set(state, data);
  return data;
}

async function clearBadge(tabId?: number): Promise<void> {
  const details = tabId === undefined ? {} : { tabId };
  await browser.action.setBadgeText({ ...details, text: '' });
}

async function applyIcon(
  state: IconState,
  title: string,
  tabId?: number,
): Promise<void> {
  const details = tabId === undefined ? {} : { tabId };

  await Promise.all([
    browser.action.setIcon({
      ...details,
      imageData: getIconData(state),
    }),
    browser.action.setTitle({
      ...details,
      title,
    }),
    clearBadge(tabId),
  ]);
}

export function setIdleAction(tabId?: number): Promise<void> {
  return applyIcon('idle', 'Click to capture tab audio', tabId);
}

export function setRecordingAction(tabId?: number): Promise<void> {
  return applyIcon('recording', 'Recording - click to stop', tabId);
}

export function setRecordingPulse(
  bright: boolean,
  tabId?: number,
): Promise<void> {
  const details = tabId === undefined ? {} : { tabId };

  return browser.action.setIcon({
    ...details,
    imageData: getIconData(bright ? 'recording' : 'recordingDim'),
  });
}

export function setEditingAction(tabId?: number): Promise<void> {
  return applyIcon('editing', 'Open captured sample', tabId);
}
