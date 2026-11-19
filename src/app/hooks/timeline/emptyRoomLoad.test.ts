import { describe, expect, it } from 'vitest';
import { decideEmptyRoomLoad } from './emptyRoomLoad';

const base = {
  eventId: undefined,
  eventsLength: 0,
  seenEvents: false,
  attempted: false,
  busy: false,
  readUptoEventId: undefined,
  canPaginateBack: false,
};

describe('decideEmptyRoomLoad', () => {
  it('anchors on the read marker only when there is no token', () => {
    expect(decideEmptyRoomLoad({ ...base, readUptoEventId: '$unread' })).toEqual({
      action: 'anchored',
    });
  });

  it('falls back to pagination when there is a token but no marker', () => {
    expect(decideEmptyRoomLoad({ ...base, canPaginateBack: true })).toEqual({ action: 'paginate' });
  });

  it('prefers pagination over the marker, because it keeps the room live', () => {
    expect(
      decideEmptyRoomLoad({ ...base, readUptoEventId: '$unread', canPaginateBack: true })
    ).toEqual({ action: 'paginate' });
  });

  it('does nothing when a permalink owns the room', () => {
    expect(
      decideEmptyRoomLoad({ ...base, eventId: '$target', readUptoEventId: '$unread' })
    ).toEqual({ action: 'skip', reason: 'permalink' });
  });

  it('does nothing in a room that already has events', () => {
    expect(decideEmptyRoomLoad({ ...base, eventsLength: 3, readUptoEventId: '$unread' })).toEqual({
      action: 'skip',
      reason: 'has-events',
    });
  });

  it('does nothing when a populated timeline emptied: that is a reset, not a cold start', () => {
    expect(
      decideEmptyRoomLoad({ ...base, seenEvents: true, readUptoEventId: '$unread' })
    ).toEqual({ action: 'skip', reason: 'timeline-reset' });
  });

  it('runs once', () => {
    expect(decideEmptyRoomLoad({ ...base, attempted: true, readUptoEventId: '$unread' })).toEqual({
      action: 'skip',
      reason: 'already-attempted',
    });
  });

  it('stays out of an in-flight jump', () => {
    expect(decideEmptyRoomLoad({ ...base, busy: true, readUptoEventId: '$unread' })).toEqual({
      action: 'skip',
      reason: 'busy',
    });
  });

  it('records why it cannot act, rather than leaving the room ambiguous', () => {
    expect(decideEmptyRoomLoad(base)).toEqual({ action: 'skip', reason: 'nothing-to-try' });
  });
});
