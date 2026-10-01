import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import WaveSurfer from 'wavesurfer.js';
import { formatSeconds, sampleFilename } from '../../audio/domain/format';
import { moveSelectionEdge, selectionDuration } from '../../audio/domain/selection';
import type { LoadedSample, Selection } from '../../audio/domain/types';
import { encodeSelectionAsWav } from '../../audio/export/wav-exporter';
import { PcmPlaybackEngine } from '../../audio/playback/pcm-playback-engine';
import {
  deleteSample,
  getLatestSampleMeta,
  loadSample,
} from '../../audio/store/sample-store';
import { sendMessage } from '../../extension/messaging';
import { LoopIcon } from '../../ui/LoopIcon';
import { MorphIcon } from '../../ui/MorphIcon';
import './styles.css';

const EMPTY_SELECTION: Selection = { start: 0, end: 0 };
const MAX_ZOOM_FACTOR = 24;
const ZOOM_STEP = 1.55;
const MIN_SELECTION_SECONDS = 0.025;

type TrimEdge = 'start' | 'end';

interface VisibleRange {
  start: number;
  end: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
  const trimDragRef = useRef<{ edge: TrimEdge; pointerId: number } | null>(null);
  const applyZoomRef = useRef<(nextZoom: number) => void>(() => undefined);
  const togglePlayRef = useRef<() => Promise<void>>(async () => undefined);

  const [sample, setSample] = useState<LoadedSample | null>(null);
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [visibleRange, setVisibleRange] = useState<VisibleRange>({ start: 0, end: 0 });
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [ready, setReady] = useState(false);
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

