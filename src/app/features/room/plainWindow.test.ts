import { describe, expect, it } from 'vitest';
import {
  anchorWindow,
  compensateForPrepend,
  extendForPrepend,
  containsIndex,
  EMPTY_WINDOW,
  growWindow,
  liveWindow,
  PLAIN_GROW_STEP,
  PLAIN_LIVE_TAIL,
  PLAIN_MAX_ROWS,
  reconcileWindow,
  shouldRequestBackfill,
  windowLength,
} from './plainWindow';

describe('liveWindow', () => {
  it('is empty for an empty room', () => {
    expect(liveWindow(0)).toEqual(EMPTY_WINDOW);
    expect(windowLength(liveWindow(0))).toBe(0);
  });

  it('takes the newest rows and pins end to the last index', () => {
    expect(liveWindow(1000)).toEqual({ start: 1000 - PLAIN_LIVE_TAIL, end: 999 });
  });

  it('does not run past the start of a short room', () => {
    expect(liveWindow(20)).toEqual({ start: 0, end: 19 });
  });
});

describe('anchorWindow', () => {
  it('centres on the anchor', () => {
    const w = anchorWindow(1000, 500);
    expect(containsIndex(w, 500)).toBe(true);
    expect(windowLength(w)).toBe(PLAIN_LIVE_TAIL);
    // Equal room either side, give or take the odd row.
    expect(Math.abs(500 - w.start - (w.end - 500))).toBeLessThanOrEqual(1);
  });

  it('keeps a full window at the top of the list', () => {
    const w = anchorWindow(1000, 0);
    expect(w).toEqual({ start: 0, end: PLAIN_LIVE_TAIL - 1 });
  });

  it('keeps a full window at the bottom of the list', () => {
    const w = anchorWindow(1000, 999);
    expect(w.end).toBe(999);
    expect(windowLength(w)).toBe(PLAIN_LIVE_TAIL);
  });

  it('handles a jump to an event older than the live bound', () => {
    const total = 6000;
    const anchor = 120; // far outside the newest 150 rows
    const w = anchorWindow(total, anchor);
    expect(containsIndex(w, anchor)).toBe(true);
    expect(windowLength(w)).toBe(PLAIN_LIVE_TAIL);
    expect(w.start).toBeLessThanOrEqual(anchor);
  });
});

describe('growWindow', () => {
  it('extends backwards one step at a time', () => {
    const w = anchorWindow(1000, 500);
    const grown = growWindow(w, 1000, 'back');
    expect(grown.start).toBe(Math.max(0, w.start - PLAIN_GROW_STEP));
    expect(grown.end).toBe(w.end);
    expect(containsIndex(grown, 500)).toBe(true);
  });

  it('reaches the newest row from an old anchor, which is what a jump must allow', () => {
    const total = 6000;
    let w = anchorWindow(total, 120);
    for (let i = 0; i < 100 && w.end < total - 1; i += 1) {
      w = growWindow(w, total, 'forward');
    }
    expect(w.end).toBe(total - 1);
    // The anchor is released once the user has scrolled past it — the window slides, it does not
    // snap back to the jump target.
    expect(windowLength(w)).toBeLessThanOrEqual(PLAIN_MAX_ROWS);
  });

  it('never grows past the cap in either direction', () => {
    const total = 6000;
    let forward = anchorWindow(total, 3000);
    const startBefore = forward.start;
    for (let i = 0; i < 60 && forward.end < total - 1; i += 1) {
      forward = growWindow(forward, total, 'forward');
    }
    expect(windowLength(forward)).toBeLessThanOrEqual(PLAIN_MAX_ROWS);
    expect(forward.end).toBe(total - 1);
    // The trailing edge moved with it, which is what keeps the DOM bounded.
    expect(forward.start).toBeGreaterThan(startBefore);

    let back = anchorWindow(total, 3000);
    for (let i = 0; i < 60 && back.start > 0; i += 1) {
      back = growWindow(back, total, 'back');
    }
    expect(windowLength(back)).toBeLessThanOrEqual(PLAIN_MAX_ROWS);
    expect(back.start).toBe(0);
  });
});

