import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import WaveSurfer from 'wavesurfer.js';
import { detectTempo } from '../../audio/analysis/tempo';
import { sampleFilename } from '../../audio/domain/format';
import {
  formatBeats,
  selectionBeats,
  snapSelectionToGrid,
} from '../../audio/domain/loop';
import { moveSelectionEdge, selectionDuration } from '../../audio/domain/selection';
import type { LoadedSample, Selection } from '../../audio/domain/types';
import { encodeLoopAsWav, encodeSelectionAsWav } from '../../audio/export/wav-exporter';
import { PcmPlaybackEngine } from '../../audio/playback/pcm-playback-engine';
import {
  deleteSample,
  getLatestSampleMeta,
  loadSample,
} from '../../audio/store/sample-store';
import { sendMessage } from '../../extension/messaging';
import { PlayPauseIcon } from '../../ui/PlayPauseIcon';
import { SystemIcon } from '../../ui/SystemIcon';
import './styles.css';

const EMPTY_SELECTION: Selection = { start: 0, end: 0 };
const MAX_ZOOM_FACTOR = 24;
const ZOOM_STEP = 1.55;
const ZOOM_ANIMATION_MS = 240;
const PINCH_SENSITIVITY = 0.01;
const DOUBLE_CLICK_ZOOM = 3;
const EDGE_SCROLL_ZONE = 28;
const EDGE_SCROLL_SPEED = 9;
const NUDGE_SECONDS = 0.01;
const TEMPO_ANALYSIS_DELAY_MS = 700;
const MIN_TEMPO = 40;
const MAX_TEMPO = 300;
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const MIN_SELECTION_SECONDS = 0.025;
const DEMO_MODE = new URLSearchParams(window.location.search).get('demo') === '1';
const EMBEDDED = window.parent !== window;
// Loaded ahead of time inside the island: mount everything, then wait to be
// told that the sample exists before reading it.
const STANDBY =
  EMBEDDED && new URLSearchParams(window.location.search).get('standby') === '1';

function createDemoSample(): LoadedSample {
  const sampleRate = 48_000;
  const duration = 3.24;
  const frames = Math.floor(sampleRate * duration);
  const channel = new Float32Array(frames);

  for (let index = 0; index < frames; index += 1) {
    const t = index / sampleRate;
    const pulse =
      0.42 +
      0.34 * Math.sin(t * 2.8) ** 2 +
      0.22 * Math.sin(t * 7.7 + 0.6) ** 2;
    const envelope = Math.min(1, index / 1400) * Math.min(1, (frames - index) / 1800);
    channel[index] =
      envelope *
      pulse *
      (
        Math.sin(Math.PI * 2 * 91 * t) * 0.45 +
        Math.sin(Math.PI * 2 * 173 * t + 0.4) * 0.25 +
        Math.sin(Math.PI * 2 * 257 * t + 1.1) * 0.12
      );
  }

  return {
    meta: {
      id: 'tab-sampler-showcase',
      createdAt: Date.now(),
      sampleRate,
      channels: 1,
      frames,
      duration,
      chunkCount: 1,
    },
    channelData: [channel],
  };
}

type TrimEdge = 'start' | 'end';

// The waveform is redrawn on every frame of a zoom. Handing the renderer raw
// PCM makes each of those frames walk every sample of the recording; an
// envelope this long is more than the widest zoom can show and costs the
// same for ten seconds as for ten minutes.
const WAVEFORM_POINTS = 16_384;

function waveformPeaks(channelData: Float32Array[]): Float32Array[] {
  return channelData.map((channel) => {
    if (channel.length <= WAVEFORM_POINTS * 2) return channel;

    const peaks = new Float32Array(WAVEFORM_POINTS);
    const bucket = channel.length / WAVEFORM_POINTS;

    for (let index = 0; index < WAVEFORM_POINTS; index += 1) {
      const end = Math.min(channel.length, Math.floor((index + 1) * bucket));
      let extreme = 0;

      for (let frame = Math.floor(index * bucket); frame < end; frame += 1) {
        const value = channel[frame] ?? 0;
        if (Math.abs(value) > Math.abs(extreme)) extreme = value;
      }

      peaks[index] = extreme;
    }

    return peaks;
  });
}

// A pointer press should not leave a control focused: the focus ring is for
// keyboard navigation, and a focused button would also swallow the next
// space bar meant for play.
const keepFocus = (event: React.MouseEvent) => event.preventDefault();

