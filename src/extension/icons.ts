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

export async function setIdleAction(): Promise<void> {
  await Promise.all([
    browser.action.setIcon({ path: iconPaths.idle }),
    browser.action.setTitle({ title: 'Click to capture tab audio' }),
  ]);
}

export async function setRecordingAction(): Promise<void> {
  await Promise.all([
    browser.action.setIcon({ path: iconPaths.recording }),
    browser.action.setTitle({ title: 'Recording - click to stop' }),
  ]);
}

export function setRecordingPulse(bright: boolean): Promise<void> {
  return browser.action.setIcon({
    path: bright ? iconPaths.recording : iconPaths.recordingDim,
  });
}

export async function setEditingAction(): Promise<void> {
  await Promise.all([
    browser.action.setIcon({ path: iconPaths.idle }),
    browser.action.setTitle({ title: 'Open captured sample' }),
  ]);
}