describe('prepend while holding', () => {
  it('keeps the visible rows when a backward page prepends at the front', () => {
    // Live in a short room: 30 rows, window {0,29}. A backward page prepends 20 more.
    const held = { start: 0, end: 29 };
    const grown = extendForPrepend(held, 50, 20);
    expect(grown).toEqual({ start: 0, end: 49 });
    // The old row 0 is now index 20 and is still inside the window — that is the whole point.
    expect(containsIndex(grown, 20)).toBe(true);
  });

  it('extends by the prepend count, not by the row\'s absolute index', () => {
    // The window sits thousands of rows into the timeline; a page of 100 is inserted before the
    // reader. `findIndex(prevFirstId)` returns ~2700 there, and using that as a count pushed `end`
    // to the live edge — the reader was thrown days of history per page.
    const held = { start: 2600, end: 2749 };
    const grown = extendForPrepend(held, 2850, 100);
    expect(grown.end).toBe(2849);
    // The reader's row was at 2600; 100 rows inserted in front of it put it at 2700. Asserting 2600
    // would pass even if the reader's row had fallen out of the window.
    expect(containsIndex(grown, 2700)).toBe(true);
    expect(windowLength(grown)).toBeLessThanOrEqual(PLAIN_MAX_ROWS);
  });

  it('slides the start when the extension would pass the cap', () => {
    const held = { start: 100, end: 340 };
    const grown = extendForPrepend(held, 1000, 100);
    expect(windowLength(grown)).toBeLessThanOrEqual(PLAIN_MAX_ROWS);
    expect(grown.end).toBe(440);
  });

  it('is a no-op when nothing was prepended', () => {
    const held = { start: 10, end: 40 };
    expect(extendForPrepend(held, 100, 0)).toEqual(held);
  });

  it('moves the viewport down by exactly the height added above it', () => {
    // 20 rows at 40 px added above: the reader stays on the same message.
    expect(compensateForPrepend(120, 3000, 3800)).toBe(920);
  });

  it('clamps at the top instead of going negative', () => {
    expect(compensateForPrepend(50, 3000, 2800)).toBe(0);
  });
});

describe('reconcileWindow', () => {
  it('does not undo a backward page while the reader is holding', () => {
    // The bug: reconcile with `anchored: false` re-slices the newest 150 rows, so every backward
    // page was thrown away and the reader was pushed forward by a page per pagination.
    const total = 6000;
    const paged = growWindow(liveWindow(total), total, 'back');
    const afterLiveArrival = reconcileWindow(paged, total + 5, true);
    expect(afterLiveArrival.start).toBe(paged.start);
    expect(containsIndex(afterLiveArrival, paged.start)).toBe(true);
  });

  it('goes back to the tail once the reader returns to the bottom', () => {
    const total = 6000;
    const paged = growWindow(liveWindow(total), total, 'back');
    expect(reconcileWindow(paged, total, false)).toEqual(liveWindow(total));
  });

  it('follows the tail while live', () => {
    const w = liveWindow(1000);
    expect(reconcileWindow(w, 1005, false)).toEqual(liveWindow(1005));
  });

  it('does not slide an anchored window to the live edge when a page arrives', () => {
    const total = 6000;
    const w = anchorWindow(total, 120);
    const next = reconcileWindow(w, total + 100, true, 120);
    expect(containsIndex(next, 120)).toBe(true);
    expect(next.start).toBe(w.start);
  });

  it('clamps a window that now runs past the end', () => {
    const w = { start: 900, end: 1100 };
    const next = reconcileWindow(w, 950, true, 900);
    expect(next.end).toBe(949);
  });

  it('is empty for an empty room', () => {
    expect(reconcileWindow(liveWindow(10), 0, false)).toEqual(EMPTY_WINDOW);
  });
});

describe('shouldRequestBackfill', () => {
  it('refuses while the window still has loaded rows above it', () => {
    expect(shouldRequestBackfill({ start: 2600, end: 2749 }, true, true)).toBe(false);
  });

  it('allows at the loaded edge', () => {
    expect(shouldRequestBackfill({ start: 0, end: 149 }, true, true)).toBe(true);
  });

  it('refuses without a backward token or while a page is in flight', () => {
    expect(shouldRequestBackfill({ start: 0, end: 149 }, false, true)).toBe(false);
    expect(shouldRequestBackfill({ start: 0, end: 149 }, true, false)).toBe(false);
  });
});
