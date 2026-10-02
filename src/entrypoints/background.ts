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

const OFFSCREEN_URL = '/offscreen.html';
const EDITOR_URL = '/editor.html';
const OVERLAY_HOST_ID = '__tab_sampler_overlay__';

let busy = false;
let recordingTabId: number | null = null;
let lastMeterForwardAt = 0;

type IslandMessage =
  | { type: 'tab-sampler:island-meter'; peak: number; rms: number }
  | { type: 'tab-sampler:island-freeze' }
  | { type: 'tab-sampler:island-expand' }
  | { type: 'tab-sampler:island-restart' }
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

/**
 * The service worker can be restarted at any time, and its variables with
 * it. A capture that is still running then has no tab on record here: ask
 * Chrome which tab it is.
 */
async function recoverRecordingTab(): Promise<void> {
  if (recordingTabId !== null) return;

  try {
    const captures = await browser.tabCapture.getCapturedTabs();
    const live = captures.find((capture) => capture.status === 'active');
    if (live) recordingTabId = live.tabId;
  } catch {
    // Without it the capture still stops from its island or the toolbar.
  }
}

/**
 * Puts the toolbar icon back in line with what is actually happening.
 *
 * The default icon (the one every tab without its own state shows) only ever
 * says "idle" or "a sample is waiting". "Recording" belongs to the recording
 * tab alone; `tabId` additionally clears that tab's own override.
 */
async function restoreActionState(tabId?: number): Promise<void> {
  await browser.action.setPopup({ popup: '' });

  const status = await captureStatus();
  const capturing =
    status === 'recording' || status === 'starting' || status === 'stopping';
  if (capturing) await recoverRecordingTab();
  const sample = capturing ? undefined : await getLatestSampleMeta();
  const editing = Boolean(sample && sample.frames > 0);

  await (editing ? setEditingAction() : setIdleAction());

  if (capturing && recordingTabId !== null) {
    await setRecordingAction(recordingTabId);
  }

  if (tabId !== undefined && !(capturing && tabId === recordingTabId)) {
    await (editing ? setEditingAction(tabId) : setIdleAction(tabId));
  }
}

/**
 * Starts capturing the tab.
 *
 * `reuseIsland` is the "new capture" path: the surface is already on the
 * page, collapsing from the editor back into the island, so it is told to go
 * live instead of being mounted again. That path is not a toolbar click, so
 * the tab has to be named explicitly; Chrome allows it for as long as the
 * tab's earlier invocation still stands.
 */
async function startCapture(tabId: number, reuseIsland = false): Promise<void> {
  await browser.action.setPopup({ popup: '' });
  await ensureOffscreen();

  try {
    const streamId = await browser.tabCapture.getMediaStreamId(
      reuseIsland ? { targetTabId: tabId } : {},
    );

    // Known before the recorder starts: its first pulse arrives while
    // `offscreen:start` is still pending and has to find its tab.
    recordingTabId = tabId;
    lastMeterForwardAt = 0;

    await sendMessage('offscreen:start', { streamId });

    await Promise.all([
      setRecordingAction(tabId),
      reuseIsland
        ? sendIslandMessage(tabId, { type: 'tab-sampler:island-restart' })
            .catch(() => openRecordingIsland(tabId))
        : openRecordingIsland(tabId),
    ]);
  } catch (error) {
    await closeOffscreen();
    await closeRecordingIsland(tabId);
    recordingTabId = null;
    await setIdleAction(tabId);
    throw error;
  }
}

/**
 * Stops the capture and opens the editor in `tabId`.
 *
 * `tabId` is where the user is: the recording tab when the island asked, or
 * whichever tab the toolbar was clicked in. When that is not the tab being
 * recorded, the island over there is closed and the editor opens here.
 */
