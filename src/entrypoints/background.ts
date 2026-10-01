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


async function openEditorOverlay(tabId: number): Promise<void> {
  const editorUrl = browser.runtime.getURL(EDITOR_URL);

  await browser.scripting.executeScript({
    target: { tabId },
    args: [editorUrl, OVERLAY_HOST_ID],
    func: (src, hostId) => {
      type OverlayWindow = Window & {
        __tabSamplerOverlayCleanup?: () => void;
      };

      const pageWindow = window as OverlayWindow;
      pageWindow.__tabSamplerOverlayCleanup?.();

      const previous = document.getElementById(hostId);
      previous?.remove();

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
        :host { all: initial; }

        .stage {
          position: fixed;
          inset: 0;
          pointer-events: none;
        }

        .glass {
          position: absolute;
          top: 16px;
          right: 16px;
          width: 64px;
          height: 30px;
          overflow: hidden;
          pointer-events: auto;
          border-radius: 18px;
          corner-shape: squircle;
          isolation: isolate;

          background:
            radial-gradient(110% 120% at 24% -20%,
              rgba(255,255,255,.09) 0%,
              rgba(255,255,255,.018) 34%,
              transparent 64%),
            linear-gradient(180deg,
              rgba(25,25,28,.78) 0%,
              rgba(15,15,18,.80) 100%);

          -webkit-backdrop-filter:
            blur(42px)
            saturate(165%)
            brightness(88%)
            contrast(104%);
          backdrop-filter:
            blur(42px)
            saturate(165%)
            brightness(88%)
            contrast(104%);

          box-shadow:
            0 10px 28px rgba(0,0,0,.28),
            0 1px 0 rgba(255,255,255,.16) inset,
            0 0 0 1px rgba(255,255,255,.035) inset;

          transform-origin: 100% 0%;
          transform: translate3d(0,0,0);
          will-change: width, height, border-radius, box-shadow;
          transition:
            width 420ms cubic-bezier(.16,1,.3,1),
            height 420ms cubic-bezier(.16,1,.3,1),
            border-radius 420ms cubic-bezier(.16,1,.3,1),
            box-shadow 360ms cubic-bezier(.16,1,.3,1);
        }

        .glass.is-open {
          width: 352px;
          height: 336px;
          border-radius: 48px;
          box-shadow:
            0 26px 64px rgba(0,0,0,.36),
            0 8px 22px rgba(0,0,0,.20),
            0 1px 0 rgba(255,255,255,.18) inset,
            0 0 0 1px rgba(255,255,255,.035) inset,
            0 -1px 0 rgba(0,0,0,.28) inset;
        }

        .island-seed {
          position: absolute;
          z-index: 4;
          top: 50%;
          left: 50%;
          width: 7px;
          height: 7px;
          margin: -3.5px 0 0 -3.5px;
          border-radius: 999px;
          background: #ff3b30;
          box-shadow: 0 0 10px rgba(255,59,48,.44);
          opacity: 1;
          transform: scale(1);
          transition:
            opacity 130ms ease 90ms,
            transform 180ms cubic-bezier(.2,.8,.2,1) 80ms;
        }

        .glass.is-open .island-seed {
          opacity: 0;
          transform: scale(.72);
        }

        .glass::before {
          content: '';
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          border-radius: inherit;
          corner-shape: inherit;
          background:
            linear-gradient(132deg,
              rgba(255,255,255,.11) 0%,
              rgba(255,255,255,.024) 18%,
              transparent 42%),
            radial-gradient(80% 52% at 72% 106%,
              rgba(255,255,255,.035),
              transparent 70%);
          mix-blend-mode: screen;
        }

        .glass::after {
          content: '';
          position: absolute;
          inset: 1px;
          z-index: 2;
          pointer-events: none;
          border-radius: 47px;
          corner-shape: squircle;
          box-shadow:
            0 0 0 1px rgba(255,255,255,.045) inset,
            0 0 22px rgba(255,255,255,.018) inset;
        }

        iframe {
          position: absolute;
          z-index: 1;
          top: 0;
          right: 0;
          display: block;
          width: 352px;
          height: 336px;
          border: 0;
          background: transparent;
          color-scheme: dark;
          opacity: 0;
          transform: translate3d(0,0,0);
          pointer-events: none;
          transition: opacity 150ms ease 120ms;
        }

        .glass.is-open iframe {
          opacity: 1;
          pointer-events: auto;
        }

        .glass.is-closing {
          width: 64px;
          height: 30px;
          border-radius: 18px;
          box-shadow:
            0 10px 28px rgba(0,0,0,.22),
            0 1px 0 rgba(255,255,255,.12) inset,
            0 0 0 1px rgba(255,255,255,.025) inset;
          transition-duration: 260ms;
        }

        .glass.is-closing iframe {
          opacity: 0;
          pointer-events: none;
          transition-delay: 0ms;
          transition-duration: 80ms;
        }

        @media (prefers-reduced-motion: reduce) {
          .glass,
          .island-seed,
          iframe {
            transition-duration: 1ms !important;
            transition-delay: 0ms !important;
          }
        }
        }
      `;

      const stage = document.createElement('div');
      stage.className = 'stage';

      const glass = document.createElement('div');
      glass.className = 'glass';

      const seed = document.createElement('span');
      seed.className = 'island-seed';

      const frame = document.createElement('iframe');
      frame.src = src;
      frame.title = 'Tab Sampler editor';
      frame.allow = 'autoplay';
      frame.setAttribute('aria-label', 'Tab Sampler audio editor');

      glass.append(seed, frame);
      stage.append(glass);
      shadow.append(style, stage);
      document.documentElement.append(host);

      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        glass.classList.remove('is-open');
        glass.classList.add('is-closing');
        window.setTimeout(() => {
          host.remove();
          document.removeEventListener('pointerdown', onPointerDown, true);
          document.removeEventListener('keydown', onKeyDown, true);
          window.removeEventListener('message', onMessage);
          if (pageWindow.__tabSamplerOverlayCleanup === cleanup) {
            delete pageWindow.__tabSamplerOverlayCleanup;
          }
        }, 280);
      };

      const cleanup = () => {
        closed = true;
        host.remove();
        document.removeEventListener('pointerdown', onPointerDown, true);
        document.removeEventListener('keydown', onKeyDown, true);
        window.removeEventListener('message', onMessage);
      };

      const onPointerDown = (event: PointerEvent) => {
        if (!event.composedPath().includes(host)) close();
      };

      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') close();
      };

      const onMessage = (event: MessageEvent) => {
        if (event.source !== frame.contentWindow) return;

        if (event.data?.type === 'tab-sampler:ready') {
          window.requestAnimationFrame(() => {
            glass.classList.remove('is-closing');
            glass.classList.add('is-open');
          });
          return;
        }

        if (event.data?.type === 'tab-sampler:close') close();
      };

      document.addEventListener('pointerdown', onPointerDown, true);
      document.addEventListener('keydown', onKeyDown, true);
      window.addEventListener('message', onMessage);
      pageWindow.__tabSamplerOverlayCleanup = cleanup;
    },
  });
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
  if (status === 'recording' || status === 'starting' || status === 'stopping') {
    await browser.action.setPopup({ popup: '' });
    await setRecordingAction();
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

async function startCapture(): Promise<void> {
  await browser.action.setPopup({ popup: '' });
  await ensureOffscreen();

  try {
    // Omit targetTabId intentionally: the action click authorizes capture of the
    // current active tab without requiring the broader `activeTab` permission.
    const streamId = await browser.tabCapture.getMediaStreamId();
    await sendMessage('offscreen:start', { streamId });
    await setRecordingAction();
  } catch (error) {
    await closeOffscreen();
    await setIdleAction();
    throw error;
  }
}

async function stopCaptureAndOpenEditor(tabId: number): Promise<void> {
  let sample: SampleMeta;
  try {
    sample = await sendMessage('offscreen:stop', null);
  } finally {
    await closeOffscreen();
  }

  if (sample.frames <= 0) {
    await browser.action.setPopup({ popup: '' });
    await setIdleAction();
    return;
  }

  await browser.action.setPopup({ popup: '' });
  await setEditingAction();
  await openEditorOverlay(tabId);
}

export default defineBackground(() => {
  void restoreActionState();

  browser.action.onClicked.addListener(async (tab) => {
    if (busy) return;
    busy = true;

    try {
      const tabId = tab.id;
      if (typeof tabId !== 'number') return;

      const status = await captureStatus();
      if (status === 'recording') {
        await stopCaptureAndOpenEditor(tabId);
      } else if (status === 'idle') {
        const sample = await getLatestSampleMeta();
        if (sample && sample.frames > 0) {
          await setEditingAction();
          await openEditorOverlay(tabId);
        } else {
          await startCapture();
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
    await setRecordingPulse(message.data.bright);
  });

  onMessage('background:reset', async () => {
    await browser.action.setPopup({ popup: '' });
    await setIdleAction();
  });

  onMessage('background:capture-ended', async () => {
    await closeOffscreen();
    const sample = await getLatestSampleMeta();

    if (!sample || sample.frames <= 0) {
      await browser.action.setPopup({ popup: '' });
      await setIdleAction();
      return;
    }

    await browser.action.setPopup({ popup: '' });
    await setEditingAction();
  });
});
