import { browser } from 'wxt/browser';
import type { SampleMeta } from '../audio/domain/types';
import { getLatestSampleMeta } from '../audio/store/sample-store';
import {
  setEditingAction,
  setIdleAction,
  setRecordingAction,
  setRecordingPulse,
} from '../extension/icons';
import { onMessage, sendMessage } from '../extension/messaging';

const OFFSCREEN_URL = 'offscreen.html';
const EDITOR_URL = 'editor.html';
const OVERLAY_HOST_ID = '__tab_sampler_overlay__';

let busy = false;
let recordingTabId: number | null = null;
let lastMeterForwardAt = 0;

type IslandMessage =
  | { type: 'tab-sampler:island-meter'; peak: number; rms: number }
  | { type: 'tab-sampler:island-freeze' }
  | { type: 'tab-sampler:island-expand' }
  | { type: 'tab-sampler:island-close' };

async function sendIslandMessage(
  tabId: number,
  message: IslandMessage,
): Promise<void> {
  await browser.tabs.sendMessage(tabId, message);
}

async function mountSamplerSurface(
  tabId: number,
  initialMode: 'recording' | 'editor',
): Promise<void> {
  const editorUrl = browser.runtime.getURL(EDITOR_URL);

  await browser.scripting.executeScript({
    target: { tabId },
    args: [editorUrl, OVERLAY_HOST_ID, initialMode],
    func: (src, hostId, mode) => {
      type SamplerWindow = Window & {
        __tabSamplerSurfaceCleanup?: () => void;
      };

      const isolatedWindow = window as SamplerWindow;
      isolatedWindow.__tabSamplerSurfaceCleanup?.();

      document.getElementById(hostId)?.remove();

      const host = document.createElement('div');
      host.id = hostId;
      host.style.cssText = [
        'all: initial',
        'position: fixed',
        'inset: 0',
        'z-index: 2147483647',
        'pointer-events: none',
        'contain: layout style paint',
      ].join(';');

      const shadow = host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = `
        :host {
          all: initial;
        }

        .stage {
          position: fixed;
          inset: 0;
          pointer-events: none;
        }

        .surface {
          position: absolute;
          top: 16px;
          right: 16px;
          width: 44px;
          height: 44px;
          overflow: hidden;
          pointer-events: none;
          border-radius: 22px;
          corner-shape: squircle;
          isolation: isolate;
          background:
            radial-gradient(
              120% 140% at 22% -28%,
              rgba(255,255,255,.105) 0%,
              rgba(255,255,255,.018) 34%,
              transparent 62%
            ),
            linear-gradient(
              180deg,
              rgba(24,24,27,.88) 0%,
              rgba(12,12,15,.91) 100%
            );
          -webkit-backdrop-filter:
            blur(34px)
            saturate(165%)
            brightness(88%)
            contrast(104%);
          backdrop-filter:
            blur(34px)
            saturate(165%)
            brightness(88%)
            contrast(104%);
          box-shadow:
            0 12px 34px rgba(0,0,0,.29),
            0 1px 0 rgba(255,255,255,.17) inset,
            0 0 0 1px rgba(255,255,255,.035) inset,
            0 -1px 0 rgba(0,0,0,.24) inset;
          transform-origin: 100% 0%;
          transform: translate3d(0,0,0);
          will-change: width, height, border-radius, box-shadow;
          transition:
            width 390ms cubic-bezier(.16,1,.3,1),
            height 390ms cubic-bezier(.16,1,.3,1),
            border-radius 390ms cubic-bezier(.16,1,.3,1),
            box-shadow 360ms cubic-bezier(.16,1,.3,1),
            opacity 150ms ease,
            transform 180ms ease;
        }

        .surface::before {
          content: '';
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          border-radius: inherit;
          corner-shape: inherit;
          background:
            linear-gradient(
              132deg,
              rgba(255,255,255,.095) 0%,
              rgba(255,255,255,.018) 19%,
              transparent 44%
            ),
            radial-gradient(
              76% 48% at 72% 105%,
              rgba(255,255,255,.024),
              transparent 72%
            );
          mix-blend-mode: screen;
        }

        .surface::after {
          content: '';
          position: absolute;
          inset: 1px;
          z-index: 5;
          pointer-events: none;
          border-radius: inherit;
          corner-shape: inherit;
          box-shadow:
            0 0 0 1px rgba(255,255,255,.038) inset,
            0 0 18px rgba(255,255,255,.014) inset;
        }

        .surface.is-live {
          width: 198px;
          height: 50px;
          border-radius: 25px;
          pointer-events: auto;
          cursor: pointer;
        }

        .surface.is-live .stop-control {
          opacity: 1;
        }

        .surface.is-frozen {
          cursor: default;
        }

        .surface.is-expanded {
          width: 352px;
          height: 336px;
          border-radius: 48px;
          pointer-events: auto;
          box-shadow:
            0 26px 64px rgba(0,0,0,.36),
            0 8px 22px rgba(0,0,0,.20),
            0 1px 0 rgba(255,255,255,.18) inset,
            0 0 0 1px rgba(255,255,255,.035) inset,
            0 -1px 0 rgba(0,0,0,.28) inset;
        }

        .surface.is-closing {
          opacity: 0;
          transform: translateY(-4px) scale(.988);
          transition-duration: 120ms;
        }

        .recorder {
          position: absolute;
          z-index: 2;
          inset: 0;
          display: grid;
          grid-template-columns: 24px 1fr 42px;
          align-items: center;
          gap: 10px;
          padding: 0 13px 0 10px;
          opacity: 0;
          transform: translateY(1px);
          transition:
            opacity 160ms ease 90ms,
            transform 220ms cubic-bezier(.2,.8,.2,1) 70ms;
        }

        .surface.is-live .recorder {
          opacity: 1;
          transform: translateY(0);
        }

        .surface.is-expanded .recorder {
          opacity: 0;
          transform: translateY(-8px) scale(.98);
          transition:
            opacity 90ms ease,
            transform 150ms cubic-bezier(.4,0,.8,.2);
        }

        .stop-control {
          width: 24px;
          height: 24px;
          display: block;
          position: relative;
          padding: 0;
          border: 0;
          border-radius: 999px;
          background:
            radial-gradient(
              circle at 34% 28%,
              rgba(255,255,255,.18),
              transparent 42%
            ),
            linear-gradient(
              180deg,
              #ff4b42 0%,
              #ff3129 54%,
              #e92721 100%
            );
          box-shadow:
            0 4px 12px rgba(255,48,40,.18),
            0 1px 0 rgba(255,255,255,.22) inset,
            0 -1px 0 rgba(110,0,0,.16) inset;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          transition:
            filter 120ms ease,
            opacity 120ms ease,
            background 120ms ease,
            box-shadow 120ms ease;
          transform: translateZ(0);
          will-change: filter;
        }

        .stop-control::before {
          content: '';
          position: absolute;
          left: 50%;
          top: 50%;
          width: 7px;
          height: 7px;
          margin-left: -3.5px;
          margin-top: -3.5px;
          border-radius: 2px;
          background: rgba(255,255,255,.96);
          box-shadow: 0 0 4px rgba(255,255,255,.12);
          pointer-events: none;
          transform: translateZ(0);
        }

        .stop-control:hover {
          filter: brightness(1.04);
        }

        .stop-control:active {
          filter: brightness(.96);
        }

        .surface.is-frozen .stop-control {
          opacity: .58;
          cursor: default;
          filter: saturate(.72);
        }

        .surface:not(.is-live) .stop-control {
          opacity: 0;
        }

        .wave-wrap {
          position: relative;
          min-width: 0;
          height: 28px;
          display: grid;
          align-items: center;
          overflow: hidden;
          -webkit-mask-image: linear-gradient(
            90deg,
            transparent 0%,
            rgba(0,0,0,.5) 10%,
            #000 22%,
            #000 88%,
            rgba(0,0,0,.7) 95%,
            transparent 100%
          );
          mask-image: linear-gradient(
            90deg,
            transparent 0%,
            rgba(0,0,0,.5) 10%,
            #000 22%,
            #000 88%,
            rgba(0,0,0,.7) 95%,
            transparent 100%
          );
        }

        canvas {
          width: 100%;
          height: 28px;
          display: block;
        }

        .timer {
          color: rgba(255,255,255,.86);
          font-family:
            ui-monospace,
            "SFMono-Regular",
            "SF Mono",
            "Roboto Mono",
            monospace;
          font-size: 10px;
          font-weight: 590;
          line-height: 1;
          letter-spacing: -.055em;
          font-variant-numeric: tabular-nums;
          text-align: right;
          white-space: nowrap;
        }

        iframe {
          position: absolute;
          z-index: 3;
          inset: 0;
          display: block;
          width: 352px;
          height: 336px;
          border: 0;
          background: transparent;
          color-scheme: dark;
          opacity: 0;
          pointer-events: none;
          transform: translateY(6px) scale(.994);
          transition:
            opacity 150ms ease,
            transform 240ms cubic-bezier(.2,.8,.2,1);
        }

        .surface.is-editor-ready iframe {
          opacity: 1;
          pointer-events: auto;
          transform: translateY(0) scale(1);
        }

        @media (prefers-reduced-motion: reduce) {
          .surface,
          .recorder,
          iframe {
            transition-duration: 1ms !important;
            transition-delay: 0ms !important;
          }
        }
      `;

      const stage = document.createElement('div');
      stage.className = 'stage';

      const surface = document.createElement('div');
      surface.className = 'surface';

      const recorder = document.createElement('div');
      recorder.className = 'recorder';

      const stopControl = document.createElement('button');
      stopControl.className = 'stop-control';
      stopControl.type = 'button';
      stopControl.setAttribute('aria-label', 'Stop recording');
      stopControl.title = 'Stop recording';

      const waveWrap = document.createElement('div');
      waveWrap.className = 'wave-wrap';

      const canvas = document.createElement('canvas');
      waveWrap.append(canvas);

      const timer = document.createElement('span');
      timer.className = 'timer';
      timer.textContent = '0:00';

      recorder.append(stopControl, waveWrap, timer);

      const frame = document.createElement('iframe');
      frame.title = 'Tab Sampler editor';
      frame.allow = 'autoplay';
      frame.setAttribute('aria-label', 'Tab Sampler audio editor');

      surface.append(recorder, frame);
      stage.append(surface);
      shadow.append(style, stage);
      document.documentElement.append(host);

      const context = canvas.getContext('2d');
      const peaks = Array.from({ length: 30 }, () => 0.04);
      let smoothedPeak = 0.04;
      let startedAt = performance.now();
      let frozenAt: number | null = null;
      let timerRaf = 0;
      let closed = false;

      const resizeCanvas = () => {
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        const width = Math.max(1, Math.round(rect.width * dpr));
        const height = Math.max(1, Math.round(rect.height * dpr));

        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }

        return { width, height, dpr };
      };

      const drawWave = () => {
        if (!context) return;

        const { width, height, dpr } = resizeCanvas();
        context.clearRect(0, 0, width, height);

        const count = peaks.length;
        const usable = width - 2 * dpr;
        const step = usable / Math.max(1, count - 1);

        context.lineWidth = Math.max(1.25 * dpr, 1);
        context.lineCap = 'round';
        context.strokeStyle = 'rgba(246,246,244,.9)';

        for (let index = 0; index < count; index += 1) {
          const value = peaks[index] ?? 0;
          const normalized = Math.pow(Math.max(.035, value), .58);
          const barHeight = Math.max(
            1.3 * dpr,
            normalized * height * .78,
          );
          const x = dpr + index * step;
          const y1 = (height - barHeight) / 2;
          const y2 = y1 + barHeight;

          const edge = Math.min(index / 7, (count - 1 - index) / 5, 1);
          context.globalAlpha = Math.max(.06, edge);

          context.beginPath();
          context.moveTo(x, y1);
          context.lineTo(x, y2);
          context.stroke();
        }

        context.globalAlpha = 1;
      };

      const pushMeter = (peak: number, rms: number) => {
        if (frozenAt !== null) return;

        const energy = Math.max(peak * .74, rms * 1.8);
        smoothedPeak = smoothedPeak * .52 + energy * .48;
        peaks.push(Math.max(.025, Math.min(1, smoothedPeak)));
        peaks.shift();
        drawWave();
      };

      const renderTimer = () => {
        if (closed) return;

        const now = frozenAt ?? performance.now();
        const elapsedMs = Math.max(0, now - startedAt);
        const totalSeconds = Math.floor(elapsedMs / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        timer.textContent = `${minutes}:${String(seconds).padStart(2, '0')}`;

        timerRaf = window.requestAnimationFrame(renderTimer);
      };

      const freeze = () => {
        if (frozenAt !== null) return;
        frozenAt = performance.now();
        surface.classList.add('is-frozen');
      };

      const requestStop = () => {
        if (
          closed ||
          frozenAt !== null ||
          surface.classList.contains('is-expanded')
        ) {
          return;
        }

        freeze();
        void chrome.runtime.sendMessage({
          type: 'tab-sampler:stop-request',
        });
      };

      const expand = () => {
        freeze();
        surface.classList.add('is-expanded');
        frame.src = src;
      };

      const close = () => {
        if (closed) return;
        closed = true;
        surface.classList.add('is-closing');
        window.cancelAnimationFrame(timerRaf);

        window.setTimeout(() => {
          cleanup();
        }, 140);
      };

      const runtimeListener = (
        message: {
          type?: string;
          peak?: number;
          rms?: number;
        },
      ) => {
        if (message?.type === 'tab-sampler:island-meter') {
          pushMeter(message.peak ?? 0, message.rms ?? 0);
          return;
        }

        if (message?.type === 'tab-sampler:island-freeze') {
          freeze();
          return;
        }

        if (message?.type === 'tab-sampler:island-expand') {
          expand();
          return;
        }

        if (message?.type === 'tab-sampler:island-close') {
          close();
        }
      };

      const onWindowMessage = (event: MessageEvent) => {
        if (event.source !== frame.contentWindow) return;

        if (event.data?.type === 'tab-sampler:ready') {
          surface.classList.add('is-editor-ready');
          return;
        }

        if (event.data?.type === 'tab-sampler:close') {
          close();
        }
      };

      const onPointerDown = (event: PointerEvent) => {
        if (!surface.classList.contains('is-expanded')) return;
        if (event.composedPath().includes(host)) return;
        close();
      };

      const onKeyDown = (event: KeyboardEvent) => {
        if (
          event.key === 'Escape' &&
          surface.classList.contains('is-expanded')
        ) {
          close();
        }
      };

      const cleanup = () => {
        closed = true;
        window.cancelAnimationFrame(timerRaf);
        surface.removeEventListener('click', requestStop);
        chrome.runtime.onMessage.removeListener(runtimeListener);
        window.removeEventListener('message', onWindowMessage);
        document.removeEventListener('pointerdown', onPointerDown, true);
        document.removeEventListener('keydown', onKeyDown, true);
        host.remove();

        if (isolatedWindow.__tabSamplerSurfaceCleanup === cleanup) {
          delete isolatedWindow.__tabSamplerSurfaceCleanup;
        }
      };

      stopControl.addEventListener('click', (event) => {
        event.stopPropagation();
        requestStop();
      });
      surface.addEventListener('click', requestStop);
      chrome.runtime.onMessage.addListener(runtimeListener);
      window.addEventListener('message', onWindowMessage);
      document.addEventListener('pointerdown', onPointerDown, true);
      document.addEventListener('keydown', onKeyDown, true);
      isolatedWindow.__tabSamplerSurfaceCleanup = cleanup;

      drawWave();
      renderTimer();

      if (mode === 'editor') {
        surface.classList.add('is-live', 'is-frozen', 'is-expanded');
        frozenAt = performance.now();
        frame.src = src;
      } else {
        window.requestAnimationFrame(() => {
          surface.classList.add('is-live');
        });
      }
    },
  });
}

