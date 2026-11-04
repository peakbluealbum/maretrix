/**
 * Timeline measurement sampler (1.1.1).
 *
 * WebKit on iOS reports a freshly mounted virtual list as a one-item list: virtua measures the
 * scroll viewport before the flex chain has resolved to a pixel height, renders a single row and
 * does not re-measure until something touches the page. Desktop Chromium cannot reproduce it, so
 * every number has to come off the device.
 *
 * One JSONL object per sample. On by default on iOS WebKit (WKWebView and the installed PWA are
 * both WebKit); `?tldebug=0` turns it off, `?tldebug=1` forces it on anywhere. Samples live in a
 * bounded in-memory ring and are flushed to localStorage only at settle points, so scrolling is
 * not paying for `JSON.stringify`. Read the file back from Safari -> Develop -> the iPhone ->
 * Maretrix:
 *
 *   copy(window.__maretrixTL.dump())
 *
 * Field names deliberately mirror virtua's own vocabulary (`scrollSize`, `viewportSize`) next to
 * the DOM's (`wrapH`, `rendered`): the whole diagnosis is "does virtua's measurement agree with
 * the box the browser gave it".
 */

import type { VListHandle } from 'virtua';

const MAX_RECORDS = 600;
const STORAGE_KEY = 'maretrix:timeline:jsonl';
const SCROLL_RECORD_INTERVAL_MS = 120;
const SETTLE_TRACE_DELAY_MS = 200;

export interface TimelineDebugContext {
  roomId: string;
  spacer: number;
  atBottom: boolean;
  isReady: boolean;
}

function resolveEnabled(): boolean {
  if (typeof window === 'undefined') return false;

  const flag = new URLSearchParams(window.location.search).get('tldebug');
  if (flag === '0') return false;
  if (flag === '1') return true;

  const { userAgent, platform, maxTouchPoints } = window.navigator;
  const isIOS =
    /iPad|iPhone|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
  // Any of these is iOS with a non-WebKit engine stacked on top; the measurement bug is WebKit's.
  const isOtherEngine = /CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent);

  return isIOS && !isOtherEngine;
}

const ENABLED = resolveEnabled();

let roomTimelineMounts = 0;
let vlistMounts = 0;
let lastScrollRecord = 0;
let settleTimer: ReturnType<typeof setTimeout> | undefined;
let tracing = false;

const buffer: string[] = [];

function flush() {
  if (!ENABLED) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, buffer.join('\n'));
  } catch {
    // Quota or private mode: the in-memory buffer and the console mirror are still usable.
  }
}

function push(record: Record<string, unknown>) {
  if (!ENABLED) return;
  const line = JSON.stringify(record);
  buffer.push(line);
  if (buffer.length > MAX_RECORDS) buffer.splice(0, buffer.length - MAX_RECORDS);
  // eslint-disable-next-line no-console
  console.info('[tl]', line);
}

function snapshot(v: VListHandle | null, wrap: HTMLElement | null, ctx: TimelineDebugContext) {
  const vv = window.visualViewport;
  return {
    t: Math.round(performance.now()),
    room: ctx.roomId,
    rtMounts: roomTimelineMounts,
    vlistMounts,
    scrollTop: v ? Math.round(v.scrollOffset) : -1,
    scrollSize: v ? Math.round(v.scrollSize) : -1,
    viewportSize: v ? Math.round(v.viewportSize) : -1,
    wrapH: wrap ? Math.round(wrap.getBoundingClientRect().height) : -1,
    rendered: wrap ? wrap.querySelectorAll('[data-message-id]').length : -1,
    spacer: Math.round(ctx.spacer),
    atBottom: ctx.atBottom,
    ready: ctx.isReady,
    innerH: window.innerHeight,
    vvH: vv ? Math.round(vv.height) : -1,
    vvTop: vv ? Math.round(vv.offsetTop) : -1,
  };
}

export function mountTimeline(roomId: string) {
  roomTimelineMounts += 1;
  push({ ev: 'mount', who: 'RoomTimeline', room: roomId, rtMounts: roomTimelineMounts, vlistMounts });
}

export function mountVList(roomId: string) {
  vlistMounts += 1;
  push({ ev: 'mount', who: 'VList', room: roomId, rtMounts: roomTimelineMounts, vlistMounts });
}

