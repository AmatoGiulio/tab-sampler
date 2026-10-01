export type SamplerSurfaceMode = 'recording' | 'editor';
export type SamplerSurfaceEnvironment = 'extension' | 'showcase';

export function mountSamplerSurfaceDom(
  src: string,
  hostId: string,
  mode: SamplerSurfaceMode,
  environment: SamplerSurfaceEnvironment = 'extension',
): void {
  type SamplerWindow = Window & {
    __tabSamplerSurfaceCleanup?: () => void;
  };

  const isolatedWindow = window as SamplerWindow;
  isolatedWindow.__tabSamplerSurfaceCleanup?.();
  document.getElementById(hostId)?.remove();

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
    :host {
      all: initial;
      --material-spring: linear(
        0,
        .018,
        .066,
        .154,
        .286,
        .449,
        .618,
        .766,
        .881,
        .956,
        1.003,
        1.026,
        1.022,
        1.012,
        1.004,
        1
      );
    }

    .stage {
      position: fixed;
      inset: 0;
      pointer-events: none;
    }

    .surface {
      --light-x: 24%;
      --light-y: 2%;

      position: absolute;
      top: 16px;
      right: 16px;
      width: 352px;
      height: 336px;
      overflow: hidden;
      pointer-events: none;
      border-radius: 48px;
      corner-shape: squircle;
      isolation: isolate;

      clip-path: inset(0 0 292px 308px round 22px);

      background: rgba(17, 17, 20, .58);
      -webkit-backdrop-filter:
        blur(30px)
        saturate(155%)
        brightness(78%)
        contrast(108%);
      backdrop-filter:
        blur(30px)
        saturate(155%)
        brightness(78%)
        contrast(108%);

      box-shadow:
        0 18px 46px rgba(0, 0, 0, .23),
        0 1px 0 rgba(255, 255, 255, .15) inset,
        0 0 0 .5px rgba(255, 255, 255, .065) inset;

      transform-origin: 100% 0%;
      transform: translate3d(0, 0, 0);
      backface-visibility: hidden;
      contain: layout paint;
      will-change: clip-path, transform, opacity;

      transition:
        clip-path 520ms var(--material-spring),
        background-color 260ms ease,
        box-shadow 320ms ease,
        opacity 150ms ease,
        transform 180ms ease;
    }

    .surface::before {
      content: '';
      position: absolute;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      border-radius: inherit;
      corner-shape: inherit;
      background:
        radial-gradient(
          88% 58% at var(--light-x) var(--light-y),
          rgba(255, 255, 255, .145) 0%,
          rgba(255, 255, 255, .060) 24%,
          rgba(255, 255, 255, .012) 52%,
          transparent 72%
        ),
        linear-gradient(
          180deg,
          rgba(255, 255, 255, .035) 0%,
          transparent 26%,
          rgba(255, 255, 255, .010) 100%
        );
      mix-blend-mode: screen;
      opacity: .78;
      transition:
        opacity 320ms ease,
        filter 420ms var(--material-spring);
    }

    .surface::after {
      content: '';
      position: absolute;
      inset: 1px;
      z-index: 5;
      pointer-events: none;
      border-radius: inherit;
      corner-shape: inherit;
      box-shadow:
        0 0 0 .7px rgba(255, 255, 255, .075) inset,
        0 1px 0 rgba(255, 255, 255, .065) inset,
        0 -1px 0 rgba(0, 0, 0, .15) inset;
      opacity: .86;
    }

    .surface.is-live {
      clip-path: inset(0 0 286px 154px round 25px);
      pointer-events: auto;
      cursor: pointer;
      animation: island-settle 430ms both;
    }

    .surface.is-live .stop-control {
      opacity: 1;
      transform: scale(1);
    }

    .surface.is-frozen {
      cursor: default;
    }

    .surface.is-expanded {
      clip-path: inset(0 round 48px);
      pointer-events: auto;
      background: rgba(15, 15, 18, .61);
      box-shadow:
        0 28px 72px rgba(0, 0, 0, .28),
        0 10px 30px rgba(0, 0, 0, .13),
        0 1px 0 rgba(255, 255, 255, .16) inset,
        0 0 0 .5px rgba(255, 255, 255, .070) inset;
      animation: surface-settle 560ms both;
    }

    .surface.is-expanded::before {
      opacity: .9;
      filter: saturate(1.03);
    }

    .surface.is-closing {
      opacity: 0;
      transform: translateY(-4px) scale(.986);
      transition-duration: 120ms;
    }

    .recorder {
      position: absolute;
      z-index: 2;
      top: 0;
      right: 0;
      width: 198px;
      height: 50px;
      display: grid;
      grid-template-columns: 24px minmax(0, 1fr) 40px;
      align-items: center;
      gap: 10px;
      padding: 0 12px 0 10px;

      opacity: 0;
      transform: translate3d(0, 2px, 0) scale(.985);
      transform-origin: 100% 0%;
      filter: blur(1.5px);

      transition:
        opacity 150ms ease 72ms,
        transform 360ms var(--material-spring) 32ms,
        filter 220ms ease 42ms;
    }

    .surface.is-live .recorder {
      opacity: 1;
      transform: translate3d(0, 0, 0) scale(1);
      filter: blur(0);
    }

    .surface.is-expanded .recorder {
      opacity: 0;
      transform: translate3d(0, -3px, 0) scale(.975);
      filter: blur(3px);
      transition:
        opacity 90ms ease,
        transform 180ms ease,
        filter 140ms ease;
    }

    .stop-control {
      width: 24px;
      height: 24px;
      display: block;
      position: relative;
      padding: 0;
      border: 0;
      border-radius: 999px;
      background: rgba(255, 69, 58, .96);
      box-shadow:
        0 4px 12px rgba(255, 59, 48, .18),
        0 1px 0 rgba(255, 255, 255, .26) inset,
        0 0 0 .5px rgba(255, 255, 255, .08) inset;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;

      opacity: 0;
      transform: scale(.76);
      transition:
        transform 300ms var(--material-spring),
        filter 110ms ease,
        opacity 120ms ease,
        background-color 140ms ease;
      will-change: transform, filter;
    }

    .stop-control::before {
      content: '';
      position: absolute;
      left: 50%;
      top: 50%;
      width: 7px;
      height: 7px;
      margin-left: -3.5px;
      margin-top: -3.5px;
      border-radius: 2px;
      background: rgba(255, 255, 255, .98);
      pointer-events: none;
    }

    .stop-control:hover {
      filter: brightness(1.055);
    }

    .stop-control:active {
      transform: scale(.88);
      filter: brightness(.96);
    }

    .surface.is-frozen .stop-control {
      opacity: .52;
      cursor: default;
      filter: saturate(.72);
    }

    .surface:not(.is-live) .stop-control {
      opacity: 0;
    }

    .wave-wrap {
      position: relative;
      min-width: 0;
      height: 28px;
      display: grid;
      align-items: center;
      overflow: hidden;
      -webkit-mask-image: linear-gradient(
        90deg,
        transparent 0%,
        rgba(0, 0, 0, .42) 8%,
        #000 20%,
        #000 88%,
        rgba(0, 0, 0, .62) 95%,
        transparent 100%
      );
      mask-image: linear-gradient(
        90deg,
        transparent 0%,
        rgba(0, 0, 0, .42) 8%,
        #000 20%,
        #000 88%,
        rgba(0, 0, 0, .62) 95%,
        transparent 100%
      );
    }

    canvas {
      width: 100%;
      height: 28px;
      display: block;
    }

    .timer {
      color: rgba(255, 255, 255, .83);
      font-family:
        ui-monospace,
        "SFMono-Regular",
        "SF Mono",
        "Roboto Mono",
        monospace;
      font-size: 10px;
      font-weight: 560;
      line-height: 1;
      letter-spacing: -.045em;
      font-variant-numeric: tabular-nums;
      text-align: right;
      white-space: nowrap;
      text-shadow: 0 1px 5px rgba(0, 0, 0, .26);
    }

    iframe {
      position: absolute;
      z-index: 3;
      inset: 0;
      display: block;
      width: 352px;
      height: 336px;
      border: 0;
      background: transparent;
      color-scheme: dark;

      opacity: 0;
      pointer-events: none;
      transform: translate3d(0, 10px, 0) scale(.985);
      transform-origin: 50% 44%;
      filter: blur(5px);

      transition:
        opacity 190ms ease-out 105ms,
        transform 470ms var(--material-spring) 48ms,
        filter 260ms ease 70ms;
      will-change: opacity, transform, filter;
    }

    .surface.is-editor-ready iframe {
      opacity: 1;
      pointer-events: auto;
      transform: translate3d(0, 0, 0) scale(1);
      filter: blur(0);
    }

    @keyframes island-settle {
      0% { transform: translate3d(0, -1px, 0) scale(.985); }
      45% { transform: translate3d(0, 0, 0) scale(1.008); }
      72% { transform: translate3d(0, 0, 0) scale(.998); }
      100% { transform: translate3d(0, 0, 0) scale(1); }
    }

    @keyframes surface-settle {
      0% { transform: translate3d(0, -1px, 0) scale(.994); }
      44% { transform: translate3d(0, 0, 0) scale(1.006); }
      70% { transform: translate3d(0, 0, 0) scale(.9985); }
      100% { transform: translate3d(0, 0, 0) scale(1); }
    }

    @media (prefers-reduced-motion: reduce) {
      .surface,
      .recorder,
      .stop-control,
      iframe {
        animation-duration: 1ms !important;
        transition-duration: 1ms !important;
        transition-delay: 0ms !important;
      }
    }
  `;

  const stage = document.createElement('div');
  stage.className = 'stage';

  const surface = document.createElement('div');
  surface.className = 'surface';

  const recorder = document.createElement('div');
  recorder.className = 'recorder';

  const stopControl = document.createElement('button');
  stopControl.className = 'stop-control';
  stopControl.type = 'button';
  stopControl.setAttribute('aria-label', 'Stop recording');
  stopControl.title = 'Stop recording';

  const waveWrap = document.createElement('div');
  waveWrap.className = 'wave-wrap';

  const canvas = document.createElement('canvas');
  waveWrap.append(canvas);

  const timer = document.createElement('span');
  timer.className = 'timer';
  timer.textContent = '0:00';

  recorder.append(stopControl, waveWrap, timer);

  const frame = document.createElement('iframe');
  frame.title = 'Tab Sampler editor';
  frame.allow = 'autoplay';
  frame.setAttribute('aria-label', 'Tab Sampler audio editor');

  surface.append(recorder, frame);
  stage.append(surface);
  shadow.append(style, stage);
  document.documentElement.append(host);

  const context = canvas.getContext('2d');
  const peaks = Array.from({ length: 30 }, () => 0.04);
  let smoothedPeak = 0.04;
  let startedAt = performance.now();
  let frozenAt: number | null = null;
  let timerRaf = 0;
  let closed = false;
  let demoMeterTimer = 0;
  let demoResetTimer = 0;
  let demoUnloadTimer = 0;
  let editorReady = false;
  let expandRequested = false;
  let editorLoadStarted = false;

  const resizeCanvas = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    return { width, height, dpr };
  };

  const drawWave = () => {
    if (!context) return;

    const { width, height, dpr } = resizeCanvas();
    context.clearRect(0, 0, width, height);

    const count = peaks.length;
    const usable = width - 2 * dpr;
    const step = usable / Math.max(1, count - 1);

    context.lineWidth = Math.max(1.25 * dpr, 1);
    context.lineCap = 'round';
    context.strokeStyle = 'rgba(246,246,244,.9)';

    for (let index = 0; index < count; index += 1) {
      const value = peaks[index] ?? 0;
      const normalized = Math.pow(Math.max(.035, value), .58);
      const barHeight = Math.max(1.3 * dpr, normalized * height * .78);
      const x = dpr + index * step;
      const y1 = (height - barHeight) / 2;
      const y2 = y1 + barHeight;
      const edge = Math.min(index / 7, (count - 1 - index) / 5, 1);

      context.globalAlpha = Math.max(.06, edge);
      context.beginPath();
      context.moveTo(x, y1);
      context.lineTo(x, y2);
      context.stroke();
    }

    context.globalAlpha = 1;
  };

  const pushMeter = (peak: number, rms: number) => {
    if (frozenAt !== null) return;

    const energy = Math.max(peak * .74, rms * 1.8);
    smoothedPeak = smoothedPeak * .52 + energy * .48;
    peaks.push(Math.max(.025, Math.min(1, smoothedPeak)));
    peaks.shift();
    drawWave();
  };

  const renderTimer = () => {
    if (closed) return;

    const now = frozenAt ?? performance.now();
    const elapsedMs = Math.max(0, now - startedAt);
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    timer.textContent = `${minutes}:${String(seconds).padStart(2, '0')}`;
    timerRaf = window.requestAnimationFrame(renderTimer);
  };

  const freeze = () => {
    if (frozenAt !== null) return;
    frozenAt = performance.now();
    surface.classList.add('is-frozen');
  };

  const revealEditor = () => {
    if (!expandRequested || !editorReady) return;

    window.requestAnimationFrame(() => {
      if (closed) return;

      // Reveal the already-rendered editor in the exact frame in which
      // geometry starts expanding. This avoids the empty/black shell phase.
      surface.classList.add('is-expanded', 'is-editor-ready');
      window.requestAnimationFrame(() => {
        frame.contentWindow?.postMessage({ type: 'tab-sampler:present' }, '*');
      });
    });
  };

  const prepareEditor = () => {
    if (editorLoadStarted) return;
    editorLoadStarted = true;
    frame.src = src;
  };

  const expand = () => {
    freeze();
    expandRequested = true;
    prepareEditor();
    revealEditor();
  };

  const resetShowcase = () => {
    if (environment !== 'showcase') return;

    if (demoResetTimer) window.clearTimeout(demoResetTimer);
    if (demoUnloadTimer) window.clearTimeout(demoUnloadTimer);

    // First fade the editor while it is still fully rendered.
    // Removing iframe.src immediately navigates it to about:blank and can
    // expose a bright frame during the collapse.
    surface.classList.remove('is-editor-ready');

    demoResetTimer = window.setTimeout(() => {
      surface.classList.remove('is-expanded', 'is-frozen');

      frozenAt = null;
      startedAt = performance.now();
      smoothedPeak = .04;
      peaks.fill(.04);
      drawWave();

      editorReady = false;
      expandRequested = false;
      editorLoadStarted = false;
    }, 90);

    // Unload only after both the editor fade and the island collapse are done.
    demoUnloadTimer = window.setTimeout(() => {
      frame.removeAttribute('src');
    }, 520);
  };

  const requestStop = () => {
    if (
      closed ||
      frozenAt !== null ||
      surface.classList.contains('is-expanded')
    ) {
      return;
    }

    freeze();

    if (environment === 'showcase') {
      window.setTimeout(expand, 60);
      return;
    }

    void chrome.runtime.sendMessage({
      type: 'tab-sampler:stop-request',
    });
  };

  const close = () => {
    if (closed) return;
    closed = true;
    surface.classList.add('is-closing');
    window.cancelAnimationFrame(timerRaf);
    if (demoMeterTimer) window.clearInterval(demoMeterTimer);
    if (demoResetTimer) window.clearTimeout(demoResetTimer);
    if (demoUnloadTimer) window.clearTimeout(demoUnloadTimer);

    window.setTimeout(() => cleanup(), 140);
  };

  const runtimeListener = (
    message: { type?: string; peak?: number; rms?: number },
  ) => {
    if (message?.type === 'tab-sampler:island-meter') {
      pushMeter(message.peak ?? 0, message.rms ?? 0);
      return;
    }

    if (message?.type === 'tab-sampler:island-freeze') {
      freeze();
      return;
    }

    if (message?.type === 'tab-sampler:island-expand') {
      expand();
      return;
    }

    if (message?.type === 'tab-sampler:island-close') {
      close();
    }
  };

  const onWindowMessage = (event: MessageEvent) => {
    if (event.source !== frame.contentWindow) return;

    if (event.data?.type === 'tab-sampler:ready') {
      editorReady = true;
      revealEditor();
      return;
    }

    if (event.data?.type === 'tab-sampler:demo-reset') {
      resetShowcase();
      return;
    }

    if (event.data?.type === 'tab-sampler:close') close();
  };

  const updateMaterialLight = (event: PointerEvent) => {
    const rect = surface.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = Math.max(8, Math.min(92, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(-6, Math.min(72, ((event.clientY - rect.top) / rect.height) * 100));
    surface.style.setProperty('--light-x', `${x.toFixed(1)}%`);
    surface.style.setProperty('--light-y', `${y.toFixed(1)}%`);
  };

  const resetMaterialLight = () => {
    surface.style.setProperty('--light-x', '24%');
    surface.style.setProperty('--light-y', '2%');
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!surface.classList.contains('is-expanded')) return;
    if (event.composedPath().includes(host)) return;
    if (environment === 'showcase') return;
    close();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (environment === 'showcase' && event.key.toLowerCase() === 'r') {
      resetShowcase();
      return;
    }

    if (
      event.key === 'Escape' &&
      surface.classList.contains('is-expanded') &&
      environment === 'extension'
    ) {
      close();
    }
  };

  const cleanup = () => {
    closed = true;
    window.cancelAnimationFrame(timerRaf);
    if (demoMeterTimer) window.clearInterval(demoMeterTimer);
    surface.removeEventListener('click', requestStop);
    surface.removeEventListener('pointermove', updateMaterialLight);
    surface.removeEventListener('pointerleave', resetMaterialLight);
    window.removeEventListener('message', onWindowMessage);
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('keydown', onKeyDown, true);

    if (environment === 'extension') {
      chrome.runtime.onMessage.removeListener(runtimeListener);
    }

    host.remove();

    if (isolatedWindow.__tabSamplerSurfaceCleanup === cleanup) {
      delete isolatedWindow.__tabSamplerSurfaceCleanup;
    }
  };

  stopControl.addEventListener('click', (event) => {
    event.stopPropagation();
    requestStop();
  });
  surface.addEventListener('click', requestStop);
  surface.addEventListener('pointermove', updateMaterialLight);
  surface.addEventListener('pointerleave', resetMaterialLight);
  window.addEventListener('message', onWindowMessage);
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('keydown', onKeyDown, true);

  if (environment === 'extension') {
    chrome.runtime.onMessage.addListener(runtimeListener);
  } else {
    demoMeterTimer = window.setInterval(() => {
      const t = performance.now() / 1000;
      const peak = Math.min(
        1,
        .16 +
          Math.abs(Math.sin(t * 2.17)) * .28 +
          Math.abs(Math.sin(t * 5.07 + .8)) * .20 +
          (Math.random() > .78 ? Math.random() * .28 : 0),
      );
      const rms = peak * (.34 + Math.random() * .16);
      pushMeter(peak, rms);
    }, 34);
  }

  isolatedWindow.__tabSamplerSurfaceCleanup = cleanup;

  drawWave();
  renderTimer();

  if (mode === 'editor') {
    surface.classList.add('is-live', 'is-frozen');
    frozenAt = performance.now();
    expandRequested = true;
    prepareEditor();
  } else {
    window.requestAnimationFrame(() => {
      surface.classList.add('is-live');
    });
  }
}