    void (async () => {
      try {
        const meta = await getLatestSampleMeta();
        if (!meta) throw new Error('No captured sample found');
        const loaded = await loadSample(meta.id);
        if (!cancelled) setSample(loaded);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Unable to load sample');
        }
      }
    })();

    return () => {
      cancelled = true;
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
      peaks: sample.channelData,
      duration,
      height: 118,
      waveColor: 'rgba(255,255,255,0.72)',
      progressColor: 'rgba(255,255,255,0.72)',
      cursorWidth: 0,
      barWidth: 2,
      barGap: 2,
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
      renderPlayhead(selectionRef.current.end);
    });

    const updateVisibleRange = (start: number, end: number) => {
      const next = { start, end };
      visibleRangeRef.current = next;
      setVisibleRange(next);
      renderPlayhead(currentTimeRef.current);
    };

    const applyZoom = (requestedZoom: number) => {
      const waveform = waveformRef.current;
      if (!waveform || duration <= 0 || !wavesurfer.getDecodedData()) return;

      const nextZoom = clamp(requestedZoom, 1, MAX_ZOOM_FACTOR);
      const fitPxPerSec = waveform.clientWidth / duration;
      const minPxPerSec = fitPxPerSec * nextZoom;
      const previous = visibleRangeRef.current;
      const center = previous.end > previous.start
        ? (previous.start + previous.end) / 2
        : currentTimeRef.current;
      const visibleDuration = Math.min(duration, waveform.clientWidth / minPxPerSec);
      const start = clamp(
        center - visibleDuration / 2,
        0,
        Math.max(0, duration - visibleDuration),
      );

      zoomRef.current = nextZoom;
      setZoom(nextZoom);
      wavesurfer.zoom(minPxPerSec);
      wavesurfer.setScrollTime(start);
      updateVisibleRange(start, Math.min(duration, start + visibleDuration));
    };

    applyZoomRef.current = applyZoom;

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

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const direction = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
        applyZoom(zoomRef.current * direction);
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

    waveformRef.current.addEventListener('wheel', handleWheel, { passive: false });
    cleanup.push(() => waveformRef.current?.removeEventListener('wheel', handleWheel));

    return () => {
      disposed = true;
      stopPlaybackFrame();
      cleanup.forEach((unsubscribe) => unsubscribe());
      applyZoomRef.current = () => undefined;
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === ' ' && ready) {
        event.preventDefault();
        void togglePlayRef.current();
      } else if ((event.key === '+' || event.key === '=') && ready) {
        event.preventDefault();
        applyZoomRef.current(zoomRef.current * ZOOM_STEP);
      } else if (event.key === '-' && ready) {
        event.preventDefault();
        applyZoomRef.current(zoomRef.current / ZOOM_STEP);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [ready]);

  const toggleLoop = async () => {
    const playback = playbackRef.current;
    if (!playback) return;

    try {
      const next = !loopRef.current;
      loopRef.current = next;
      setLoop(next);
      await playback.setLoop(next);
      if (playback.isPlaying()) startPlaybackFrame();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to change loop state');
    }
  };

  const trimAtPointer = (edge: TrimEdge, clientX: number) => {
    if (!sample || !waveformRef.current) return;

    const rect = waveformRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;

    const range = visibleRangeRef.current;
    const span = range.end - range.start;
    if (span <= 0) return;

    const localProgress = clamp((clientX - rect.left) / rect.width, 0, 1);
    const time = range.start + localProgress * span;
    const next = moveSelectionEdge(
      selectionRef.current,
      edge,
      time,
      sample.meta.duration,
      MIN_SELECTION_SECONDS,
    );

    selectionRef.current = next;
    playbackRef.current?.setSelection(next);
    setSelection(next);
    renderPlayhead(playbackRef.current?.getCurrentTime() ?? next.start);
  };

  const beginTrim = (edge: TrimEdge, event: React.PointerEvent<HTMLDivElement>) => {
    if (!ready) return;
    event.preventDefault();
    event.stopPropagation();
    trimDragRef.current = { edge, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
    trimAtPointer(edge, event.clientX);
  };

  const continueTrim = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = trimDragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    trimAtPointer(active.edge, event.clientX);
  };

  const endTrim = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = trimDragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    trimDragRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const playback = playbackRef.current;
    if (!playback) return;
    void playback.restartInsideSelection().then(() => {
      renderPlayhead(playback.getCurrentTime());
      if (playback.isPlaying()) startPlaybackFrame();
    });
  };

  const newCapture = async () => {
    if (!sample || discarding) return;
    setDiscarding(true);

    try {
      playbackRef.current?.pause();
      stopPlaybackFrame();
      await deleteSample(sample.meta.id);
      await sendMessage('background:reset', { sampleId: sample.meta.id });
      window.setTimeout(() => window.close(), 50);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to discard sample');
      setDiscarding(false);
    }
  };

  const exportSample = async () => {
    if (!sample || exporting) return;
    setExporting(true);

    try {
      playbackRef.current?.pause();
      stopPlaybackFrame();

      const blob = await encodeSelectionAsWav(sample, selectionRef.current);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = sampleFilename(sample.meta.createdAt);
      link.hidden = true;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);

      await deleteSample(sample.meta.id);
      await sendMessage('background:reset', { sampleId: sample.meta.id });
      window.setTimeout(() => window.close(), 80);
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

  return (
    <main className={`editor ${ready ? 'is-ready' : ''}`}>
      <header className="editor__header">
        <button
          type="button"
          className="header-action header-action--new"
          onClick={() => void newCapture()}
          disabled={discarding || exporting}
          title="Discard sample and start a new capture"
        >
          New
        </button>

        <button
          type="button"
          className="header-action header-action--export"
          onClick={() => void exportSample()}
          disabled={exporting || discarding || !ready}
          aria-label="Export WAV"
          title="Export WAV"
        >
          Export
        </button>
      </header>

      <section className="wave-shell" aria-label="Captured audio waveform">
        <span className="record-seed" aria-hidden="true" />
        <div ref={waveformRef} className="waveform" />
        <div
          className="trim-mask trim-mask--left"
          style={{ width: `${startPercent}%` }}
          aria-hidden="true"
        />
        <div
          className="trim-mask trim-mask--right"
          style={{ left: `${endPercent}%`, width: `${100 - endPercent}%` }}
          aria-hidden="true"
        />
        {startBoundaryVisible && (
          <div
            className="trim-boundary"
            style={{ left: `${startPercent}%` }}
            role="slider"
            aria-label="Trim start"
            aria-valuemin={0}
            aria-valuemax={selection.end}
            aria-valuenow={selection.start}
            onPointerDown={(event) => beginTrim('start', event)}
            onPointerMove={continueTrim}
            onPointerUp={endTrim}
            onPointerCancel={endTrim}
          >
            <span className="trim-boundary__line" />
            <span className="trim-boundary__grip" />
          </div>
        )}
        {endBoundaryVisible && (
          <div
            className="trim-boundary"
            style={{ left: `${endPercent}%` }}
            role="slider"
            aria-label="Trim end"
            aria-valuemin={selection.start}
            aria-valuemax={sample.meta.duration}
            aria-valuenow={selection.end}
            onPointerDown={(event) => beginTrim('end', event)}
            onPointerMove={continueTrim}
            onPointerUp={endTrim}
            onPointerCancel={endTrim}
          >
            <span className="trim-boundary__line" />
            <span className="trim-boundary__grip" />
          </div>
        )}
        <div ref={playheadRef} className="playhead" aria-hidden="true">
          <span className="playhead__cap" />
        </div>
      </section>

      <footer className="controls">
        <div className="sample-meta">
          <div className="sample-status">
            <span className="sample-status__dot" aria-hidden="true" />
            <span>SAVED</span>
          </div>
          <div className="sample-time">
            {formatSeconds(selectionDuration(selection))}
          </div>
        </div>

        <button
          type="button"
          className={`control control--loop ${loop ? 'is-active' : ''}`}
          onClick={() => void toggleLoop()}
          disabled={!ready}
          aria-pressed={loop}
          aria-label="Loop selection"
          title="Loop selection"
        >
          <LoopIcon size={22} />
        </button>

        <button
          type="button"
          className="control control--play"
          onClick={() => void togglePlay()}
          disabled={!ready}
          aria-label={playing ? 'Pause' : 'Play selection'}
          title={playing ? 'Pause' : 'Play selection'}
        >
          <MorphIcon name={playing ? 'pause' : 'play'} size={24} />
        </button>
      </footer>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
