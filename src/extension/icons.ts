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

function drawWaveGlyph(
  ctx: OffscreenCanvasRenderingContext2D,
  size: number,
  color: string,
) {
  const s = size / 16;
  const cx = size / 2;
  const cy = size / 2;
  const bars = [
    { x: -4.6, h: 3.0 },
    { x: -2.3, h: 6.2 },
    { x: 0, h: 9.2 },
    { x: 2.3, h: 6.2 },
    { x: 4.6, h: 3.0 },
  ];

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4 * s;
  ctx.lineCap = 'round';

  for (const bar of bars) {
    ctx.beginPath();
    ctx.moveTo(cx + bar.x * s, cy - (bar.h * s) / 2);
    ctx.lineTo(cx + bar.x * s, cy + (bar.h * s) / 2);
    ctx.stroke();
  }
}

function drawIcon(size: number, state: IconState): ImageData {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to create toolbar icon canvas');

  const s = size / 16;
  ctx.clearRect(0, 0, size, size);

  if (state === 'recording' || state === 'recordingDim') {
    const bright = state === 'recording';

    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 5.7 * s, 0, Math.PI * 2);
    ctx.fillStyle = bright
      ? '#FF3B30'
      : '#D92E25';
    ctx.fill();
  } else {
    roundedRect(ctx, 1.3 * s, 2.0 * s, 13.4 * s, 12 * s, 3.3 * s);
    const gradient = ctx.createLinearGradient(0, 2 * s, 0, 14 * s);
    gradient.addColorStop(0, 'rgba(64,64,67,.98)');
    gradient.addColorStop(1, 'rgba(26,26,28,.98)');
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,.34)';
    ctx.lineWidth = .7 * s;
    ctx.stroke();

    drawWaveGlyph(
      ctx,
      size,
      state === 'editing'
        ? 'rgba(255,255,255,.76)'
        : 'rgba(255,255,255,.96)',
    );
  }

  return ctx.getImageData(0, 0, size, size);
}

function getIconData(state: IconState): Record<number, ImageData> {
  const cached = cache.get(state);
  if (cached) return cached;

  const data = {
    16: drawIcon(16, state),
    32: drawIcon(32, state),
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
    browser.action.setTitle({ ...details, title }),
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