async function openRecordingIsland(tabId: number): Promise<void> {
  try {
    await mountSamplerSurface(tabId, 'recording');
  } catch (error) {
    console.warn('[tab-sampler] recording island unavailable', error);
  }
}

async function expandRecordingIsland(tabId: number): Promise<void> {
  try {
    await sendIslandMessage(tabId, {
      type: 'tab-sampler:island-expand',
    });
  } catch {
    await mountSamplerSurface(tabId, 'editor');
  }
}

async function freezeRecordingIsland(tabId: number): Promise<void> {
  try {
    await sendIslandMessage(tabId, {
      type: 'tab-sampler:island-freeze',
    });
  } catch {
    // The recording remains valid even if the page cannot host the overlay.
  }
}

async function closeRecordingIsland(tabId: number): Promise<void> {
  try {
    await sendIslandMessage(tabId, {
      type: 'tab-sampler:island-close',
    });
  } catch {
    // Already gone (navigation/closed tab/etc).
  }
}

async function offscreenExists(): Promise<boolean> {
  const url = browser.runtime.getURL(OFFSCREEN_URL);
  const contexts = await browser.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [url],
  });
  return contexts.length > 0;
}

async function ensureOffscreen(): Promise<void> {
  if (await offscreenExists()) return;

  await browser.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['USER_MEDIA'],
    justification: 'Capture audio from the active tab after an explicit toolbar click.',
  });
}

