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
let busy = false;

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
    await browser.action.setPopup({ popup: EDITOR_URL });
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

async function stopCaptureAndOpenEditor(): Promise<void> {
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

  await browser.action.setPopup({ popup: EDITOR_URL });
  await setEditingAction();
  await browser.action.openPopup();
}

export default defineBackground(() => {
  void restoreActionState();

  browser.action.onClicked.addListener(async () => {
    if (busy) return;
    busy = true;

    try {
      const status = await captureStatus();
      if (status === 'recording') {
        await stopCaptureAndOpenEditor();
      } else if (status === 'idle') {
        await startCapture();
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

    await browser.action.setPopup({ popup: EDITOR_URL });
    await setEditingAction();
  });
});
