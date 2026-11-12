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

const MAX_RECORDS = 400;
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
let lastFlushAt = 0;
let settleTimer: ReturnType<typeof setTimeout> | undefined;
let tracing = false;

const buffer: string[] = [];

function flush(force = false) {
  if (!ENABLED) return;
  // Writing the whole ring is synchronous I/O: once per arrival is enough to stall the timeline for
  // a second on a phone. Throttled; forced only when the page is going away.
  const now = performance.now();
  if (!force && now - lastFlushAt < 2000) return;
  lastFlushAt = now;
  try {
    window.localStorage.setItem(STORAGE_KEY, buffer.join('\n'));
  } catch {
    // Quota or private mode: the in-memory buffer is still readable for this session.
  }
}

function push(record: Record<string, unknown>) {
  if (!ENABLED) return;
  const line = JSON.stringify(record);
  buffer.push(line);
  if (buffer.length > MAX_RECORDS) buffer.splice(0, buffer.length - MAX_RECORDS);
  // No console mirror: with Web Inspector attached, one console message per sample serialises the
  // object and IPC-hops it, which shows up as multi-second stalls in the app itself.
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
    // The wrapper collapsing to 0 px while the list is laid out is what the device shows on the
    // second mount of a switch; its parent tells us whether the collapse is local or above us.
    parentH:
      wrap && wrap.parentElement
        ? Math.round(wrap.parentElement.getBoundingClientRect().height)
        : -1,
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

/** Records a latch/scroll-policy event with the same geometry snapshot as everything else. */
export function note(
  event: string,
  extra: Record<string, unknown>,
  v: VListHandle | null,
  wrap: HTMLElement | null,
  ctx: TimelineDebugContext
) {
  if (!ENABLED) return;
  push({ ev: event, ...extra, ...snapshot(v, wrap, ctx) });
  flush();
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

interface TimelineRecord {
  ev: string;
  label?: string;
  // plain-window / plain-scroll fields (diagnostic builds; see RoomTimeline's compensation effect).
  startBefore?: number;
  endBefore?: number;
  startAfter?: number;
  endAfter?: number;
  anchorTopBefore?: number;
  anchorTopAfterCommit?: number;
  anchorTopFinal?: number;
  scrollTopBefore?: number;
  scrollTopAfter?: number;
  scrollHeight?: number;
  firstIdBefore?: string;
  firstIdAfter?: string;
  room?: string;
  vlistMounts?: number;
  wrapH?: number;
  parentH?: number;
  viewportSize?: number;
  scrollSize?: number;
  scrollTop?: number;
  rendered?: number;
  spacer?: number;
  atBottom?: boolean;
  reason?: string;
  gap?: number;
  dur?: number;
  t?: number;
}

/**
 * The whole diagnosis in one string: per-mount geometry bracketed around the switch, the tail of
 * the scroll trajectory, and a live probe of the DOM against virtua's numbers. Small enough to read
 * off a phone screen, which the raw JSONL is not.
 */
export function report(): string {
  const records = dump()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as TimelineRecord;
      } catch {
        return undefined;
      }
    })
    .filter((record): record is TimelineRecord => record !== undefined);

  const byEvent: Record<string, number> = {};
  records.forEach((record) => {
    byEvent[record.ev] = (byEvent[record.ev] ?? 0) + 1;
  });

  const mountGroups = new Map<number, TimelineRecord[]>();
  records.forEach((record) => {
    if (record.ev !== 'frame' || record.label !== 'mount') return;
    const key = record.vlistMounts ?? -1;
    const group = mountGroups.get(key) ?? [];
    group.push(record);
    mountGroups.set(key, group);
  });

  const mounts = [...mountGroups.entries()].flatMap(([id, frames]) => {
    const first = frames[0];
    const last = frames[frames.length - 1];
    if (!first || !last) return [];
    return [
      {
        v: id,
        wrap: first.wrapH,
        par: first.parentH,
        vp: first.viewportSize,
        ss: first.scrollSize,
        rend: [first.rendered, last.rendered],
        st: [Math.round(first.scrollTop ?? 0), Math.round(last.scrollTop ?? 0)],
      },
    ];
  });

  const trajectory = records
    .filter((record) => record.ev === 'scroll' || record.ev === 'scrollend')
    .slice(-10)
    .map((record) => [
      record.ev === 'scroll' ? 's' : 'e',
      Math.round(record.scrollTop ?? 0),
      Math.round(record.scrollSize ?? 0),
      record.rendered,
      record.atBottom ? 1 : 0,
    ]);

  const scrollEl = document.querySelector<HTMLElement>('#timeline-scroller');
  const heights = [...document.querySelectorAll('[data-message-id]')]
    .map((element) => Math.round(element.getBoundingClientRect().height))
    .sort((a, b) => a - b);

  const latchEnds: Record<string, number> = {};
  records
    .filter((record) => record.ev === 'latch-end')
    .forEach((record) => {
      const reason = record.reason ?? 'settled';
      latchEnds[reason] = (latchEnds[reason] ?? 0) + 1;
    });

  return JSON.stringify({
    n: records.length,
    byEvent,
    latchEnds,
    // The window commits carry the fields that name a scroll jump; include the tail of them so a
    // capture never needs a second command.
    plainWindows: records.filter((record) => record.ev === 'plain-window').slice(-5),
    stalls: records.filter((record) => record.ev === 'stall').slice(-8).map((record) => record.gap),
    longtasks: records.filter((record) => record.ev === 'longtask').slice(-8).map((record) => record.dur),
    mounts,
    trajectory,
    now: {
      rows: heights.length,
      h: heights.length ? [heights[0], heights[Math.floor(heights.length / 2)], heights[heights.length - 1]] : [],
      domClient: scrollEl ? scrollEl.clientHeight : null,
      domScroll: scrollEl ? scrollEl.scrollHeight : null,
      domSt: scrollEl ? Math.round(scrollEl.scrollTop) : null,
    },
  });
}

if (typeof window !== 'undefined') {
  (window as unknown as { __maretrixTL?: unknown }).__maretrixTL = {
    enabled: ENABLED,
    dump,
    clear,
    flush,
    report,
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

    // Main-thread stalls. The recording shows the timeline rendering nothing at all for seconds
    // after a switch; if the thread is blocked while the room is rebuilt, no frame-based sampler
    // can see it, so a 50 ms heartbeat records every gap it misses. WebKit also reports long tasks
    // on recent versions; both are recorded because neither is guaranteed.
    let lastTick = performance.now();
    window.setInterval(() => {
      const now = performance.now();
      const gap = Math.round(now - lastTick);
      lastTick = now;
      if (gap > 80 && gap < 10000) push({ ev: 'stall', gap });
    }, 50);

    if (typeof PerformanceObserver !== 'undefined') {
      try {
        const observer = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            push({ ev: 'longtask', start: Math.round(entry.startTime), dur: Math.round(entry.duration) });
          });
        });
        observer.observe({ entryTypes: ['longtask'] });
      } catch {
        // Not supported on this engine; the heartbeat still catches the same stalls.
      }
    }

    const flushOnHide = () => flush(true);
    window.addEventListener('pagehide', flushOnHide);
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushOnHide();
    });
  }
}
