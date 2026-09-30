import { browser } from 'wxt/browser';
import { PcmRecorder } from '../../audio/capture/pcm-recorder';
import { indexedDbSampleSink } from '../../audio/store/indexeddb-sample-sink';
import { onMessage, sendMessage } from '../../extension/messaging';
import { openChromeTabAudioStream } from '../../platform/chrome/tab-audio-stream';

const recorder = new PcmRecorder(indexedDbSampleSink);
let pulseTimer: number | undefined;
let pulseBright = true;

function stopPulse(): void {
  if (pulseTimer !== undefined) window.clearInterval(pulseTimer);
  pulseTimer = undefined;
}

function startPulse(): void {
  stopPulse();
  pulseBright = true;
  void sendMessage('background:pulse', { bright: true });

  pulseTimer = window.setInterval(() => {
    pulseBright = !pulseBright;
    void sendMessage('background:pulse', { bright: pulseBright });
  }, 650);
}

recorder.onUnexpectedEnd((meta) => {
  stopPulse();
  void sendMessage('background:capture-ended', {
    reason: 'stream-ended',
    sampleId: meta.id,
  });
});

onMessage('offscreen:start', async (message) => {
  const stream = await openChromeTabAudioStream(message.data.streamId);
  const meta = await recorder.start(
    stream,
    browser.runtime.getURL('/worklets/pcm-recorder.js'),
  );
  startPulse();
  return meta;
});

onMessage('offscreen:stop', async () => {
  stopPulse();
  return recorder.stop();
});

onMessage('offscreen:status', () => ({ status: recorder.getStatus() }));