/**
 * A short frame-by-frame window. Ten frames is ~170 ms at 60 Hz, enough to see the viewport
 * measurement land, the first rows render and the spacer settle — and short enough that the
 * `querySelectorAll` per frame does not itself become the jitter.
 */
export function trace(
  frames: number,
  label: string,
  v: VListHandle | null,
  wrap: HTMLElement | null,
  ctx: TimelineDebugContext
) {
  if (!ENABLED || tracing) return;
  tracing = true;

  let frame = 0;
  let previous = performance.now();

  const step = (now: number) => {
    push({ ev: 'frame', label, n: frame, dt: Math.round(now - previous), ...snapshot(v, wrap, ctx) });
    previous = now;
    frame += 1;
    if (frame < frames) {
      window.requestAnimationFrame(step);
      return;
    }
    tracing = false;
    flush();
  };

  window.requestAnimationFrame(step);
}

/** Called on every virtual-list scroll event; throttled, and arms a settle trace. */
export function scroll(
  v: VListHandle | null,
  wrap: HTMLElement | null,
  ctx: TimelineDebugContext
) {
  if (!ENABLED) return;

  const now = performance.now();
  if (now - lastScrollRecord > SCROLL_RECORD_INTERVAL_MS) {
    lastScrollRecord = now;
    push({ ev: 'scroll', ...snapshot(v, wrap, ctx) });
  }

  if (settleTimer !== undefined) clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    settleTimer = undefined;
    trace(10, 'settle', v, wrap, ctx);
  }, SETTLE_TRACE_DELAY_MS);
}

/** virtua's own scroll-end signal, recorded as the authoritative end of a gesture. */
export function settle(v: VListHandle | null, wrap: HTMLElement | null, ctx: TimelineDebugContext) {
  if (!ENABLED) return;
  push({ ev: 'scrollend', ...snapshot(v, wrap, ctx) });
  flush();
}

export function arrival(
  from: number,
  to: number,
  v: VListHandle | null,
  wrap: HTMLElement | null,
  ctx: TimelineDebugContext
) {
  if (!ENABLED) return;
  push({ ev: 'arrive', from, to, ...snapshot(v, wrap, ctx) });
  flush();
}

export function ready(
  isReady: boolean,
  v: VListHandle | null,
  wrap: HTMLElement | null,
  ctx: TimelineDebugContext
) {
  if (!ENABLED) return;
  push({ ev: 'ready', isReady, ...snapshot(v, wrap, ctx) });
  flush();
}

/** The top spacer is derived from `viewportSize - scrollSize`; every change moves the content. */
export function spacer(
  from: number,
  to: number,
  v: VListHandle | null,
  wrap: HTMLElement | null,
  ctx: TimelineDebugContext
) {
  if (!ENABLED) return;
  push({ ev: 'spacer', from: Math.round(from), to: Math.round(to), ...snapshot(v, wrap, ctx) });
}

export function dump(): string {
  // The buffer is in memory, so a relaunch between the run and the read leaves it empty while
  // localStorage still holds the last flushed session. Prefer the live buffer, fall back to disk.
  if (buffer.length > 0) return buffer.join('\n');
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function clear() {
  buffer.length = 0;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}

export function enabled(): boolean {
  return ENABLED;
}

if (typeof window !== 'undefined') {
  (window as unknown as { __maretrixTL?: unknown }).__maretrixTL = {
    enabled: ENABLED,
    dump,
    clear,
    flush,
  };

  if (ENABLED) {
    const vv = window.visualViewport;
    push({
      ev: 'boot',
      ua: window.navigator.userAgent,
      // An installed PWA has no browser chrome, which is where the viewport settling differs.
      standalone: window.matchMedia('(display-mode: standalone)').matches,
      innerH: window.innerHeight,
      innerW: window.innerWidth,
      vvH: vv ? Math.round(vv.height) : -1,
      vvTop: vv ? Math.round(vv.offsetTop) : -1,
      dpr: window.devicePixelRatio,
    });

    const flushOnHide = () => flush();
    window.addEventListener('pagehide', flushOnHide);
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushOnHide();
    });
  }
}
