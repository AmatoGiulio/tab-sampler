import { browser } from 'wxt/browser';

const iconPaths = {
  idle: {
    16: 'icons/idle-16.png',
    32: 'icons/idle-32.png',
  },
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
    browser.action.setIcon({ ...details, path: iconPaths.idle }),
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
    browser.action.setIcon({ ...details, path: iconPaths.idle }),
    browser.action.setTitle({
      ...details,
      title: 'Open captured sample',
    }),
    clearBadge(tabId),
  ]);
}