async function stopCaptureAndExpandEditor(
  tabId: number,
  fromIsland = false,
): Promise<void> {
  const startedAt = performance.now();

  await recoverRecordingTab();
  const islandTabId = recordingTabId ?? tabId;

  // An island that asked to stop has already frozen itself. From the
  // toolbar it still needs telling, but nothing has to wait for it.
  if (!fromIsland) void freezeRecordingIsland(islandTabId);

  let sample: SampleMeta;
  try {
    sample = await sendMessage('offscreen:stop', null);
  } catch (error) {
    recordingTabId = null;
    await closeOffscreen();
    await closeRecordingIsland(islandTabId);
    throw error;
  }

  recordingTabId = null;

  if (sample.frames <= 0) {
    await closeOffscreen();
    await closeRecordingIsland(islandTabId);
    await restoreActionState(islandTabId);
    return;
  }

  // The sample exists: open the editor now. Everything else is bookkeeping
  // and runs alongside instead of in front of it.
  console.debug(
    `[tab-sampler] stop to sample ready: ${Math.round(performance.now() - startedAt)}ms`,
  );

  const elsewhere = islandTabId !== tabId;

  await Promise.all([
    elsewhere
      ? closeRecordingIsland(islandTabId).then(() => mountSamplerSurface(tabId, 'editor'))
      : expandRecordingIsland(tabId),
    closeOffscreen(),
    browser.action.setPopup({ popup: '' }),
    // Every tab can open the sample; the recording tab stops saying "recording".
    setEditingAction(),
    setEditingAction(tabId),
    elsewhere ? setEditingAction(islandTabId) : Promise.resolve(),
  ]);
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
          await stopCaptureAndExpandEditor(tabId, true);
        }
      } catch (error) {
        console.error('[tab-sampler] island stop failed', error);
        await restoreActionState(tabId);
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
      await restoreActionState(tab.id);
    } finally {
      busy = false;
    }
  });

  onMessage('background:pulse', async (message) => {
    // Recording is a property of one tab. Without a tab id the icon call
    // would repaint the default icon that every other tab shows, and nothing
    // would ever paint it back.
    const tabId = recordingTabId;
    if (tabId === null) return;

    await setRecordingPulse(message.data.bright, tabId);

    // A pulse that was already on its way when the capture stopped must not
    // have the last word on that tab's icon.
    if (recordingTabId !== tabId) await restoreActionState(tabId);
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

  onMessage('background:reset', async (message) => {
    if (recordingTabId !== null) {
      await closeRecordingIsland(recordingTabId);
    }

    recordingTabId = null;
    // The editor that asked lives in a tab whose icon still says "sample
    // waiting": clear that too, not only the default.
    await restoreActionState(message.sender.tab?.id);
  });

  // "New capture" from the editor: record again without leaving the page.
  onMessage('background:new-capture', async (message) => {
    const tabId = message.sender.tab?.id;
    if (typeof tabId !== 'number' || busy) return { started: false };

    busy = true;

    try {
      await startCapture(tabId, true);
      return { started: true };
    } catch (error) {
      // startCapture has already closed the island and returned the toolbar
      // to idle: the next capture starts from a toolbar click, as before.
      console.warn('[tab-sampler] could not restart capture in place', error);
      return { started: false };
    } finally {
      busy = false;
    }
  });

  // The stream ended on its own: the tab was closed, navigated away, or
  // stopped sharing. The tab may no longer exist, so nothing here may depend
  // on reaching it.
  onMessage('background:capture-ended', async () => {
    await recoverRecordingTab();
    const tabId = recordingTabId;
    recordingTabId = null;

    await closeOffscreen();
    const sample = await getLatestSampleMeta();
    const kept = Boolean(sample && sample.frames > 0);

    if (tabId !== null) {
      if (kept) {
        await freezeRecordingIsland(tabId);
        // Falls back to mounting the editor, which needs the tab to still
        // exist and be scriptable. If it is not, the default icon below
        // already offers the sample from any other tab.
        await expandRecordingIsland(tabId).catch(() => undefined);
      } else {
        await closeRecordingIsland(tabId);
      }
    }

    await restoreActionState(tabId ?? undefined);
  });
});
