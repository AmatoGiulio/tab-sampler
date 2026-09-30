export async function openChromeTabAudioStream(streamId: string): Promise<MediaStream> {
  const constraints = {
    mandatory: {
      chromeMediaSource: 'tab',
      chromeMediaSourceId: streamId,
    },
  } as unknown as MediaTrackConstraints;

  return navigator.mediaDevices.getUserMedia({
    audio: constraints,
    video: false,
  });
}
