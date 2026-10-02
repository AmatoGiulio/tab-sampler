import { browser } from 'wxt/browser';

type IconState = 'idle' | 'recording' | 'recordingDim' | 'editing';

let cache = new Map<string, Record<number, ImageData>>();

// The toolbar wears the app icon: a dark squircle tile with five waveform
// bars, the centre one in the record red. Same proportions as the packaged
// icon-16/32.png, drawn here so every state shares one source.
const TILE_INSET = 0.035;
const BAR_HEIGHTS = [0.22, 0.44, 0.62, 0.44, 0.22];
const BAR_WIDTH = 0.095;
const BAR_PITCH = 0.158;
const RECORD_RED = '#FF453A';

function squircle(
  ctx: OffscreenCanvasRenderingContext2D,
  size: number,
  inset: number,
) {
  const centre = size / 2;
  const radius = centre - inset;
  const exponent = 2 / 5;
  const steps = 72;

  ctx.beginPath();
  for (let step = 0; step <= steps; step += 1) {
    const angle = (step / steps) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = centre + radius * Math.sign(cos) * Math.abs(cos) ** exponent;
    const y = centre + radius * Math.sign(sin) * Math.abs(sin) ** exponent;
    if (step === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawBars(
  ctx: OffscreenCanvasRenderingContext2D,
  size: number,
  tile: number,
  whiteAlpha: number,
) {
  const centre = size / 2;
  const width = tile * BAR_WIDTH;

  ctx.lineWidth = width;
  ctx.lineCap = 'round';

  BAR_HEIGHTS.forEach((height, index) => {
    const x = centre + (index - 2) * tile * BAR_PITCH;
    // Round caps add half a bar width at each end.
    const half = Math.max(0, (tile * height - width) / 2);

    ctx.strokeStyle = index === 2 ? RECORD_RED : `rgba(247,247,245,${whiteAlpha})`;
    ctx.beginPath();
    ctx.moveTo(x, centre - half);
    ctx.lineTo(x, centre + half + 0.01);
    ctx.stroke();
  });
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
    const inset = size * TILE_INSET;
    const tile = size - inset * 2;

    squircle(ctx, size, inset);
    const gradient = ctx.createLinearGradient(0, inset, 0, size - inset);
    gradient.addColorStop(0, 'rgb(58,58,63)');
    gradient.addColorStop(1, 'rgb(19,19,22)');
    ctx.fillStyle = gradient;
    ctx.fill();

    // A waiting sample dims the white bars; the tile itself never changes.
    drawBars(ctx, size, tile, state === 'editing' ? 0.72 : 1);
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

// A tab can close or navigate between the decision to paint its icon and the
// call landing. That must never abort the state change that asked for it.
function tolerant<T>(tabId: number | undefined, call: Promise<T>): Promise<T | void> {
  return tabId === undefined ? call : call.catch(() => undefined);
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

  await tolerant(
    tabId,
    Promise.all([
      browser.action.setIcon({
        ...details,
        imageData: getIconData(state),
      }),
      browser.action.setTitle({ ...details, title }),
      clearBadge(tabId),
    ]),
  );
}

export function setIdleAction(tabId?: number): Promise<void> {
  return applyIcon('idle', 'Click to capture tab audio', tabId);
}

export function setRecordingAction(tabId?: number): Promise<void> {
  return applyIcon('recording', 'Recording - click to stop', tabId);
}

export async function setRecordingPulse(
  bright: boolean,
  tabId?: number,
): Promise<void> {
  const details = tabId === undefined ? {} : { tabId };

  await tolerant(
    tabId,
    browser.action.setIcon({
      ...details,
      imageData: getIconData(bright ? 'recording' : 'recordingDim'),
    }),
  );
}

export function setEditingAction(tabId?: number): Promise<void> {
  return applyIcon('editing', 'Open captured sample', tabId);
}