interface VisibleRange {
  start: number;
  end: number;
}

/** Keeps `time` pinned at `fraction` of the viewport while the scale changes. */
interface ZoomAnchor {
  time: number;
  fraction: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatReferenceTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const wholeMinutes = Math.floor(safe / 60);
  const wholeSeconds = Math.floor(safe % 60);
  const centiseconds = Math.floor((safe - Math.floor(safe)) * 100);

  // m:ss.cc — minutes and seconds read as time, the fraction as a fraction.
  return `${wholeMinutes}:${String(wholeSeconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

function App() {
  const waveformRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const waveSurferRef = useRef<WaveSurfer | null>(null);
  const playbackRef = useRef<PcmPlaybackEngine | null>(null);
  const selectionRef = useRef<Selection>(EMPTY_SELECTION);
  const loopRef = useRef(false);
  const zoomRef = useRef(1);
  const visibleRangeRef = useRef<VisibleRange>({ start: 0, end: 0 });
  const currentTimeRef = useRef(0);
  const playbackFrameRef = useRef<number | null>(null);
  const trimDragRef = useRef<{
    edge: TrimEdge;
    pointerId: number;
    clientX: number;
    free: boolean;
  } | null>(null);
  const tempoRef = useRef<number | null>(null);
  // The selection as it was before loop mode pulled it onto the grid, kept
  // so that leaving loop mode untouched hands it back.
  const loopSnapRef = useRef<{ before: Selection; snapped: Selection } | null>(null);
  const edgeScrollFrameRef = useRef<number | null>(null);
  const animateZoomRef = useRef<(nextZoom: number, anchor?: ZoomAnchor) => void>(
    () => undefined,
  );
  const togglePlayRef = useRef<() => Promise<void>>(async () => undefined);

  const [sample, setSample] = useState<LoadedSample | null>(null);
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [visibleRange, setVisibleRange] = useState<VisibleRange>({ start: 0, end: 0 });
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [dragEdge, setDragEdge] = useState<TrimEdge | null>(null);
  const [tempo, setTempo] = useState<number | null>(null);
  const [tempoDraft, setTempoDraft] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [revealed, setRevealed] = useState(!EMBEDDED);
  const [exporting, setExporting] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const renderPlayhead = (time: number) => {
    currentTimeRef.current = time;
    const element = playheadRef.current;
    const waveform = waveformRef.current;
    const range = visibleRangeRef.current;
    if (!element || !waveform) return;

    const span = range.end - range.start;
    if (span <= 0 || time < range.start || time > range.end) {
      element.style.opacity = '0';
      return;
    }

    // Parked on a trim edge it would only sit on top of the handle. It
    // shows again as soon as there is a position worth marking.
    const active = selectionRef.current;
    const parked =
      !playbackRef.current?.isPlaying() &&
      (Math.abs(time - active.start) < 0.002 || Math.abs(time - active.end) < 0.002);
    if (parked) {
      element.style.opacity = '0';
      return;
    }

    const progress = clamp((time - range.start) / span, 0, 1);
    const x = Math.min(
      Math.max(0, waveform.clientWidth - 1),
      Math.max(0, progress * waveform.clientWidth),
    );
    element.style.opacity = '1';
    element.style.transform = `translate3d(${x}px, 0, 0)`;
  };

  const stopPlaybackFrame = () => {
    if (playbackFrameRef.current !== null) {
      window.cancelAnimationFrame(playbackFrameRef.current);
      playbackFrameRef.current = null;
    }
  };

  const startPlaybackFrame = () => {
    stopPlaybackFrame();

    const tick = () => {
      const playback = playbackRef.current;
      const wavesurfer = waveSurferRef.current;
      if (!playback?.isPlaying()) {
        playbackFrameRef.current = null;
        return;
      }

      const time = playback.getCurrentTime();
      renderPlayhead(time);

      const range = visibleRangeRef.current;
      const span = range.end - range.start;
      if (wavesurfer && zoomRef.current > 1 && span > 0) {
        if (time < range.start || time > range.end) {
          const duration = sample?.meta.duration ?? 0;
          const nextStart = clamp(
            time - span * 0.08,
            0,
            Math.max(0, duration - span),
          );
          wavesurfer.setScrollTime(nextStart);
        }
      }

      playbackFrameRef.current = window.requestAnimationFrame(tick);
    };

    playbackFrameRef.current = window.requestAnimationFrame(tick);
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        if (DEMO_MODE) {
          if (!cancelled) setSample(createDemoSample());
          return;
        }

        const meta = await getLatestSampleMeta();
        if (!meta) throw new Error('No captured sample found');
        const loaded = await loadSample(meta.id);
        if (!cancelled) setSample(loaded);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Unable to load sample');
        }
      }
    };

    if (!STANDBY) {
      void load();
      return () => {
        cancelled = true;
      };
    }

    let requested = false;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || requested) return;
      if (event.data?.type !== 'tab-sampler:load') return;
      requested = true;
      void load();
    };

    window.addEventListener('message', onMessage);
    window.parent.postMessage({ type: 'tab-sampler:standby' }, '*');

    return () => {
      cancelled = true;
      window.removeEventListener('message', onMessage);
    };
  }, []);

  useEffect(() => {
    if (!sample || !waveformRef.current) return;

    let disposed = false;
    const cleanup: Array<() => void> = [];
    const duration = sample.meta.duration;
    const initialSelection = { start: 0, end: duration };
    const playback = new PcmPlaybackEngine(sample);
    const wavesurfer = WaveSurfer.create({
      container: waveformRef.current,
      peaks: waveformPeaks(sample.channelData),
      duration,
      height: 96,
      waveColor: 'rgba(255,255,255,0.72)',
      progressColor: 'rgba(255,255,255,0.72)',
      cursorWidth: 0,
      barWidth: 2,
      barGap: 4,
      barRadius: 2,
      dragToSeek: { debounceTime: 0 },
      hideScrollbar: true,
      autoScroll: false,
      autoCenter: false,
      normalize: false,
      interact: true,
      fillParent: true,
    });

    playbackRef.current = playback;
    waveSurferRef.current = wavesurfer;
    selectionRef.current = initialSelection;
    currentTimeRef.current = 0;
    setSelection(initialSelection);
    visibleRangeRef.current = { start: 0, end: duration };
    setVisibleRange({ start: 0, end: duration });

    playback.setSelection(initialSelection);
    playback.onEnded(() => {
      if (disposed) return;
      setPlaying(false);
      stopPlaybackFrame();
      // Finished: back to the start, ready to play again.
      renderPlayhead(selectionRef.current.start);
    });

    const updateVisibleRange = (start: number, end: number) => {
      const next = { start, end };
      visibleRangeRef.current = next;
      setVisibleRange(next);
      renderPlayhead(currentTimeRef.current);
    };

    const applyZoom = (requestedZoom: number, anchor?: ZoomAnchor) => {
      const waveform = waveformRef.current;
      if (!waveform || duration <= 0 || !wavesurfer.getDecodedData()) return;

      const nextZoom = clamp(requestedZoom, 1, MAX_ZOOM_FACTOR);
      const fitPxPerSec = waveform.clientWidth / duration;
      const minPxPerSec = fitPxPerSec * nextZoom;
      const previous = visibleRangeRef.current;
      const pinned = anchor ?? {
        time: previous.end > previous.start
          ? (previous.start + previous.end) / 2
          : currentTimeRef.current,
        fraction: 0.5,
      };
      const visibleDuration = Math.min(duration, waveform.clientWidth / minPxPerSec);
      const start = clamp(
        pinned.time - pinned.fraction * visibleDuration,
        0,
        Math.max(0, duration - visibleDuration),
      );

      zoomRef.current = nextZoom;
      setZoom(nextZoom);
      wavesurfer.zoom(minPxPerSec);
      wavesurfer.setScrollTime(start);
      updateVisibleRange(start, Math.min(duration, start + visibleDuration));
    };

    const anchorAt = (clientX: number): ZoomAnchor | undefined => {
      const waveform = waveformRef.current;
      if (!waveform) return undefined;

      const rect = waveform.getBoundingClientRect();
      if (rect.width <= 0) return undefined;

      const range = visibleRangeRef.current;
      const fraction = clamp((clientX - rect.left) / rect.width, 0, 1);
      return { time: range.start + fraction * (range.end - range.start), fraction };
    };

    // Zooming with no pointer involved keeps the playhead in place when it
    // is on screen, otherwise the centre of the view.
    const restingAnchor = (): ZoomAnchor | undefined => {
      const range = visibleRangeRef.current;
      const span = range.end - range.start;
      const time = currentTimeRef.current;
      if (span <= 0 || time < range.start || time > range.end) return undefined;
      return { time, fraction: (time - range.start) / span };
    };

    let pinchFrame = 0;
    let pinchZoom = 1;
    let pinchAnchor: ZoomAnchor | undefined;
    const cancelPinch = () => {
      if (pinchFrame) window.cancelAnimationFrame(pinchFrame);
      pinchFrame = 0;
    };

    let zoomAnimationFrame = 0;
    const cancelZoomAnimation = () => {
      if (zoomAnimationFrame) window.cancelAnimationFrame(zoomAnimationFrame);
      zoomAnimationFrame = 0;
    };

    // Discrete zoom requests (keys, double click) glide to their target.
    // Interpolating the scale geometrically keeps the perceived speed even.
    const animateZoom = (requestedZoom: number, anchor = restingAnchor()) => {
      cancelZoomAnimation();
      cancelPinch();

      const from = zoomRef.current;
      const to = clamp(requestedZoom, 1, MAX_ZOOM_FACTOR);
      if (REDUCED_MOTION || Math.abs(to - from) < 0.001) {
        applyZoom(to, anchor);
        return;
      }

      const startedAt = performance.now();
      const step = (now: number) => {
        const progress = clamp((now - startedAt) / ZOOM_ANIMATION_MS, 0, 1);
        const eased = 1 - (1 - progress) ** 3;
        applyZoom(from * (to / from) ** eased, anchor);
        zoomAnimationFrame = progress < 1 ? window.requestAnimationFrame(step) : 0;
      };

      zoomAnimationFrame = window.requestAnimationFrame(step);
    };

    animateZoomRef.current = animateZoom;
    cleanup.push(cancelZoomAnimation);

    cleanup.push(
      wavesurfer.on('scroll', (start, end) => updateVisibleRange(start, end)),
      wavesurfer.on('interaction', (time) => {
        if (trimDragRef.current) return;
        const active = selectionRef.current;
        const next = clamp(time, active.start, active.end);
        void playback.seek(next).then((resolved) => {
          if (!disposed) renderPlayhead(resolved);
        });
      }),
      wavesurfer.on('error', (cause) => {
        if (!disposed) setError(cause.message || 'Unable to render waveform');
      }),
      wavesurfer.on('decode', () => {
        if (disposed) return;
        applyZoom(1);
        renderPlayhead(0);
        setReady(true);
      }),
    );

    // Pinch (ctrl/cmd + wheel) is continuous and follows the fingers: the
    // time under the pointer stays under the pointer. Events are folded into
    // one waveform render per frame.
    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        cancelZoomAnimation();

        const pixels = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL
          ? event.deltaY
          : event.deltaY * 16;
        const factor = Math.exp(-clamp(pixels, -30, 30) * PINCH_SENSITIVITY);

        if (!pinchFrame) {
          pinchZoom = zoomRef.current;
          pinchAnchor = anchorAt(event.clientX);
          pinchFrame = window.requestAnimationFrame(() => {
            pinchFrame = 0;
            applyZoom(pinchZoom, pinchAnchor);
          });
        }

        pinchZoom = clamp(pinchZoom * factor, 1, MAX_ZOOM_FACTOR);
        return;
      }

      if (zoomRef.current > 1) {
        event.preventDefault();
        const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;
        wavesurfer.setScroll(wavesurfer.getScroll() + delta);
      }
    };

    // Double click: into the selection (or the pointer), and back out.
    const handleDoubleClick = (event: MouseEvent) => {
      if (zoomRef.current > 1.05) {
        animateZoom(1, anchorAt(event.clientX));
        return;
      }

      const active = selectionRef.current;
      const span = active.end - active.start;
      if (span > 0 && span < duration * 0.8) {
        animateZoom(duration / (span * 1.3), {
          time: (active.start + active.end) / 2,
          fraction: 0.5,
        });
        return;
      }

      animateZoom(DOUBLE_CLICK_ZOOM, anchorAt(event.clientX));
    };

    const waveformElement = waveformRef.current;
    waveformElement.addEventListener('wheel', handleWheel, { passive: false });
    waveformElement.addEventListener('dblclick', handleDoubleClick);
    cleanup.push(() => {
      cancelPinch();
      waveformElement.removeEventListener('wheel', handleWheel);
      waveformElement.removeEventListener('dblclick', handleDoubleClick);
    });

    return () => {
      disposed = true;
      stopPlaybackFrame();
      cleanup.forEach((unsubscribe) => unsubscribe());
      animateZoomRef.current = () => undefined;
      if (edgeScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(edgeScrollFrameRef.current);
        edgeScrollFrameRef.current = null;
      }
      trimDragRef.current = null;
      waveSurferRef.current = null;
      playbackRef.current = null;
      wavesurfer.destroy();
      void playback.dispose();
    };
  }, [sample]);

  const togglePlay = async () => {
    const playback = playbackRef.current;
    if (!playback || !ready) return;

    try {
      if (playback.isPlaying()) {
        const time = playback.pause();
        stopPlaybackFrame();
        renderPlayhead(time);
        setPlaying(false);
        return;
      }

      const active = selectionRef.current;
      const current = playback.getCurrentTime();
      const from = current < active.start || current >= active.end
        ? active.start
        : current;

      await playback.play(from);
      setPlaying(true);
      renderPlayhead(from);
      startPlaybackFrame();
    } catch (cause) {
      setPlaying(false);
      setError(cause instanceof Error ? cause.message : 'Playback failed');
    }
  };

  togglePlayRef.current = togglePlay;

  useEffect(() => {
    if (!ready) return;

    // Announce readiness only after the finished editor has actually been
    // painted and rasterized. The island starts its morph on this message,
    // so none of the first-render cost can land inside the animation.
    let announced = false;
    const announce = () => {
      if (announced) return;
      announced = true;
      window.parent.postMessage({ type: 'tab-sampler:ready' }, '*');
    };

    let second = 0;
    const first = window.requestAnimationFrame(() => {
      second = window.requestAnimationFrame(announce);
    });
    // Frames can be throttled while the editor is still hidden inside the
    // island; never let that strand the expansion.
    const fallback = window.setTimeout(announce, 160);

    return () => {
      window.cancelAnimationFrame(first);
      window.cancelAnimationFrame(second);
      window.clearTimeout(fallback);
    };
  }, [ready]);

  useEffect(() => {
    if (!EMBEDDED) return;

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      if (event.data?.type === 'tab-sampler:reveal') setRevealed(true);
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;

      if (event.key === ' ' && ready) {
        event.preventDefault();
        void togglePlayRef.current();
      } else if ((event.key === '+' || event.key === '=') && ready) {
        event.preventDefault();
        animateZoomRef.current(zoomRef.current * ZOOM_STEP);
      } else if (event.key === '-' && ready) {
        event.preventDefault();
        animateZoomRef.current(zoomRef.current / ZOOM_STEP);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [ready]);

  // Estimate the tempo once the editor has settled, never during the morph.
  useEffect(() => {
    if (!sample || !ready || !revealed) return;

    const timer = window.setTimeout(() => {
      if (tempoRef.current !== null) return;
      const estimate = detectTempo(sample.channelData, sample.meta.sampleRate);
      if (!estimate) return;
      tempoRef.current = estimate.bpm;
      setTempo(estimate.bpm);
    }, TEMPO_ANALYSIS_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [sample, ready, revealed]);

  const applySelection = (next: Selection) => {
    selectionRef.current = next;
    playbackRef.current?.setSelection(next);
    setSelection(next);
    renderPlayhead(playbackRef.current?.getCurrentTime() ?? next.start);
  };

  const commitTrim = () => {
    const playback = playbackRef.current;
    if (!playback) return;
    void playback.restartInsideSelection().then(() => {
      renderPlayhead(playback.getCurrentTime());
      if (playback.isPlaying()) startPlaybackFrame();
    });
  };

  // In loop mode with a known tempo the selection lives on the beat grid.
  const gridTempo = () => (loopRef.current ? tempoRef.current : null);

  const snapToGrid = (bpm: number) => {
    if (!sample) return;
    const snapped = snapSelectionToGrid(
      selectionRef.current,
      'end',
      bpm,
      sample.meta.duration,
    );
    if (!snapped) return;

    // Keep the first "before": a tempo correction re-snaps, but what loop
    // mode should hand back is still the selection the user had made.
    loopSnapRef.current = {
      before: loopSnapRef.current?.before ?? selectionRef.current,
      snapped,
    };
    applySelection(snapped);
  };

  const toggleLoop = async () => {
    const playback = playbackRef.current;
    if (!playback) return;

    try {
      const next = !loopRef.current;
      loopRef.current = next;
      setLoop(next);

      if (next) {
        if (tempoRef.current) snapToGrid(tempoRef.current);
      } else {
        const snap = loopSnapRef.current;
        const current = selectionRef.current;
        if (snap && current.start === snap.snapped.start && current.end === snap.snapped.end) {
          applySelection(snap.before);
        }
        loopSnapRef.current = null;
        setTempoDraft(null);
      }

      await playback.setLoop(next);
      if (playback.isPlaying()) startPlaybackFrame();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to change loop state');
    }
  };

  const changeTempo = (bpm: number) => {
    const next = Math.round(clamp(bpm, MIN_TEMPO, MAX_TEMPO) * 10) / 10;
    tempoRef.current = next;
    setTempo(next);
    if (loopRef.current) {
      snapToGrid(next);
      commitTrim();
    }
  };

  const commitTempoDraft = () => {
    if (tempoDraft === null) return;
    const value = Number.parseFloat(tempoDraft.replace(',', '.'));
    setTempoDraft(null);
    if (Number.isFinite(value) && value > 0) changeTempo(value);
  };

  const moveEdge = (edge: TrimEdge, time: number, free = false) => {
    if (!sample) return;

    let next = moveSelectionEdge(
      selectionRef.current,
      edge,
      time,
      sample.meta.duration,
      MIN_SELECTION_SECONDS,
    );

    const bpm = free ? null : gridTempo();
    if (bpm) {
      next = snapSelectionToGrid(next, edge, bpm, sample.meta.duration) ?? next;
    }

    applySelection(next);
  };

  const trimAtPointer = (edge: TrimEdge, clientX: number, free = false) => {
    if (!waveformRef.current) return;

    const rect = waveformRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;

    const range = visibleRangeRef.current;
    const span = range.end - range.start;
    if (span <= 0) return;

    const localProgress = clamp((clientX - rect.left) / rect.width, 0, 1);
    moveEdge(edge, range.start + localProgress * span, free);
  };

  const stopEdgeScroll = () => {
    if (edgeScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(edgeScrollFrameRef.current);
      edgeScrollFrameRef.current = null;
    }
  };

  // While zoomed in, holding a handle against either end of the view scrolls
  // the waveform under it, so a trim can reach audio that is off screen.
  const startEdgeScroll = () => {
    stopEdgeScroll();

    const tick = () => {
      const active = trimDragRef.current;
      const waveform = waveformRef.current;
      const wavesurfer = waveSurferRef.current;
      if (!active || !waveform || !wavesurfer) {
        edgeScrollFrameRef.current = null;
        return;
      }

      if (zoomRef.current > 1) {
        const rect = waveform.getBoundingClientRect();
        const fromLeft = active.clientX - rect.left;
        const fromRight = rect.right - active.clientX;
        const push = fromLeft < EDGE_SCROLL_ZONE
          ? -(1 - Math.max(0, fromLeft) / EDGE_SCROLL_ZONE)
          : fromRight < EDGE_SCROLL_ZONE
            ? 1 - Math.max(0, fromRight) / EDGE_SCROLL_ZONE
            : 0;

        if (push !== 0) {
          wavesurfer.setScroll(wavesurfer.getScroll() + push * EDGE_SCROLL_SPEED);
          trimAtPointer(active.edge, active.clientX, active.free);
        }
      }

      edgeScrollFrameRef.current = window.requestAnimationFrame(tick);
    };

    edgeScrollFrameRef.current = window.requestAnimationFrame(tick);
  };

  const beginTrim = (edge: TrimEdge, event: React.PointerEvent<HTMLDivElement>) => {
    if (!ready) return;
    event.preventDefault();
    event.stopPropagation();
    // Holding Option leaves the grid for a free trim.
    trimDragRef.current = {
      edge,
      pointerId: event.pointerId,
      clientX: event.clientX,
      free: event.altKey,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    setDragEdge(edge);
    trimAtPointer(edge, event.clientX, event.altKey);
    startEdgeScroll();
  };

  const continueTrim = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = trimDragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    active.clientX = event.clientX;
    active.free = event.altKey;
    trimAtPointer(active.edge, event.clientX, event.altKey);
  };

  const endTrim = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = trimDragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    trimDragRef.current = null;
    stopEdgeScroll();
    setDragEdge(null);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    commitTrim();
  };

  // Arrow keys nudge a focused handle for precise trims.
  const nudgeTrim = (edge: TrimEdge, event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!ready) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();

    const step = NUDGE_SECONDS * (event.shiftKey ? 10 : 1);
    const direction = event.key === 'ArrowLeft' ? -1 : 1;

    // On the grid the length is fixed by the tempo, so nudging slides the
    // whole loop instead: that is how its start is lined up with the beat.
    if (gridTempo() && !event.altKey && sample) {
      const current = selectionRef.current;
      const shift = clamp(
        direction * step,
        -current.start,
        sample.meta.duration - current.end,
      );
      applySelection({ start: current.start + shift, end: current.end + shift });
    } else {
      moveEdge(edge, selectionRef.current[edge] + direction * step, true);
    }

    commitTrim();
  };

  const newCapture = async () => {
    if (!sample || discarding) return;
    setDiscarding(true);

    try {
      playbackRef.current?.pause();
      stopPlaybackFrame();

      // One gesture: the card folds back into the island and the next
      // capture starts. The island collapses at once; the background starts
      // recording and tells it when it is live (or closes it if Chrome
      // refuses to capture without a new toolbar click).
      window.parent.postMessage({ type: 'tab-sampler:new-capture' }, '*');

      if (DEMO_MODE) {
        setDiscarding(false);
        return;
      }

      await deleteSample(sample.meta.id);
      await sendMessage('background:new-capture', { sampleId: sample.meta.id });
    } catch {
      // The island is already collapsing and waiting to go live. If the
      // background cannot be reached it never will: close it instead.
      window.parent.postMessage({ type: 'tab-sampler:close' }, '*');
    }
  };

  const exportSample = async () => {
    if (!sample || exporting) return;
    setExporting(true);

    try {
      playbackRef.current?.pause();
      stopPlaybackFrame();

      // Loop mode exports a loop: seamless, with its tempo and length in
      // the file and in its name. Otherwise the selection as recorded.
      const active = selectionRef.current;
      const bpm = tempoRef.current ?? undefined;
      const beats = bpm ? selectionBeats(active, bpm) ?? undefined : undefined;
      const loopInfo = {
        ...(bpm !== undefined && beats !== undefined ? { bpm, beats } : {}),
      };
      const blob = loopRef.current
        ? await encodeLoopAsWav(sample, active, loopInfo)
        : await encodeSelectionAsWav(sample, active);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = sampleFilename(
        sample.meta.createdAt,
        loopRef.current ? loopInfo : undefined,
      );
      link.hidden = true;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);

      // The showcase has no extension behind it: keep the editor open.
      if (DEMO_MODE) {
        setExporting(false);
        return;
      }

      await deleteSample(sample.meta.id);
      await sendMessage('background:reset', { sampleId: sample.meta.id });
      window.parent.postMessage({ type: 'tab-sampler:close' }, '*');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Export failed');
      setExporting(false);
    }
  };

  if (error) {
    return (
      <main className="editor editor--error">
        <p>{error}</p>
      </main>
    );
  }

  if (!sample) {
    return <main className="editor editor--loading" aria-label="Loading sample" />;
  }

  const visibleSpan = Math.max(0, visibleRange.end - visibleRange.start);
  const startPercent = visibleSpan > 0
    ? clamp((selection.start - visibleRange.start) / visibleSpan, 0, 1) * 100
    : 0;
  const endPercent = visibleSpan > 0
    ? clamp((selection.end - visibleRange.start) / visibleSpan, 0, 1) * 100
    : 100;
  const startBoundaryVisible = selection.start >= visibleRange.start && selection.start <= visibleRange.end;
  const endBoundaryVisible = selection.end >= visibleRange.start && selection.end <= visibleRange.end;
  const zoomed = zoom > 1.001;
  const loopBeats = loop && tempo ? selectionBeats(selection, tempo) : null;

  return (
    <main
      className={`editor ${ready ? 'is-ready' : ''} ${revealed ? 'is-revealed' : ''}`}
    >
      <section
        className={`wave-shell ${zoomed ? 'is-zoomed' : ''}`}
        aria-label="Captured audio waveform"
        style={{
          '--trim-start': `${startPercent}%`,
          '--trim-end': `${endPercent}%`,
        } as React.CSSProperties}
      >
        <span className="record-seed" aria-hidden="true" />
        <div ref={waveformRef} className="waveform" />
        {(['start', 'end'] as const).map((edge) => {
          const visible = edge === 'start' ? startBoundaryVisible : endBoundaryVisible;
          if (!visible) return null;

          return (
            <div
              key={edge}
              className={`trim-boundary trim-boundary--${edge} ${dragEdge === edge ? 'is-dragging' : ''}`}
              style={{ left: `${edge === 'start' ? startPercent : endPercent}%` }}
              role="slider"
              tabIndex={0}
              aria-label={edge === 'start' ? 'Trim start' : 'Trim end'}
              aria-valuemin={edge === 'start' ? 0 : selection.start}
              aria-valuemax={edge === 'start' ? selection.end : sample.meta.duration}
              aria-valuenow={selection[edge]}
              aria-valuetext={formatReferenceTime(selection[edge])}
              onPointerDown={(event) => beginTrim(edge, event)}
              onPointerMove={continueTrim}
              onPointerUp={endTrim}
              onPointerCancel={endTrim}
              onKeyDown={(event) => nudgeTrim(edge, event)}
            >
              <span className="trim-boundary__line" />
              <span className="trim-boundary__grip" />
              <span className="trim-boundary__time" aria-hidden="true">
                {loopBeats ? formatBeats(loopBeats) : formatReferenceTime(selection[edge])}
              </span>
            </div>
          );
        })}
        <div ref={playheadRef} className="playhead" aria-hidden="true">
          <span className="playhead__cap" />
        </div>
        <div className="zoom-range" aria-hidden="true">
          <span
            className="zoom-range__thumb"
            style={{
              left: `${(visibleRange.start / sample.meta.duration) * 100}%`,
              width: `${(visibleSpan / sample.meta.duration) * 100}%`,
            }}
          />
        </div>
      </section>

      <div className="utility-actions" aria-label="Sample actions">
        <button
          type="button"
          className="utility-action"
          onMouseDown={keepFocus}
          onClick={() => void newCapture()}
          disabled={discarding || exporting}
          aria-label="New capture"
          title="New capture"
        >
          <SystemIcon name="plus" size={15} strokeWidth={2.2} />
        </button>
        <button
          type="button"
          className="utility-action"
          onMouseDown={keepFocus}
          onClick={() => void exportSample()}
          disabled={exporting || discarding || !ready}
          aria-label={loop ? 'Export loop' : 'Export WAV'}
          title={loop ? 'Export loop' : 'Export WAV'}
        >
          <SystemIcon name="download" size={15} strokeWidth={2.2} />
        </button>
      </div>

      <header className="sample-status">
        <span className="sample-status__dot" aria-hidden="true" />
        {!loop && <span>SAMPLED</span>}
        {loop && tempoDraft === null && (
          <>
            <button
              type="button"
              className="tempo-chip"
              onClick={() => setTempoDraft(tempo ? String(tempo) : '')}
              aria-label={tempo ? `Tempo ${tempo} BPM, edit` : 'Set tempo'}
              title="Edit tempo"
            >
              {tempo ? `${tempo} BPM` : 'SET BPM'}
            </button>
            {loopBeats && <span>{formatBeats(loopBeats).toUpperCase()}</span>}
          </>
        )}
        {loop && tempoDraft !== null && (
          <span className="tempo-edit">
            <input
              className="tempo-edit__input"
              type="text"
              inputMode="decimal"
              autoFocus
              value={tempoDraft}
              placeholder="BPM"
              aria-label="Tempo in BPM"
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => setTempoDraft(event.target.value)}
              onBlur={commitTempoDraft}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitTempoDraft();
                if (event.key === 'Escape') setTempoDraft(null);
              }}
            />
            {tempo && (
              <>
                <button
                  type="button"
                  className="tempo-chip"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setTempoDraft(null);
                    changeTempo(tempo / 2);
                  }}
                  aria-label="Halve tempo"
                >
                  ÷2
                </button>
                <button
                  type="button"
                  className="tempo-chip"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setTempoDraft(null);
                    changeTempo(tempo * 2);
                  }}
                  aria-label="Double tempo"
                >
                  ×2
                </button>
              </>
            )}
          </span>
        )}
      </header>

      <footer className="controls">
        <div className="sample-meta">
          <div className="sample-time">
            {formatReferenceTime(selectionDuration(selection))}
          </div>
        </div>

        <button
          type="button"
          className={`control control--loop ${loop ? 'is-active' : ''}`}
          onMouseDown={keepFocus}
          onClick={() => void toggleLoop()}
          disabled={!ready}
          aria-pressed={loop}
          aria-label="Loop selection"
          title="Loop selection"
        >
          <SystemIcon name="repeat" size={22} strokeWidth={2} />
        </button>

        <button
          type="button"
          className="control control--play"
          onMouseDown={keepFocus}
          onClick={() => void togglePlay()}
          disabled={!ready}
          aria-label={playing ? 'Pause' : 'Play selection'}
          title={playing ? 'Pause' : 'Play selection'}
        >
          <PlayPauseIcon playing={playing} size={28} />
        </button>
      </footer>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
