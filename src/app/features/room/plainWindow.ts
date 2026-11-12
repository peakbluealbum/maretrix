/**
 * Window maths for the WebKit plain list (1.1.1 fallback #4).
 *
 * On iOS WebKit virtua's `scrollSize` never leaves the viewport height (measured on the device:
 * 635 px in a 33,370 px scroller), so every index it renders and scrolls to is derived from a size
 * that is wrong by ~50×. The plain list removes the measurement dependency entirely: rows are real
 * DOM, the window is a plain index range, and every scroll target comes from `scrollHeight`.
 *
 * The window is deliberately not `slice(-N)`. A jump, permalink or notification tap can aim at an
 * event older than the bound, and re-deriving "last N" on the next render would throw it away — so
 * the window is either *live* (pinned to the newest row) or *anchored* (centred on the target, and
 * grown in both directions from there).
 */

/** Rows rendered when the list is live, or around an anchor. */
export const PLAIN_LIVE_TAIL = 150;

/** Hard cap on rendered rows. Growth past this recentres instead of extending. */
export const PLAIN_MAX_ROWS = 400;

/** How many rows a pagination step adds to the window. */
export const PLAIN_GROW_STEP = 100;

export type PlainWindow = {
  /** Inclusive index into the processed-row array. */
  start: number;
  /** Inclusive; `-1` for an empty window, so `end - start + 1` is never negative. */
  end: number;
};

export const EMPTY_WINDOW: PlainWindow = { start: 0, end: -1 };

export const windowLength = (w: PlainWindow): number => Math.max(0, w.end - w.start + 1);

export const containsIndex = (w: PlainWindow, index: number): boolean =>
  index >= w.start && index <= w.end;

/** Newest `PLAIN_LIVE_TAIL` rows, i.e. the normal bottom-of-room view. */
export function liveWindow(total: number): PlainWindow {
  if (total <= 0) return EMPTY_WINDOW;
  const start = Math.max(0, total - PLAIN_LIVE_TAIL);
  return { start, end: total - 1 };
}

/**
 * A window centred on `anchorIndex`. Clamped at both ends of the list, so an anchor near the top
 * keeps a full window rather than a half-empty one.
 */
export function anchorWindow(total: number, anchorIndex: number): PlainWindow {
  if (total <= 0) return EMPTY_WINDOW;
  const size = Math.min(PLAIN_LIVE_TAIL, total);
  const half = Math.floor(size / 2);
  const start = Math.min(Math.max(0, anchorIndex - half), Math.max(0, total - size));
  return { start, end: start + size - 1 };
}

export type GrowDirection = 'back' | 'forward';

/**
 * Extend the window one pagination step in `direction`.
 *
 * Growth always slides towards the direction of travel: the far edge is trimmed once the window
 * reaches `PLAIN_MAX_ROWS`. That is what lets a jump to an old event keep scrolling *down* past the
 * anchored window to the newest message — recentring on the anchor would keep dragging the window
 * back and the list would never make progress towards the live edge.
 */
export function growWindow(
  w: PlainWindow,
  total: number,
  direction: GrowDirection
): PlainWindow {
  if (total <= 0) return EMPTY_WINDOW;

  if (direction === 'back') {
    const start = Math.max(0, w.start - PLAIN_GROW_STEP);
    return { start, end: Math.min(Math.max(start, w.end), start + PLAIN_MAX_ROWS - 1) };
  }

  const end = Math.min(total - 1, w.end + PLAIN_GROW_STEP);
  return { start: Math.max(0, Math.max(w.start, end - PLAIN_MAX_ROWS + 1)), end };
}

/**
 * Bring a window back in line with the row count after events arrive.
 *
 * Live: the newest row stays visible (that is what "live" means), so the window follows the tail.
 * Anchored: the window is kept as-is, clamped, so a jump does not slide to the live edge when the
 * first forward page lands — the failure @review called out.
 */
