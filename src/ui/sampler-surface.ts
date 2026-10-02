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

      /* Damped spring (response .36s, damping .8) sampled over 600ms.
         One curve drives the shell geometry and the content that rides it,
         so everything settles together with the same ~1.5% overshoot. */
      --morph-spring: linear(0, 0.0212, 0.0753, 0.1504, 0.2375, 0.3294, 0.421, 0.5088, 0.5904, 0.6644, 0.73, 0.787, 0.8358, 0.8768, 0.9106, 0.9381, 0.9599, 0.9769, 0.9898, 0.9993, 1.0061, 1.0106, 1.0133, 1.0148, 1.0152, 1.0148, 1.014, 1.0129, 1.0116, 1.0102, 1.0088, 1.0074, 1.0062, 1.0051, 1.0041, 1.0032, 1.0025, 1.0019, 1.0014, 1.0009, 1.0006, 1.0004, 1.0002, 1);
      --morph-duration: 600ms;

      /* Glass density. Lower lets more of the page through. */
      --glass-top: .82;
      --glass-bottom: .90;
    }

    .stage {
      position: fixed;
      inset: 0;
      pointer-events: none;
    }

    .surface {
      position: absolute;
      top: 16px;
      right: 16px;
      width: 44px;
      height: 44px;
      overflow: hidden;
      pointer-events: none;
      border-radius: 22px;
      /* The island is a true capsule; only the card takes the squircle. */
      corner-shape: round;
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
          rgb(26 26 30 / var(--glass-top)) 0%,
          rgb(13 13 16 / var(--glass-bottom)) 100%
        );
      -webkit-backdrop-filter:
        blur(30px)
        saturate(190%)
        brightness(82%);
      backdrop-filter:
        blur(30px)
        saturate(190%)
        brightness(82%);
      /* Same layer structure as the card so the shadow interpolates
         through the morph instead of snapping. */
      box-shadow:
        0 12px 34px rgba(0,0,0,.29),
        0 0 0 rgba(0,0,0,0),
        0 1px 0 rgba(255,255,255,.26) inset,
        0 0 0 1px rgba(255,255,255,.07) inset,
        0 -1px 0 rgba(0,0,0,.24) inset;
      /* Before it is live the island sits small and transparent toward the
         toolbar corner it emerges from. */
      opacity: 0;
      transform: translate3d(10px,-10px,0) scale(.7);
      backface-visibility: hidden;
      contain: layout paint style;
      transition:
        width var(--morph-duration) var(--morph-spring),
        height var(--morph-duration) var(--morph-spring),
        border-radius var(--morph-duration) var(--morph-spring),
        corner-shape var(--morph-duration) var(--morph-spring),
        box-shadow 420ms cubic-bezier(.2,.8,.2,1),
        opacity 200ms ease-out,
        transform var(--morph-duration) var(--morph-spring);
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
      opacity: 1;
      transform: translate3d(0,0,0);
      pointer-events: auto;
      cursor: pointer;
    }

    .surface.is-live .stop-control { opacity: 1; }

    /* Direct feedback: lift on hover, give on pointer down. */
    .surface.is-live:not(.is-frozen, .is-closing):hover {
      transform: translate3d(0,0,0) scale(1.025);
    }

    .surface.is-live:not(.is-frozen, .is-closing):active {
      transform: translate3d(0,0,0) scale(.955);
    }

    /* Anticipation: the island compresses while the sample is finalized,
       then releases into the expansion on the same spring. */
    .surface.is-frozen {
      cursor: default;
      transform: translate3d(0,0,0) scale(.965);
    }

    .surface.is-expanded {
      width: 352px;
      height: 284px;
      border-radius: 48px;
      corner-shape: squircle;
      pointer-events: auto;
      box-shadow:
        0 26px 64px rgba(0,0,0,.36),
        0 8px 22px rgba(0,0,0,.20),
        0 1px 0 rgba(255,255,255,.26) inset,
        0 0 0 1px rgba(255,255,255,.07) inset,
        0 -1px 0 rgba(0,0,0,.28) inset;
      transform: translate3d(0,0,0);
    }

    /* Leaves the way it arrived: back toward the toolbar corner. */
    .surface.is-closing {
      opacity: 0;
      transform: translate3d(8px,-8px,0) scale(.86);
      pointer-events: none;
      transition:
        opacity 150ms ease-in,
        transform 190ms cubic-bezier(.4,0,1,1);
    }

    /* The island content keeps its own fixed box pinned to the anchor corner,
       so the growing shell never reflows it. It sits above the editor so its
       elements can travel across it.

       13 + 24 + 12 + 90 + 12 + 29 + 18 = 198. The stop control is concentric
       with the capsule end (13px all round); the wave is exactly 23 bars. */
    .recorder {
      position: absolute;
      z-index: 4;
      top: 0;
      right: 0;
      width: 198px;
      height: 50px;
      box-sizing: border-box;
      display: grid;
      grid-template-columns: 24px 90px 1fr;
      align-items: center;
      gap: 12px;
      padding: 0 18px 0 13px;
      opacity: 0;
      transition: opacity 180ms ease 110ms;
    }

    .surface.is-live .recorder { opacity: 1; }
    .surface.is-expanded .recorder { pointer-events: none; }

    /* Continuity: island elements do not dissolve in place, they travel to
       what they become in the editor, on the shell's own spring.
       Targets are the editor's layout, measured from the anchor corner:
       play control 72px, centre 60px from the right / 224px from the top;
       waveform 304px wide, centre 176px / 114px. Compositor-only. */
    .stop-control,
    .wave-wrap,
    .timer {
      transition:
        transform var(--morph-duration) var(--morph-spring),
        opacity 180ms ease 140ms,
        filter 200ms ease 120ms;
    }

    /* Stop control -> play control. It lands, the real button fades in
       underneath it, and only then does it let go: no dip in the red. */
    .surface.is-expanded .stop-control {
      opacity: 0;
      transform: translate3d(113px,199px,0) scale(3);
      transition:
        transform var(--morph-duration) var(--morph-spring),
        opacity 180ms ease-out 300ms;
    }

    /* The way back starts the same way in reverse: as the editor lets go,
       the control reappears over the play button it became, then flies home
       while its triangle closes back into the stop square. */
    .surface.is-expanded:not(.is-editor-ready) .stop-control {
      opacity: 1;
      transition:
        transform var(--morph-duration) var(--morph-spring),
        opacity 70ms ease-out;
    }

    /* The glyph makes the trip too: the stop square opens into the play
       triangle in flight, so the control lands already wearing the icon of
       the button it hands over to. */
    .surface.is-expanded .stop-glyph { stroke-width: 2; }

    .surface.is-expanded .stop-glyph__left {
      d: path("M8.5 5.5 L14 8.75 L14 15.25 L8.5 18.5 Z");
    }

    .surface.is-expanded .stop-glyph__right {
      d: path("M14 8.75 L19.5 12 L19.5 12 L14 15.25 Z");
    }

    /* Mini wave -> waveform. */
    .surface.is-expanded .wave-wrap {
      opacity: 0;
      filter: blur(1.5px);
      transform: translate3d(-72px,89px,0) scale(3.378);
      transition:
        transform var(--morph-duration) var(--morph-spring),
        opacity 120ms ease-out,
        filter 120ms ease-out;
    }

    /* The timer has no counterpart in the same place: it softens away. */
    .surface.is-expanded .timer {
      opacity: 0;
      filter: blur(5px);
      transform: translate3d(0,10px,0) scale(1.25);
      transition:
        transform var(--morph-duration) var(--morph-spring),
        opacity 110ms ease-out,
        filter 140ms ease-out;
    }

    .stop-control {
      width: 24px;
      height: 24px;
      display: block;
      position: relative;
      padding: 0;
      border: 0;
      border-radius: 999px;
      background: #ff453a;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      transform: translate3d(0,0,0);
    }

    /* Same 24 grid and the same two quadrilaterals as the editor's play
       glyph, at the same size relative to its button (28 / 72), so the two
       coincide exactly when this control lands. The square is two halves
       with a wide round-joined stroke; the stroke thins as they open. */
    .stop-glyph {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 9.3333px;
      height: 9.3333px;
      margin: -4.6667px 0 0 -4.6667px;
      overflow: visible;
      fill: #fff;
      stroke: #fff;
      stroke-width: 8;
      stroke-linejoin: round;
      pointer-events: none;
      transition: stroke-width var(--morph-duration) var(--morph-spring);
    }

    .stop-glyph path {
      transition: d var(--morph-duration) var(--morph-spring);
    }

    .stop-glyph__left { d: path("M6 6 L12 6 L12 18 L6 18 Z"); }
    .stop-glyph__right { d: path("M12 6 L18 6 L18 18 L12 18 Z"); }

    /* Live signal: a soft ring breathes out of the stop control while
       audio is being captured. Transform/opacity only. */
    .stop-control::after {
      content: '';
      position: absolute;
      inset: 0;
      z-index: -1;
      border-radius: inherit;
      background: #ff453a;
      opacity: 0;
      pointer-events: none;
    }

    .surface.is-live:not(.is-frozen) .stop-control::after {
      animation: live-breathe 2000ms cubic-bezier(.2,.6,.3,1) 400ms infinite;
    }

    .stop-control:hover { background: #ff5a50; }

    /* Finalizing reads as "working", not "disabled". */
    .surface.is-frozen .stop-control { cursor: default; }

    .surface.is-frozen:not(.is-expanded) .stop-glyph {
      animation: stop-wait 520ms ease-in-out infinite alternate;
    }

    @keyframes live-breathe {
      0% { opacity: .42; transform: scale(1); }
      70%, 100% { opacity: 0; transform: scale(1.7); }
    }

    @keyframes stop-wait {
      from { opacity: 1; transform: scale(1); }
      to { opacity: .45; transform: scale(.82); }
    }

    .surface:not(.is-live) .stop-control { opacity: 0; }

    .wave-wrap {
      position: relative;
      width: 90px;
      height: 28px;
      transform: translate3d(0,0,0);
    }

    canvas {
      width: 90px;
      height: 28px;
      display: block;
    }

    .timer {
      color: rgba(255,255,255,.94);
      font-family:
        -apple-system,
        BlinkMacSystemFont,
        "SF Pro Text",
        "Segoe UI",
        system-ui,
        sans-serif;
      font-size: 13px;
      font-weight: 600;
      line-height: 1;
      letter-spacing: -.01em;
      font-variant-numeric: tabular-nums;
      -webkit-font-smoothing: antialiased;
      /* Figures sit ~.4px below the optical centre at line-height 1. */
      position: relative;
      top: -.5px;
      transform: translate3d(0,0,0);
      text-align: right;
      white-space: nowrap;
    }

    /* Pinned to the same anchor corner as the shell and scaled from
       198 / 352 on the same spring: the editor is always exactly as wide as
       the shell, so the moving edge never cuts through its content. */
    iframe {
      position: absolute;
      z-index: 3;
      top: 0;
      right: 0;
      display: block;
      width: 352px;
      height: 284px;
      border: 0;
      background: transparent;
      color-scheme: dark;
      opacity: 0;
      pointer-events: none;
      transform-origin: 100% 0%;
      transform: translate3d(0,0,0) scale(.5625);
      transition:
        opacity 110ms ease-in,
        transform var(--morph-duration) var(--morph-spring) 90ms;
    }

    .surface.is-editor-ready iframe {
      opacity: 1;
      pointer-events: auto;
      transform: translate3d(0,0,0) scale(1);
      transition:
        opacity 240ms ease-out 70ms,
        transform var(--morph-duration) var(--morph-spring);
    }

    @media (prefers-reduced-motion: reduce) {
      .surface,
      .recorder,
      .stop-control,
      .stop-glyph,
      .stop-glyph path,
      .wave-wrap,
      .timer,
      iframe {
        transition-duration: 1ms !important;
        transition-delay: 0ms !important;
      }

      .stop-glyph,
      .stop-control::after {
        animation: none !important;
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

  const svgNamespace = 'http://www.w3.org/2000/svg';
  const stopGlyph = document.createElementNS(svgNamespace, 'svg');
  stopGlyph.setAttribute('class', 'stop-glyph');
  stopGlyph.setAttribute('viewBox', '0 0 24 24');
  stopGlyph.setAttribute('aria-hidden', 'true');

  for (const half of ['left', 'right']) {
    const path = document.createElementNS(svgNamespace, 'path');
    path.setAttribute('class', `stop-glyph__${half}`);
    stopGlyph.append(path);
  }

  stopControl.append(stopGlyph);

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

  // Bars never move sideways. Level history advances on a fixed clock and
  // each bar eases toward its slot's value, so the wave reads as continuous
  // motion at the display's refresh rate instead of stepping per message.
  const BAR_PITCH = 4;
  const BAR_WIDTH = 2;
  const STEP_MS = 55;
  const EASE_MS = 70;
  const FLOOR = .03;
  const targets = Array.from({ length: 48 }, () => FLOOR);
  const shown = Array.from({ length: 48 }, () => FLOOR);
  let pendingEnergy = 0;
  let smoothedPeak = FLOOR;
  let lastStepAt = performance.now();
  let lastFrameAt = lastStepAt;
  let startedAt = lastStepAt;
  let frozenAt: number | null = null;
  let loopRaf = 0;
  let timerText = timer.textContent;
  let canvasSize: {
    width: number;
    height: number;
    dpr: number;
    count: number;
  } | null = null;
  let closed = false;
  let demoMeterTimer = 0;
  let demoResetTimer = 0;
  let demoUnloadTimer = 0;
  let editorReady = false;
  let expandRequested = false;
  let editorLoadStarted = false;
  // The editor is loaded in standby while audio is still being captured, so
  // stopping only has to hand it the sample.
  let standbyReady = false;
  let loadRequested = false;
  let preloadTimer = 0;
  // Every state in which the island waits on someone else (the background,
  // the editor frame) has a deadline. A lost message or a frame the page
  // refuses to load must not leave a frozen island on the page: it closes,
  // and the sample stays available from the toolbar.
  const WATCHDOG_MS = 12_000;
  let watchdog = 0;
  const standbySrc = `${src}${src.includes('?') ? '&' : '?'}standby=1`;

  const disarmWatchdog = () => {
    if (watchdog) window.clearTimeout(watchdog);
    watchdog = 0;
  };

  const armWatchdog = (stillWaiting: () => boolean) => {
    disarmWatchdog();
    watchdog = window.setTimeout(() => {
      watchdog = 0;
      if (!closed && stillWaiting()) close();
    }, WATCHDOG_MS);
  };

  const waitingToExpand = () => !surface.classList.contains('is-expanded');

  const resizeCanvas = () => {
    // Measure once per layout instead of forcing a synchronous layout on
    // the host page every frame; the timer invalidates this when it widens.
    if (canvasSize) return canvasSize;

    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const cssWidth = canvas.offsetWidth;
    const cssHeight = canvas.offsetHeight;
    const width = Math.max(1, Math.round(cssWidth * dpr));
    const height = Math.max(1, Math.round(cssHeight * dpr));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const count = Math.max(
      1,
      Math.min(shown.length, Math.floor((cssWidth - BAR_WIDTH) / BAR_PITCH) + 1),
    );
    const size = { width, height, dpr, count };
    if (cssWidth > 0 && cssHeight > 0) canvasSize = size;
    return size;
  };

  const drawWave = () => {
    if (!context) return;

    const { width, height, dpr, count } = resizeCanvas();
    context.clearRect(0, 0, width, height);

    const lineWidth = BAR_WIDTH * dpr;
    const pitch = BAR_PITCH * dpr;
    const x0 = (width - (count - 1) * pitch) / 2;
    const first = shown.length - count;

    context.lineWidth = lineWidth;
    context.lineCap = 'round';
    context.strokeStyle = 'rgba(255,255,255,.94)';

    for (let index = 0; index < count; index += 1) {
      const value = shown[first + index] ?? FLOOR;
      const normalized = Math.pow(Math.max(FLOOR, value), .5);
      // Round caps add half a line width at each end; a silent bar is a dot.
      const body = Math.max(0, normalized * height * .9 - lineWidth);
      const x = x0 + index * pitch;
      const y1 = (height - body) / 2;
      // Edge fade, drawn here rather than with a CSS mask: long on the old
      // side, short on the new side, so the wave dissolves into the glass.
      const edge = Math.min(index / 5, (count - 1 - index) / 2.5, 1);

      context.globalAlpha = Math.max(.1, edge);
      context.beginPath();
      context.moveTo(x, y1);
      context.lineTo(x, y1 + body + .01);
      context.stroke();
    }

    context.globalAlpha = 1;
  };

  const renderTimer = (now: number) => {
    const elapsedMs = Math.max(0, (frozenAt ?? now) - startedAt);
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const text = `${minutes}:${String(seconds).padStart(2, '0')}`;

    // Touch the DOM once per second, not once per frame.
    if (text === timerText) return;
    if (text.length !== timerText.length) canvasSize = null;
    timerText = text;
    timer.textContent = text;
  };

  const tick = () => {
    loopRaf = 0;
    if (closed) return;

    const now = performance.now();
    const dt = Math.min(64, now - lastFrameAt);
    lastFrameAt = now;

    renderTimer(now);

    if (frozenAt === null) {
      // After a pause (hidden tab) resume from now instead of replaying.
      if (now - lastStepAt > 400) lastStepAt = now - STEP_MS;

      while (now - lastStepAt >= STEP_MS) {
        lastStepAt += STEP_MS;
        smoothedPeak = smoothedPeak * .45 + pendingEnergy * .55;
        pendingEnergy = 0;
        targets.push(Math.max(FLOOR, Math.min(1, smoothedPeak)));
        targets.shift();
      }
    }

    const ease = 1 - Math.exp(-dt / EASE_MS);
    let moving = false;

    for (let index = 0; index < shown.length; index += 1) {
      const delta = (targets[index] ?? FLOOR) - (shown[index] ?? FLOOR);
      if (Math.abs(delta) > .002) {
        shown[index] = (shown[index] ?? FLOOR) + delta * ease;
        moving = true;
      } else {
        shown[index] = targets[index] ?? FLOOR;
      }
    }

    if (moving) drawWave();

    // A frozen, settled island has nothing left to animate: keep the host
    // page's frames free for the morph.
    if (frozenAt !== null && !moving) return;
    loopRaf = window.requestAnimationFrame(tick);
  };

  const startLoop = () => {
    if (loopRaf || closed) return;
    lastFrameAt = performance.now();
    loopRaf = window.requestAnimationFrame(tick);
  };

  const pushMeter = (peak: number, rms: number) => {
    if (frozenAt !== null) return;
    pendingEnergy = Math.max(pendingEnergy, peak * .74, rms * 1.8);
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

      disarmWatchdog();

      // Reveal the already-rendered editor in the exact frame in which
      // geometry starts expanding. This avoids the empty/black shell phase.
      surface.classList.add('is-expanded', 'is-editor-ready');

      // Let the editor start its own entrance on the same beat.
      frame.contentWindow?.postMessage({ type: 'tab-sampler:reveal' }, '*');
    });
  };

  const prepareEditor = () => {
    if (editorLoadStarted || closed) return;
    editorLoadStarted = true;
    standbyReady = false;
    // Always a fresh document, even when the address is unchanged.
    frame.removeAttribute('src');
    frame.src = standbySrc;
  };

  const requestLoad = () => {
    loadRequested = true;
    if (standbyReady) {
      frame.contentWindow?.postMessage({ type: 'tab-sampler:load' }, '*');
    }
  };

  const schedulePreload = (delay: number) => {
    if (preloadTimer) window.clearTimeout(preloadTimer);
    preloadTimer = window.setTimeout(prepareEditor, delay);
  };

  const expand = () => {
    freeze();
    expandRequested = true;
    armWatchdog(waitingToExpand);
    prepareEditor();
    requestLoad();
    revealEditor();
  };

  // Back to an empty recorder: no elapsed time, no level history.
  const clearReadout = () => {
    smoothedPeak = FLOOR;
    pendingEnergy = 0;
    targets.fill(FLOOR);
    shown.fill(FLOOR);
    drawWave();
    timerText = '0:00';
    timer.textContent = timerText;
    canvasSize = null;
  };

  const goLive = () => {
    disarmWatchdog();
    clearReadout();
    frozenAt = null;
    startedAt = performance.now();
    surface.classList.remove('is-frozen');
    startLoop();
  };

  // Card back to island. With `live` the island resumes at once (showcase);
  // without it the island stays in its "working" state until the background
  // confirms that the next capture is running.
  const collapseToIsland = (live: boolean) => {
    if (closed || !surface.classList.contains('is-expanded')) return;

    if (demoResetTimer) window.clearTimeout(demoResetTimer);
    if (demoUnloadTimer) window.clearTimeout(demoUnloadTimer);

    // First fade the editor while it is still fully rendered.
    // Removing iframe.src immediately navigates it to about:blank and can
    // expose a bright frame during the collapse.
    surface.classList.remove('is-editor-ready');

    demoResetTimer = window.setTimeout(() => {
      surface.classList.remove('is-expanded');

      // The editor in the frame has shown its sample and is spent: whatever
      // expands next needs a new one, even if that happens before the swap
      // below gets to run.
      editorReady = false;
      expandRequested = false;
      loadRequested = false;
      editorLoadStarted = false;
      standbyReady = false;

      if (live) {
        goLive();
      } else {
        clearReadout();
        armWatchdog(
          () => frozenAt !== null && !surface.classList.contains('is-expanded'),
        );
      }
    }, 90);

    // Swap the used editor for a fresh standby one only after both the
    // editor fade and the island collapse are done, and only if the island
    // has not already been asked to expand again.
    demoUnloadTimer = window.setTimeout(() => {
      if (expandRequested || editorLoadStarted) return;
      prepareEditor();
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
    armWatchdog(waitingToExpand);

    if (environment === 'showcase') {
      window.setTimeout(expand, 60);
      return;
    }

    // After the extension is reloaded or updated, an island left on the page
    // can no longer reach it: the call throws instead of sending.
    try {
      chrome.runtime
        .sendMessage({ type: 'tab-sampler:stop-request' })
        .catch((error: unknown) => {
          if (/context invalidated/i.test(String(error))) close();
        });
    } catch {
      close();
    }
  };

  const close = () => {
    if (closed) return;
    closed = true;
    disarmWatchdog();
    surface.classList.add('is-closing');
    window.cancelAnimationFrame(loopRaf);
    if (demoMeterTimer) window.clearInterval(demoMeterTimer);
    if (demoResetTimer) window.clearTimeout(demoResetTimer);
    if (demoUnloadTimer) window.clearTimeout(demoUnloadTimer);
    if (preloadTimer) window.clearTimeout(preloadTimer);

    window.setTimeout(() => cleanup(), 200);
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

    if (message?.type === 'tab-sampler:island-restart') {
      goLive();
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

    if (event.data?.type === 'tab-sampler:standby') {
      standbyReady = true;
      if (loadRequested) requestLoad();
      return;
    }

    if (event.data?.type === 'tab-sampler:new-capture') {
      collapseToIsland(environment === 'showcase');
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
      collapseToIsland(true);
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
    window.cancelAnimationFrame(loopRaf);
    if (demoMeterTimer) window.clearInterval(demoMeterTimer);
    if (preloadTimer) window.clearTimeout(preloadTimer);
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
  startLoop();

  if (mode === 'editor') {
    surface.classList.add('is-live', 'is-frozen');
    frozenAt = performance.now();
    expandRequested = true;
    armWatchdog(waitingToExpand);
    prepareEditor();
    requestLoad();
  } else {
    window.requestAnimationFrame(() => {
      surface.classList.add('is-live');
    });
    // After the island has arrived, so the load never competes with it.
    schedulePreload(700);
  }
}
