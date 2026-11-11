import { useMemo } from 'react';
import { isIOSWebKit } from '$utils/platform';

/**
 * Whether this session renders the plain list instead of virtua.
 *
 * iOS WebKit is the engine that reports a freshly mounted virtual list as one row (virtua's
 * `scrollSize` stuck at the viewport height: 635 px in a 33,370 px scroller, measured 2026-11-11).
 * `?plainlist=0` forces the virtual path back for A/B on a device; `?plainlist=1` forces the plain
 * path anywhere, which is how the jsdom suite exercises it.
 */
export function usePlainTimeline(): boolean {
  return useMemo(() => {
    const flag = new URLSearchParams(window.location.search).get('plainlist');
    if (flag === '0') return false;
    if (flag === '1') return true;
    return isIOSWebKit();
  }, []);
}
