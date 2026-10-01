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
import { mountSamplerSurfaceDom } from '../ui/sampler-surface';

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
    args: [editorUrl, OVERLAY_HOST_ID, initialMode, 'extension'],
    func: mountSamplerSurfaceDom,
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
