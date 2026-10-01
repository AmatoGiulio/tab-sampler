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
          top: 18px;
          right: 18px;
          width: 400px;
          height: 400px;
          overflow: hidden;
          pointer-events: auto;
          border-radius: 58px;
          corner-shape: squircle;
          isolation: isolate;

          background:
            radial-gradient(120% 95% at 18% 0%,
              rgba(255,255,255,.105) 0%,
              rgba(255,255,255,.028) 32%,
              transparent 62%),
            linear-gradient(180deg,
              rgba(29,29,31,.72) 0%,
              rgba(20,20,22,.70) 48%,
              rgba(13,13,15,.80) 100%);

          -webkit-backdrop-filter:
            blur(34px)
            saturate(180%)
            contrast(108%);
          backdrop-filter:
            blur(34px)
            saturate(180%)
            contrast(108%);

          box-shadow:
            0 32px 70px rgba(0,0,0,.42),
            0 10px 24px rgba(0,0,0,.24),
            0 1px 0 rgba(255,255,255,.22) inset,
            1px 0 0 rgba(255,255,255,.055) inset,
            -1px 0 0 rgba(0,0,0,.26) inset,
            0 -1px 0 rgba(0,0,0,.42) inset;

          transform-origin: 92% 0%;
          animation: glass-enter 260ms cubic-bezier(.16,1,.3,1) both;
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
          border-radius: 57px;
          corner-shape: squircle;
          box-shadow:
            0 0 0 1px rgba(255,255,255,.045) inset,
            0 0 22px rgba(255,255,255,.018) inset;
        }

        iframe {
          position: relative;
          z-index: 1;
          display: block;
          width: 400px;
          height: 400px;
          border: 0;
          background: transparent;
          color-scheme: dark;
        }

        .glass.is-leaving {
          animation: glass-exit 150ms cubic-bezier(.4,0,1,1) both;
        }

        @keyframes glass-enter {
          0% {
            opacity: 0;
            transform: translateY(-8px) scale(.965);
            filter: blur(7px);
          }
          58% { filter: blur(0); }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
        }

        @keyframes glass-exit {
          to {
            opacity: 0;
            transform: translateY(-5px) scale(.98);
            filter: blur(3px);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .glass, .glass.is-leaving {
            animation-duration: 1ms;
          }
        }
      `;

      const stage = document.createElement('div');
      stage.className = 'stage';

      const glass = document.createElement('div');
      glass.className = 'glass';

      const frame = document.createElement('iframe');
      frame.src = src;
      frame.title = 'Tab Sampler editor';
      frame.allow = 'autoplay';
      frame.setAttribute('aria-label', 'Tab Sampler audio editor');

      glass.append(frame);
      stage.append(glass);
      shadow.append(style, stage);
      document.documentElement.append(host);

      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        glass.classList.add('is-leaving');
        window.setTimeout(() => {
          host.remove();
          document.removeEventListener('pointerdown', onPointerDown, true);
          document.removeEventListener('keydown', onKeyDown, true);
          window.removeEventListener('message', onMessage);
          if (pageWindow.__tabSamplerOverlayCleanup === cleanup) {
            delete pageWindow.__tabSamplerOverlayCleanup;
          }
        }, 155);
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