async function closeOffscreen(): Promise<void> {
  if (await offscreenExists()) {
    await browser.offscreen.closeDocument();
  }
}

async function captureStatus() {
  if (!(await offscreenExists())) return 'idle' as const;

  try {
    const response = await sendMessage('offscreen:status', null);
    return response.status;
  } catch {
    return 'idle' as const;
  }
}

async function restoreActionState(): Promise<void> {
  const status = await captureStatus();

  if (
    status === 'recording' ||
    status === 'starting' ||
    status === 'stopping'
  ) {
    await browser.action.setPopup({ popup: '' });
    await setRecordingAction(recordingTabId ?? undefined);
    return;
  }

  const sample = await getLatestSampleMeta();
  if (sample && sample.frames > 0) {
    await browser.action.setPopup({ popup: '' });
    await setEditingAction();
    return;
  }

  await browser.action.setPopup({ popup: '' });
  await setIdleAction();
}

async function startCapture(tabId: number): Promise<void> {
  await browser.action.setPopup({ popup: '' });
  await ensureOffscreen();

  try {
    const streamId = await browser.tabCapture.getMediaStreamId();
    await sendMessage('offscreen:start', { streamId });

    recordingTabId = tabId;
    lastMeterForwardAt = 0;

    await Promise.all([
      setRecordingAction(tabId),
      openRecordingIsland(tabId),
    ]);
  } catch (error) {
    await closeOffscreen();
    await closeRecordingIsland(tabId);
    recordingTabId = null;
    await setIdleAction(tabId);
    throw error;
  }
}

