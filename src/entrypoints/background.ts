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
          width: 352px;
          height: 336px;
          overflow: hidden;
          pointer-events: auto;
          border-radius: 48px;
          corner-shape: squircle;
          isolation: isolate;

          background:
            radial-gradient(120% 88% at 18% -4%,
              rgba(255,255,255,.085) 0%,
              rgba(255,255,255,.018) 28%,
              transparent 58%),
            linear-gradient(180deg,
              rgba(24,24,27,.66) 0%,
              rgba(18,18,21,.63) 48%,
              rgba(11,11,14,.74) 100%);

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
            0 26px 64px rgba(0,0,0,.36),
            0 8px 22px rgba(0,0,0,.20),
            0 1px 0 rgba(255,255,255,.18) inset,
            0 0 0 1px rgba(255,255,255,.035) inset,
            0 -1px 0 rgba(0,0,0,.28) inset;

          transform-origin: 94% 0%;
          animation: glass-enter 270ms cubic-bezier(.18,.86,.24,1) both;
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
          position: relative;
          z-index: 1;
          display: block;
          width: 352px;
          height: 336px;
          border: 0;
          background: transparent;
          color-scheme: dark;
        }

        .glass.is-leaving {
          animation: glass-exit 135ms cubic-bezier(.4,0,.8,.2) both;
        }

        @keyframes glass-enter {
          0% {
            opacity: 0;
            transform: translateY(-5px) scale(.985);
            filter: saturate(85%) brightness(88%);
          }
          48% {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: saturate(108%) brightness(98%);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: saturate(100%) brightness(100%);
          }
        }

        @keyframes glass-exit {
          0% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          100% {
            opacity: 0;
            transform: translateY(-4px) scale(.988);
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
