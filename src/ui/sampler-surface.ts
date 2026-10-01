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
    :host { all: initial; }

    .stage {
      position: fixed;
      inset: 0;
      pointer-events: none;
    }

    .surface {
      position: absolute;
      z-index: 5;
      top: 16px;
      right: 16px;
      width: 44px;
      height: 44px;
      overflow: hidden;
      pointer-events: none;
      border-radius: 22px;
      corner-shape: squircle;
      isolation: isolate;
      background:
        radial-gradient(
          120% 140% at 22% -28%,
          rgba(255,255,255,.105) 0%,
          rgba(255,255,255,.018) 34%,
          transparent 62%
        ),
        linear-gradient(
          180deg,
          rgba(24,24,27,.88) 0%,
          rgba(12,12,15,.91) 100%
        );
      -webkit-backdrop-filter:
        blur(34px)
        saturate(165%)
        brightness(88%)
        contrast(104%);
      backdrop-filter:
        blur(34px)
        saturate(165%)
        brightness(88%)
        contrast(104%);
      box-shadow:
        0 12px 34px rgba(0,0,0,.29),
        0 1px 0 rgba(255,255,255,.17) inset,
        0 0 0 1px rgba(255,255,255,.035) inset,
        0 -1px 0 rgba(0,0,0,.24) inset;
      transform-origin: 100% 0%;
      transform: translate3d(0,0,0);
      backface-visibility: hidden;
      contain: layout paint;
      will-change: width, height, border-radius;
      transition:
        width 390ms cubic-bezier(.16,1,.3,1),
        height 390ms cubic-bezier(.16,1,.3,1),
        border-radius 390ms cubic-bezier(.16,1,.3,1),
        opacity 150ms ease,
        transform 180ms ease;
    }


    .morph-shell {
      position: absolute;
      z-index: 4;
      top: 16px;
      right: 16px;
      width: 198px;
      height: 50px;
      overflow: hidden;
      pointer-events: none;
      border-radius: 25px;
      corner-shape: squircle;
      isolation: isolate;
      opacity: 0;
      transform-origin: 100% 0%;
      transform: translate3d(0,0,0) scale(1,1);
      background:
        radial-gradient(
          120% 140% at 22% -28%,
          rgba(255,255,255,.105) 0%,
          rgba(255,255,255,.018) 34%,
          transparent 62%
        ),
        linear-gradient(
          180deg,
          rgba(24,24,27,.88) 0%,
          rgba(12,12,15,.91) 100%
        );
      box-shadow:
        0 12px 34px rgba(0,0,0,.29),
        0 1px 0 rgba(255,255,255,.17) inset,
        0 0 0 1px rgba(255,255,255,.035) inset,
        0 -1px 0 rgba(0,0,0,.24) inset;
      backface-visibility: hidden;
      contain: paint;
      will-change: transform, opacity;
    }

    .morph-shell::before {
      content: '';
      position: absolute;
      inset: 0;
      pointer-events: none;
      border-radius: inherit;
      corner-shape: inherit;
      background:
        linear-gradient(
          132deg,
          rgba(255,255,255,.095) 0%,
          rgba(255,255,255,.018) 19%,
          transparent 44%
        ),
        radial-gradient(
          76% 48% at 72% 105%,
          rgba(255,255,255,.024),
          transparent 72%
        );
      mix-blend-mode: screen;
    }

    .morph-shell::after {
      content: '';
      position: absolute;
      inset: 1px;
      pointer-events: none;
      border-radius: inherit;
      corner-shape: inherit;
      box-shadow:
        0 0 0 1px rgba(255,255,255,.038) inset,
        0 0 18px rgba(255,255,255,.014) inset;
    }

    .surface.is-morphing {
      transition: none !important;
    }

    .surface.is-morphing .recorder {
      transition:
        opacity 70ms ease,
        transform 110ms cubic-bezier(.4,0,.8,.2);
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
        linear-gradient(
          132deg,
          rgba(255,255,255,.095) 0%,
          rgba(255,255,255,.018) 19%,
          transparent 44%
        ),
        radial-gradient(
          76% 48% at 72% 105%,
          rgba(255,255,255,.024),
          transparent 72%
        );
      mix-blend-mode: screen;
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
        0 0 0 1px rgba(255,255,255,.038) inset,
        0 0 18px rgba(255,255,255,.014) inset;
    }

    .surface.is-live {
      width: 198px;
      height: 50px;
      border-radius: 25px;
      pointer-events: auto;
      cursor: pointer;
    }

    .surface.is-live .stop-control { opacity: 1; }
    .surface.is-frozen { cursor: default; }

    .surface.is-expanded {
      width: 352px;
      height: 336px;
      border-radius: 48px;
      pointer-events: auto;
      box-shadow:
        0 26px 64px rgba(0,0,0,.36),
        0 8px 22px rgba(0,0,0,.20),
        0 1px 0 rgba(255,255,255,.18) inset,
        0 0 0 1px rgba(255,255,255,.035) inset,
        0 -1px 0 rgba(0,0,0,.28) inset;
    }

    .surface.is-closing {
      opacity: 0;
      transform: translateY(-4px) scale(.988);
      transition-duration: 120ms;
    }

    .recorder {
      position: absolute;
      z-index: 2;
      inset: 0;
      display: grid;
      grid-template-columns: 24px 1fr 42px;
      align-items: center;
      gap: 10px;
      padding: 0 13px 0 10px;
      opacity: 0;
      transform: translateY(1px);
      transition:
        opacity 160ms ease 90ms,
        transform 220ms cubic-bezier(.2,.8,.2,1) 70ms;
    }

    .surface.is-live .recorder {
      opacity: 1;
      transform: translateY(0);
    }

    .surface.is-expanded .recorder {
      opacity: 0;
      transform: translateY(-8px) scale(.98);
      transition:
        opacity 90ms ease,
        transform 150ms cubic-bezier(.4,0,.8,.2);
    }

    .stop-control {
      width: 24px;
      height: 24px;
      display: block;
      position: relative;
      padding: 0;
      border: 0;
      border-radius: 999px;
      background:
        radial-gradient(
          circle at 34% 28%,
          rgba(255,255,255,.18),
          transparent 42%
        ),
        linear-gradient(
          180deg,
          #ff4b42 0%,
          #ff3129 54%,
          #e92721 100%
        );
      box-shadow:
        0 4px 12px rgba(255,48,40,.18),
        0 1px 0 rgba(255,255,255,.22) inset,
        0 -1px 0 rgba(110,0,0,.16) inset;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      transition:
        filter 120ms ease,
        opacity 120ms ease,
        background 120ms ease,
        box-shadow 120ms ease;
      transform: translateZ(0);
      will-change: filter;
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
      background: rgba(255,255,255,.96);
      box-shadow: 0 0 4px rgba(255,255,255,.12);
      pointer-events: none;
      transform: translateZ(0);
    }

    .stop-control:hover { filter: brightness(1.04); }
    .stop-control:active { filter: brightness(.96); }

    .surface.is-frozen .stop-control {
      opacity: .58;
      cursor: default;
      filter: saturate(.72);
    }

    .surface:not(.is-live) .stop-control { opacity: 0; }

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
        rgba(0,0,0,.5) 10%,
        #000 22%,
        #000 88%,
        rgba(0,0,0,.7) 95%,
        transparent 100%
      );
      mask-image: linear-gradient(
        90deg,
        transparent 0%,
        rgba(0,0,0,.5) 10%,
        #000 22%,
        #000 88%,
        rgba(0,0,0,.7) 95%,
        transparent 100%
      );
    }

    canvas {
      width: 100%;
      height: 28px;
      display: block;
    }

    .timer {
      color: rgba(255,255,255,.86);
      font-family:
        ui-monospace,
        "SFMono-Regular",
        "SF Mono",
        "Roboto Mono",
        monospace;
      font-size: 10px;
      font-weight: 590;
      line-height: 1;
      letter-spacing: -.055em;
      font-variant-numeric: tabular-nums;
      text-align: right;
      white-space: nowrap;
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
      transform: translateY(6px) scale(.994);
      transition:
        opacity 150ms ease,
        transform 240ms cubic-bezier(.2,.8,.2,1);
    }

    .surface.is-editor-ready iframe {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0) scale(1);
    }

    @media (prefers-reduced-motion: reduce) {
      .surface,
      .recorder,
      iframe {
        transition-duration: 1ms !important;
        transition-delay: 0ms !important;
      }
    }
  `;

  const stage = document.createElement('div');
  stage.className = 'stage';

  const surface = document.createElement('div');
  surface.className = 'surface';

  const morphShell = document.createElement('div');
  morphShell.className = 'morph-shell';

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
  stage.append(morphShell, surface);
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
  let morphAnimation: Animation | null = null;
  let sourceFadeAnimation: Animation | null = null;
  let destinationFadeAnimation: Animation | null = null;
  let morphSwapTimer = 0;
  let morphRevealTimer = 0;

  const MORPH_DURATION = 360;
  const EXPANDED_SCALE_X = 352 / 198;
  const EXPANDED_SCALE_Y = 336 / 50;
  const MORPH_EASING =
    'linear(0, .018, .064, .15, .278, .438, .602, .744, .854, .928, .973, .996, 1.006, 1.004, 1)';


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

    if (frozenAt === null) {
      timerRaf = window.requestAnimationFrame(renderTimer);
    } else {
      timerRaf = 0;
    }
  };

  const freeze = () => {
    if (frozenAt !== null) return;
    frozenAt = performance.now();
    surface.classList.add('is-frozen');

    if (timerRaf) {
      window.cancelAnimationFrame(timerRaf);
      timerRaf = 0;
    }
    renderTimer();
  };

  const clearMorphTimers = () => {
    if (morphSwapTimer) window.clearTimeout(morphSwapTimer);
    if (morphRevealTimer) window.clearTimeout(morphRevealTimer);
    morphSwapTimer = 0;
    morphRevealTimer = 0;
  };

  const cancelMorphAnimations = () => {
    morphAnimation?.cancel();
    sourceFadeAnimation?.cancel();
    destinationFadeAnimation?.cancel();
    morphAnimation = null;
    sourceFadeAnimation = null;
    destinationFadeAnimation = null;
    clearMorphTimers();
  };

  const revealEditor = () => {
    if (!expandRequested || !editorReady) return;
    if (surface.classList.contains('is-expanded')) return;

    cancelMorphAnimations();

    // The real live surface stays pixel-identical at the start. The proxy
    // takes over the geometry animation so Chrome never repaints a growing
    // 34px backdrop blur on every frame.
    morphShell.style.opacity = '1';
    morphShell.style.transform = 'translate3d(0,0,0) scale(1,1)';
    morphShell.style.borderRadius = '25px';

    surface.classList.add('is-morphing');

    morphAnimation = morphShell.animate(
      [
        {
          transform: 'translate3d(0,0,0) scale(1,1)',
          borderRadius: '25px',
          opacity: 1,
        },
        {
          transform:
            `translate3d(0,0,0) scale(${EXPANDED_SCALE_X},${EXPANDED_SCALE_Y})`,
          borderRadius: '27px / 7.15px',
          opacity: 1,
        },
      ],
      {
        duration: MORPH_DURATION,
        easing: MORPH_EASING,
        fill: 'forwards',
      },
    );

    sourceFadeAnimation = surface.animate(
      [
        { opacity: 1, offset: 0 },
        { opacity: 1, offset: .24 },
        { opacity: 0, offset: 1 },
      ],
      {
        duration: 96,
        easing: 'ease-out',
        fill: 'forwards',
      },
    );

    // Once the source is visually gone, jump the real surface directly to its
    // final geometry. This is one layout/paint, not 20+ layout/paint frames.
    morphSwapTimer = window.setTimeout(() => {
      surface.style.opacity = '0';
      surface.classList.add('is-expanded');
    }, 92);

    // Crossfade the already-rendered final surface over the proxy near the end.
    morphRevealTimer = window.setTimeout(() => {
      surface.classList.add('is-editor-ready');

      destinationFadeAnimation = surface.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        {
          duration: 118,
          easing: 'ease-out',
          fill: 'forwards',
        },
      );

      destinationFadeAnimation.finished
        .catch(() => undefined)
        .then(() => {
          if (closed) return;
          surface.style.opacity = '1';
        });
    }, MORPH_DURATION - 118);

    morphAnimation.finished
      .catch(() => undefined)
      .then(() => {
        if (closed) return;

        morphShell.style.opacity = '0';
        morphShell.style.transform = 'translate3d(0,0,0) scale(1,1)';
        morphShell.style.borderRadius = '25px';

        sourceFadeAnimation?.cancel();
        destinationFadeAnimation?.cancel();
        morphAnimation?.cancel();

        surface.style.opacity = '1';
        surface.classList.remove('is-morphing');

        morphAnimation = null;
        sourceFadeAnimation = null;
        destinationFadeAnimation = null;
        clearMorphTimers();
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
    if (!surface.classList.contains('is-expanded')) return;

    if (demoResetTimer) window.clearTimeout(demoResetTimer);
    if (demoUnloadTimer) window.clearTimeout(demoUnloadTimer);
    cancelMorphAnimations();

    morphShell.style.opacity = '1';
    morphShell.style.transform =
      `translate3d(0,0,0) scale(${EXPANDED_SCALE_X},${EXPANDED_SCALE_Y})`;
    morphShell.style.borderRadius = '27px / 7.15px';

    surface.classList.add('is-morphing');

    sourceFadeAnimation = surface.animate(
      [{ opacity: 1 }, { opacity: 0 }],
      {
        duration: 86,
        easing: 'ease-out',
        fill: 'forwards',
      },
    );

    morphAnimation = morphShell.animate(
      [
        {
          transform:
            `translate3d(0,0,0) scale(${EXPANDED_SCALE_X},${EXPANDED_SCALE_Y})`,
          borderRadius: '27px / 7.15px',
          opacity: 1,
        },
        {
          transform: 'translate3d(0,0,0) scale(1,1)',
          borderRadius: '25px',
          opacity: 1,
        },
      ],
      {
        duration: MORPH_DURATION,
        easing: MORPH_EASING,
        fill: 'forwards',
      },
    );

    morphSwapTimer = window.setTimeout(() => {
      surface.style.opacity = '0';
      surface.classList.remove('is-editor-ready', 'is-expanded', 'is-frozen');

      frozenAt = null;
      startedAt = performance.now();
      if (!timerRaf) timerRaf = window.requestAnimationFrame(renderTimer);
      smoothedPeak = .04;
      peaks.fill(.04);
      drawWave();

      editorReady = false;
      expandRequested = false;
      editorLoadStarted = false;
    }, 94);

    morphRevealTimer = window.setTimeout(() => {
      destinationFadeAnimation = surface.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        {
          duration: 110,
          easing: 'ease-out',
          fill: 'forwards',
        },
      );
    }, MORPH_DURATION - 100);

    morphAnimation.finished
      .catch(() => undefined)
      .then(() => {
        if (closed) return;

        morphShell.style.opacity = '0';
        morphShell.style.transform = 'translate3d(0,0,0) scale(1,1)';
        morphShell.style.borderRadius = '25px';

        sourceFadeAnimation?.cancel();
        destinationFadeAnimation?.cancel();
        morphAnimation?.cancel();

        surface.style.opacity = '1';
        surface.classList.remove('is-morphing');

        morphAnimation = null;
        sourceFadeAnimation = null;
        destinationFadeAnimation = null;
        clearMorphTimers();

        demoUnloadTimer = window.setTimeout(() => {
          frame.removeAttribute('src');
        }, 80);
      });
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
    cancelMorphAnimations();

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
    cancelMorphAnimations();
    surface.removeEventListener('click', requestStop);
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
  } else if (environment === 'showcase') {
    surface.classList.add('is-live');
  } else {
    window.requestAnimationFrame(() => {
      surface.classList.add('is-live');
    });
  }
}