async function stopCaptureAndExpandEditor(tabId: number): Promise<void> {
  await freezeRecordingIsland(tabId);

  let sample: SampleMeta;
  try {
    sample = await sendMessage('offscreen:stop', null);
  } finally {
    await closeOffscreen();
  }

  if (sample.frames <= 0) {
    await browser.action.setPopup({ popup: '' });
    await closeRecordingIsland(tabId);
    recordingTabId = null;
    await setIdleAction(tabId);
    return;
  }

  await browser.action.setPopup({ popup: '' });
  recordingTabId = null;
  await setEditingAction(tabId);
  await expandRecordingIsland(tabId);
}

export default defineBackground(() => {
  void restoreActionState();

  browser.runtime.onMessage.addListener((message, sender) => {
    if (message?.type !== 'tab-sampler:stop-request') return;

    const senderTabId = sender.tab?.id;
    const tabId = recordingTabId ?? senderTabId;
    if (typeof tabId !== 'number' || busy) return;

    busy = true;

    void (async () => {
      try {
        const status = await captureStatus();
        if (status === 'recording') {
          await stopCaptureAndExpandEditor(tabId);
        }
      } catch (error) {
        console.error('[tab-sampler] island stop failed', error);
        await restoreActionState();
      } finally {
        busy = false;
      }
    })();
  });

  browser.action.onClicked.addListener(async (tab) => {
    if (busy) return;
    busy = true;

    try {
      const tabId = tab.id;
      if (typeof tabId !== 'number') return;

      const status = await captureStatus();

      if (status === 'recording') {
        await stopCaptureAndExpandEditor(tabId);
      } else if (status === 'idle') {
        const sample = await getLatestSampleMeta();

        if (sample && sample.frames > 0) {
          await setEditingAction(tabId);
          await mountSamplerSurface(tabId, 'editor');
        } else {
          await startCapture(tabId);
        }
      }
    } catch (error) {
      console.error('[tab-sampler] action failed', error);
      await restoreActionState();
    } finally {
      busy = false;
    }
  });

  onMessage('background:pulse', async (message) => {
    await setRecordingPulse(
      message.data.bright,
      recordingTabId ?? undefined,
    );
  });

  onMessage('background:meter', async (message) => {
    const tabId = recordingTabId;
    if (tabId === null) return;

    const now = performance.now();
    if (now - lastMeterForwardAt < 28) return;
    lastMeterForwardAt = now;

    try {
      await sendIslandMessage(tabId, {
        type: 'tab-sampler:island-meter',
        peak: message.data.peak,
        rms: message.data.rms,
      });
    } catch {
      // Page may be navigating; recording must continue independently.
    }
  });

  onMessage('background:reset', async () => {
    await browser.action.setPopup({ popup: '' });

    const tabId = recordingTabId ?? undefined;
    if (recordingTabId !== null) {
      await closeRecordingIsland(recordingTabId);
    }

    recordingTabId = null;
    await setIdleAction(tabId);
  });

  onMessage('background:capture-ended', async () => {
    await closeOffscreen();
    const sample = await getLatestSampleMeta();
    const tabId = recordingTabId;

    if (!sample || sample.frames <= 0) {
      if (tabId !== null) await closeRecordingIsland(tabId);
      recordingTabId = null;
      await browser.action.setPopup({ popup: '' });
      await setIdleAction(tabId ?? undefined);
      return;
    }

    await browser.action.setPopup({ popup: '' });

    if (tabId !== null) {
      await freezeRecordingIsland(tabId);
      recordingTabId = null;
      await setEditingAction(tabId);
      await expandRecordingIsland(tabId);
    } else {
      await setEditingAction();
    }
  });
});
