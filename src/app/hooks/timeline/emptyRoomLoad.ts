/**
 * What to do with a room that mounts with an empty timeline.
 *
 * The scroll path is the only thing that fetches history for a live timeline, and an empty room
 * cannot scroll. On virtua the virtualiser's mount scroll supplied the trigger by accident, so the
 * gap only became fatal when the plain list removed it; "jump to unread" is the mechanism with
 * evidence, because `loadEventTimeline` fetches around an event id and needs no token from the live
 * timeline, while the read marker comes from account data and therefore exists in an empty room.
 */
export type EmptyRoomLoadDecision =
  | { action: 'anchored' }
  | { action: 'paginate' }
  | {
      action: 'skip';
      reason: 'permalink' | 'has-events' | 'timeline-reset' | 'already-attempted' | 'busy' | 'nothing-to-try';
    };

export type EmptyRoomLoadInput = {
  /** A permalink owns the room's position; the focused path handles it. */
  eventId?: string;
  eventsLength: number;
  /** True once this room has had events: a later empty timeline is a reset, not a cold start. */
  seenEvents: boolean;
  attempted: boolean;
  /** A jump or a focused timeline is in flight. */
  busy: boolean;
  readUptoEventId?: string;
  canPaginateBack: boolean;
};

export function decideEmptyRoomLoad(input: EmptyRoomLoadInput): EmptyRoomLoadDecision {
  if (input.eventId) return { action: 'skip', reason: 'permalink' };
  if (input.eventsLength > 0) return { action: 'skip', reason: 'has-events' };
  if (input.seenEvents) return { action: 'skip', reason: 'timeline-reset' };
  if (input.attempted) return { action: 'skip', reason: 'already-attempted' };
  if (input.busy) return { action: 'skip', reason: 'busy' };
  if (input.readUptoEventId) return { action: 'anchored' };
  if (input.canPaginateBack) return { action: 'paginate' };
  return { action: 'skip', reason: 'nothing-to-try' };
}