export function reconcileWindow(
  w: PlainWindow,
  total: number,
  anchored: boolean,
  anchorIndex?: number
): PlainWindow {
  if (total <= 0) return EMPTY_WINDOW;
  if (!anchored) return liveWindow(total);

  const start = Math.min(Math.max(0, w.start), Math.max(0, total - 1));
  const end = Math.min(Math.max(start, w.end), total - 1);
  const clamped = { start, end };

  if (windowLength(clamped) > PLAIN_MAX_ROWS && anchorIndex !== undefined) {
    return anchorWindow(total, anchorIndex);
  }
  return clamped;
}

/**
 * Grow the window for rows prepended at the front while the reader is holding.
 *
 * Backward pagination inserts older rows at index 0, so every existing row shifts up by
 * `prependCount`. `reconcileWindow` deliberately leaves `start` where it is — which means the rows
 * the reader was looking at would fall out of the window — so `end` has to grow by the same count to
 * keep them rendered. The paired scroll correction is `compensateForPrepend`.
 */
export function extendForPrepend(
  w: PlainWindow,
  total: number,
  prependCount: number
): PlainWindow {
  if (prependCount <= 0 || total <= 0) return w;
  const end = Math.min(total - 1, w.end + prependCount);
  return { start: Math.max(0, Math.min(w.start, end - PLAIN_MAX_ROWS + 1)), end };
}

/**
 * Keep the viewport on the same rows after the content height changed above it.
 *
 * `heightBefore`/`heightAfter` come from the scroller's own `scrollHeight`, so the correction is
 * measured rather than derived from row estimates — the whole point of the plain path.
 */
export function compensateForPrepend(
  scrollTop: number,
  heightBefore: number,
  heightAfter: number
): number {
  return Math.max(0, scrollTop + (heightAfter - heightBefore));
}

/**
 * Whether a backward page should be fetched.
 *
 * Only when the window has actually reached the oldest loaded row: while `start > 0` there are
 * rows in memory above the viewport, and fetching anyway puts a page above the reader that the
 * height compensation can only partly account for — a ~50-row push per page, with `scrollTop`
 * still inside the trigger zone so scrolling *down* fetches the next one.
 */
export function shouldRequestBackfill(
  w: PlainWindow,
  canPaginateBack: boolean,
  paginationIdle: boolean
): boolean {
  return w.start === 0 && canPaginateBack && paginationIdle;
}

/**
 * Keep the reader on the same row by that row's position in the **scrolled content**.
 *
 * Content-space, not viewport-space: a viewport measurement changes when the reader simply scrolls,
 * and correcting for it would fight the gesture. Unlike the `scrollHeight` delta this is exact when
 * rows are added above *and* removed below in the same commit (a window at its cap slides forward as
 * it grows), because the height is unchanged while the content under the viewport is not.
 */
export function compensateForAnchor(
  scrollTop: number,
  previousTop: number,
  currentTop: number
): number {
  return Math.max(0, scrollTop + (currentTop - previousTop));
}

export type WindowTransition = {
  current: PlainWindow;
  total: number;
  /** Index of the jump target in the current data, or -1. */
  anchorIndex: number;
  /** `start` of the window that was on screen in the previous commit. */
  renderedStart: number;
  /** Rows inserted in front of the previous first row, or -1. */
  prependCount: number;
  hold: boolean;
};

/**
 * The window for **this** render, given the data as it is right now.
 *
 * Derived during render on purpose. When a page lands, `processedEvents` grows in front of the
 * window that is still on screen; if the window is only extended in a layout effect, the render
 * that carries the new page slices it with the old indices, the reader's row leaves the DOM for a
 * frame, and the scroll compensation measures nothing — the reader ends up on the new page. One
 * render late is one page late.
 */
export function nextPlainWindow(t: WindowTransition): PlainWindow {
  const { current, total, anchorIndex, renderedStart, prependCount, hold } = t;
  if (total <= 0) return EMPTY_WINDOW;

  const windowMoved = current.start !== renderedStart;
  if (prependCount > 0 && !windowMoved && (hold || anchorIndex >= 0)) {
    return extendForPrepend(current, total, prependCount);
  }
  if (anchorIndex >= 0) {
    return containsIndex(current, anchorIndex)
      ? reconcileWindow(current, total, true, anchorIndex)
      : anchorWindow(total, anchorIndex);
  }
  return reconcileWindow(current, total, hold);
}
