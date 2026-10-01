import { browser } from 'wxt/browser';

const iconPaths = {
  recording: {
    16: 'icons/recording-16.png',
    32: 'icons/recording-32.png',
  },
  recordingDim: {
    16: 'icons/recording-dim-16.png',
    32: 'icons/recording-dim-32.png',
  },
} as const;

const REC_BADGE = {
  text: 'REC',
  background: '#E72A24',
  textColor: '#FFFFFF',
} as const;

let idleIconData: Record<number, ImageData> | null = null;

function drawIdleIcon(size: number): ImageData {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to create toolbar icon canvas');

  const scale = size / 16;
  const cx = size / 2;
  const cy = size / 2;

  ctx.clearRect(0, 0, size, size);

  // Record-ready glyph: a strong outer ring plus a small center dot.
  // At toolbar size this reads as "record/capture", not as a generic circle.
  ctx.beginPath();
  ctx.arc(cx, cy, 5.15 * scale, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(236, 236, 238, 0.96)';
  ctx.lineWidth = 1.55 * scale;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, 1.55 * scale, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(236, 236, 238, 0.96)';
  ctx.fill();

  return ctx.getImageData(0, 0, size, size);
}

function getIdleIconData(): Record<number, ImageData> {
  if (!idleIconData) {
    idleIconData = {
      16: drawIdleIcon(16),
      32: drawIdleIcon(32),
    };
  }
  return idleIconData;
}

async function clearBadge(tabId?: number): Promise<void> {
  const details = tabId === undefined ? {} : { tabId };

  await Promise.all([
    browser.action.setBadgeText({ ...details, text: '' }),
    browser.action.setBadgeBackgroundColor({
      ...details,
      color: '#00000000',
    }),
  ]);
}

export async function setIdleAction(tabId?: number): Promise<void> {
  const details = tabId === undefined ? {} : { tabId };

  await Promise.all([
    browser.action.setIcon({
      ...details,
      imageData: getIdleIconData(),
    }),
    browser.action.setTitle({
      ...details,
      title: 'Click to capture tab audio',
    }),
    clearBadge(tabId),
  ]);
}

export async function setRecordingAction(tabId?: number): Promise<void> {
  const details = tabId === undefined ? {} : { tabId };

  await Promise.all([
    browser.action.setIcon({ ...details, path: iconPaths.recording }),
    browser.action.setTitle({
      ...details,
      title: 'Recording - click to stop',
    }),
    browser.action.setBadgeText({
      ...details,
      text: REC_BADGE.text,
    }),
    browser.action.setBadgeBackgroundColor({
      ...details,
      color: REC_BADGE.background,
    }),
    browser.action.setBadgeTextColor({
      ...details,
      color: REC_BADGE.textColor,
    }),
  ]);
}

export function setRecordingPulse(
  bright: boolean,
  tabId?: number,
): Promise<void> {
  const details = tabId === undefined ? {} : { tabId };

  return browser.action.setIcon({
    ...details,
    path: bright ? iconPaths.recording : iconPaths.recordingDim,
  });
}

export async function setEditingAction(tabId?: number): Promise<void> {
  const details = tabId === undefined ? {} : { tabId };

  await Promise.all([
    browser.action.setIcon({
      ...details,
      imageData: getIdleIconData(),
    }),
    browser.action.setTitle({
      ...details,
      title: 'Open captured sample',
    }),
    clearBadge(tabId),
  ]);
}
