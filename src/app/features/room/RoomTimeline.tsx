import type { UIEvent, ReactNode } from 'react';
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  memo,
} from 'react';
import type { ProseMirrorEditorController } from '$components/editor/prosemirrorController';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import type { Room, MatrixEvent, EventTimelineSet } from '$types/matrix-sdk';
import { Direction, EventTimeline, EventType, MsgType, RoomEvent } from '$types/matrix-sdk';
import classNames from 'classnames';
import type { VListHandle } from 'virtua';
import { VList } from 'virtua';
import type { ContainerColor } from 'folds';
import { as, Box, Chip, Line, Text, Badge, color, config, toRem, Spinner } from 'folds';
import { ArrowDown, ChatTeardropDots, Checks, chipIcon } from '$components/icons/phosphor';
import { MessageBase, CompactPlaceholder, DefaultPlaceholder } from '$components/message';
import { RoomIntro } from '$components/room-intro';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMatrixEvent } from '$hooks/useMatrixEvent';
import { ScreenSize, useScreenSizeOptionally } from '$hooks/useScreenSize';
import { useAlive } from '$hooks/useAlive';
import { useMessageEdit } from '$hooks/useMessageEdit';
import { useDocumentFocusChange } from '$hooks/useDocumentFocusChange';
import { useIsInactivePanel } from '$hooks/useRoom';
import { markAsRead } from '$utils/notifications';
import { isWindowFocused, scrollToBottom as scrollElementToBottom } from '$utils/dom';
import { today, yesterday, timeDayMonthYear } from '$utils/time';
import {
  unwrapRelationJumpTarget,
  isEditEvent,
  isReactionEvent,
  isRedactableMessageType,
  isMembershipChanged,
  isThreadRelationEvent,
  getRedactionTargetEvent,
  shouldShowRedactionTimelineEvent,
} from '$utils/room/relations';
import { getMemberDisplayName } from '$utils/room/display';
import { isMobileTauri } from '$utils/platform';
import {
  anchorWindow,
  compensateForPrepend,
  containsIndex,
  EMPTY_WINDOW,
  extendForPrepend,
  growWindow,
  PLAIN_MAX_ROWS,
  reconcileWindow,
  windowLength,
  type PlainWindow,
} from './plainWindow';
import { usePlainTimeline } from './usePlainTimeline';
import * as timelineDebug from './timelineDebug';
import { useRoomNavigate } from '$hooks/useRoomNavigate';
import { useSlidingSyncRoomLoading } from '$hooks/useSlidingSyncActiveRoom';
import { useOpenUserRoomProfile } from '$state/hooks/userRoomProfile';
import { showErrorToast } from '$state/toast';
import { useSpaceOptionally } from '$hooks/useSpace';
import { useIgnoredUsers } from '$hooks/useIgnoredUsers';
import { useImagePackRooms } from '$hooks/useImagePackRooms';
import { settingsAtom, MessageLayout, type MessageSpacing } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import { nicknamesAtom } from '$state/nicknames';
import { profilesCacheAtom } from '$state/userRoomProfile';
import { roomToParentsAtom } from '$state/room/roomToParents';
import { roomIdToReplyDraftAtomFamily } from '$state/room/roomInputDrafts';
import { roomIdToOpenThreadAtomFamily } from '$state/room/roomToOpenThread';
import {
  getRoomUnreadInfo,
  getEventTimeline,
  getDisplayedEventTimeline,
  getFirstLinkedTimeline,
  getEventIdAbsoluteIndex,
  isNewestLiveEvent,
} from '$utils/timeline';
import { useTimelineSync } from '$hooks/timeline/useTimelineSync';
import { useTimelineActions } from '$hooks/timeline/useTimelineActions';
import {
  useProcessedTimeline,
  getProcessedRowIndexForRawTimelineIndex,
  STANDARD_RENDERED_EVENT_TYPES,
  type ProcessedEvent,
} from '$hooks/timeline/useProcessedTimeline';
import { useTimelineEventRenderer } from '$hooks/timeline/useTimelineEventRenderer';
import { RoomMediaViewer } from '$components/image-viewer/RoomMediaViewer';
import type { RoomMediaItem } from '$components/image-viewer/RoomMediaViewer';
import type { IImageContent } from '$types/matrix/common';
import { useTimelineRendererContext } from '$hooks/timeline/useTimelineRendererContext';
import { useUrlPreviewPrefetch } from '$hooks/timeline/useUrlPreviewPrefetch';
import { TimelineScrollingProvider, useScrollActivity } from '$hooks/useTimelineScrollActivity';
import * as css from './RoomTimeline.css';
import type { Persona } from '$app/persona';

const MAX_VIEWPORT_FILL_PAGINATIONS = 5;
const VIRTUA_SCROLL_SETTLE_MS = 200;
const FOCUSED_PAGINATION_EDGE_PX = 64;
const SCROLL_KEYS = new Set(['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', ' ']);

const TimelineFloat = as<'div', css.TimelineFloatVariants>(
  ({ position, className, ...props }, ref) => (
    <Box
      className={classNames(css.TimelineFloat({ position }), className)}
      justifyContent="Center"
      alignItems="Center"
      gap="200"
      {...props}
      ref={ref}
    />
  )
);

const TimelineDivider = as<'div', { variant?: ContainerColor | 'Inherit' }>(
  ({ variant, children, ...props }, ref) => (
    <Box gap="100" justifyContent="Center" alignItems="Center" {...props} ref={ref}>
      <Line style={{ flexGrow: 1 }} variant={variant} size="300" />
      {children}
      <Line style={{ flexGrow: 1 }} variant={variant} size="300" />
    </Box>
  )
);

const getDayDividerText = (ts: number) => {
  if (today(ts)) return 'Today';
  if (yesterday(ts)) return 'Yesterday';
  return timeDayMonthYear(ts);
};

const focusItemAffectsEvent = (focusItem: unknown, eventData: ProcessedEvent | undefined) => {
  if (!focusItem || typeof focusItem !== 'object' || !eventData) return false;
  const focusEventId = 'eventId' in focusItem ? focusItem.eventId : undefined;
  return typeof focusEventId === 'string' && focusEventId === eventData.id;
};

const eventIdAffectsEvent = (eventId: string | null | undefined, eventData?: ProcessedEvent) =>
  typeof eventId === 'string' && eventId === eventData?.id;

const shallowEqual = (prev: Record<string, unknown>, next: Record<string, unknown>) => {
  if (prev === next) return true;
  if (Object.keys(prev).length !== Object.keys(next).length) return false;
  for (const key in prev) {
    if (prev[key] !== next[key]) return false;
  }
  return true;
};

const MemoizedTimelineItem = memo(
  function MemoizedTimelineItem({
    eventData,
    index,
    showLoadingPlaceholders,
    canPaginateBack,
    backPaginationJSX,
    room,
    messageLayout,
    messageSpacing,
    renderMatrixEvent,
  }: {
    eventData: ProcessedEvent | undefined;
    index: number;
    showLoadingPlaceholders: boolean;
    canPaginateBack: boolean;
    backPaginationJSX: ReactNode | undefined;
    room: Room;
    messageLayout: MessageLayout;
    messageSpacing: MessageSpacing;
    settings: Record<string, unknown>;
    permissions: Record<string, unknown>;
    renderMatrixEvent: ReturnType<typeof useTimelineEventRenderer>;
    focusItem: unknown;
    editId: string | undefined;
    activeReplyId: string | undefined | null;
    openThreadId: string | undefined;
  }) {
    if (showLoadingPlaceholders) {
      return (
        <MessageBase key={`placeholder-${index}`}>
          {messageLayout === MessageLayout.Compact ? (
            <CompactPlaceholder />
          ) : (
            <DefaultPlaceholder />
          )}
        </MessageBase>
      );
    }

    if (!eventData) {
      if (index === 0 && !canPaginateBack) {
        return (
          <Fragment key="intro-and-first">
            {backPaginationJSX}
            <div
              style={{
                padding: `${config.space.S700} ${config.space.S400} ${config.space.S600} ${messageLayout === MessageLayout.Compact ? config.space.S400 : toRem(64)}`,
              }}
            >
              <RoomIntro room={room} />
            </div>
          </Fragment>
        );
      }
      if (index === 0) return <Fragment key="first">{backPaginationJSX}</Fragment>;
      return <Fragment key={index} />;
    }

    const renderedEvent = renderMatrixEvent(
      eventData.mEvent.getType(),
      typeof eventData.mEvent.getStateKey() === 'string',
      eventData.id,
      eventData.mEvent,
      eventData.itemIndex,
      eventData.timelineSet,
      eventData.collapsed
    );

    const showDividers = renderedEvent !== null;

    const dividers = showDividers ? (
      <>
        {eventData.willRenderDayDivider && (
          <MessageBase space={messageSpacing}>
            <TimelineDivider variant="Surface">
              <Badge as="span" size="500" variant="Secondary" fill="None" radii="300">
                <Text size="L400">{getDayDividerText(eventData.mEvent.getTs())}</Text>
              </Badge>
            </TimelineDivider>
          </MessageBase>
        )}
        {eventData.willRenderNewDivider && (
          <MessageBase space={messageSpacing}>
            <TimelineDivider style={{ color: color.Success.Main }} variant="Inherit">
              <Badge as="span" size="500" variant="Success" fill="Solid" radii="300">
                <Text size="L400">New Messages</Text>
              </Badge>
            </TimelineDivider>
          </MessageBase>
        )}
      </>
    ) : null;

    if (index === 0) {
      return (
        <Fragment key="first-item-block">
          {!canPaginateBack && (
            <div
              style={{
                padding: `${config.space.S700} ${config.space.S400} ${config.space.S600} ${messageLayout === MessageLayout.Compact ? config.space.S400 : toRem(64)}`,
              }}
            >
              <RoomIntro room={room} />
            </div>
          )}
          {backPaginationJSX}
          {dividers}
          {renderedEvent}
        </Fragment>
      );
    }

    return (
      <Fragment key={eventData.id}>
        {dividers}
        {renderedEvent}
      </Fragment>
    );
  },
  (prev, next) => {
    if (prev.index !== next.index) return false;
    if (prev.showLoadingPlaceholders !== next.showLoadingPlaceholders) return false;
    if (prev.canPaginateBack !== next.canPaginateBack) return false;
    if (prev.room !== next.room) return false;
    if (prev.messageLayout !== next.messageLayout) return false;
    if (prev.messageSpacing !== next.messageSpacing) return false;
    if (prev.renderMatrixEvent !== next.renderMatrixEvent) return false;

    // Shallow compare settings and permissions since both hold primitive toggles
    if (!shallowEqual(prev.settings, next.settings)) return false;
    if (!shallowEqual(prev.permissions, next.permissions)) return false;

    if (
      prev.focusItem !== next.focusItem &&
      (focusItemAffectsEvent(prev.focusItem, prev.eventData) ||
        focusItemAffectsEvent(next.focusItem, next.eventData))
    )
      return false;
    if (
      prev.editId !== next.editId &&
      (eventIdAffectsEvent(prev.editId, prev.eventData) ||
        eventIdAffectsEvent(next.editId, next.eventData))
    )
      return false;
    if (
      prev.activeReplyId !== next.activeReplyId &&
      (eventIdAffectsEvent(prev.activeReplyId, prev.eventData) ||
        eventIdAffectsEvent(next.activeReplyId, next.eventData))
    )
      return false;
    if (
      prev.openThreadId !== next.openThreadId &&
      (eventIdAffectsEvent(prev.openThreadId, prev.eventData) ||
        eventIdAffectsEvent(next.openThreadId, next.eventData))
    )
      return false;

    if (prev.index === 0 && prev.backPaginationJSX !== next.backPaginationJSX) return false;

    if (prev.eventData === next.eventData) return true;
    if (!prev.eventData || !next.eventData) return false;

    return (
      prev.eventData.id === next.eventData.id &&
      // A filtered mid-timeline insert shifts this without changing `index`.
      prev.eventData.itemIndex === next.eventData.itemIndex &&
      prev.eventData.isRedacted === next.eventData.isRedacted &&
      prev.eventData.collapsed === next.eventData.collapsed &&
      prev.eventData.willRenderNewDivider === next.eventData.willRenderNewDivider &&
      prev.eventData.willRenderDayDivider === next.eventData.willRenderDayDivider &&
      prev.eventData.mEvent === next.eventData.mEvent &&
      prev.eventData.eventSender === next.eventData.eventSender &&
      prev.eventData.editId === next.eventData.editId &&
      prev.eventData.reactionsKey === next.eventData.reactionsKey &&
      prev.eventData.content === next.eventData.content &&
      prev.eventData.sendStatus === next.eventData.sendStatus
    );
  }
);
export type RoomTimelineProps = {
  room: Room;
  eventId?: string;
  editor: ProseMirrorEditorController;
  onEditorReset?: () => void;
  onEditLastMessageRef?: React.MutableRefObject<(() => void) | undefined>;
  editId?: string;
  onEditId?: (editId?: string) => void;
};

const getRoomMediaItem = (
  mEvent: MatrixEvent,
  room: Room,
  nicknames?: Record<string, string>
): RoomMediaItem | undefined => {
  if (mEvent.isRedacted()) return undefined;

  const content = mEvent.getContent() as IImageContent;
  const isImage = content.msgtype === MsgType.Image || mEvent.getType() === 'm.sticker';
  const url = content.file?.url ?? content.url;
  const eventId = mEvent.getId();

  if (!isImage || typeof url !== 'string' || !eventId) return undefined;

  const senderId = mEvent.getSender();

  return {
    eventId,
    body: content.body ?? content.filename ?? 'Image',
    filename: content.filename,
    url,
    info: content.info,
    mimeType: content.info?.mimetype,
    encInfo: content.file,
    sender: senderId ? (getMemberDisplayName(room, senderId, nicknames) ?? senderId) : undefined,
    timestamp: mEvent.getTs(),
  };
};

export function RoomTimeline({
  room,
  eventId,
  editor,
  onEditorReset,
  onEditLastMessageRef,
  editId: propsEditId,
  onEditId: propsOnEditId,
}: Readonly<RoomTimelineProps>) {
  const mx = useMatrixClient();
  const isMobile = useScreenSizeOptionally() === ScreenSize.Mobile;
  const alive = useAlive();
  const roomSyncLoading = useSlidingSyncRoomLoading(room.roomId);

  const internalEdit = useMessageEdit(editor, { onReset: onEditorReset, alive });
  const editId = propsOnEditId ? propsEditId : internalEdit.editId;
  const handleEdit = propsOnEditId ?? internalEdit.handleEdit;
  const { navigateRoom } = useRoomNavigate();
  const isInactivePanel = useIsInactivePanel();
  const isInactivePanelRef = useRef(isInactivePanel);
  isInactivePanelRef.current = isInactivePanel;

  // Shared renderer context — replaces 17+ inline useSetting calls, linkifyOpts,
  // htmlReactParserOptions, and the permissions block that were duplicated with
  // ThreadDrawer character-for-character.
  const rendererCtx = useTimelineRendererContext(room);

  // RoomTimeline keeps these 3 extra settings inline:
  //   - hideMembershipEvents & hideNickAvatarEvents → already in rendererCtx.settings
  //   - reducedMotion → used only for scroll logic, NOT passed to the event renderer
  const [reducedMotion] = useSetting(settingsAtom, 'reducedMotion');

  // Destructure what we need from the shared context
  const {
    settings,
    linkifyOpts,
    htmlReactParserOptions,
    permissions: {
      canRedact,
      canDeleteOwn,
      canSendReaction,
      canPinEvent,
      isReadOnly,
      getMemberPowerTag,
      parseMemberEvent,
    },
  } = rendererCtx;

  const hiddenEvents = settings.hiddenEvents;
  const messageLayout = settings.messageLayout;
  const messageSpacing = settings.messageSpacing;
  const hideReads = settings.hideReads;
  const hideMembershipEvents = settings.hideMembershipEvents;
  const hideNickAvatarEvents = settings.hideNickAvatarEvents;
  const hideMemberInReadOnly = settings.hideMemberInReadOnly;

  const nicknames = useAtomValue(nicknamesAtom);
  const jotaiStore = useStore();
  const getGlobalProfile = useCallback(
    (userId: string) => jotaiStore.get(profilesCacheAtom)[userId],
    [jotaiStore]
  );
  const ignoredUsersList = useIgnoredUsers();
  const ignoredUsersSet = useMemo(() => new Set(ignoredUsersList), [ignoredUsersList]);

  const [unreadInfo, setUnreadInfo] = useState(() => getRoomUnreadInfo(room, true));
  const unreadScrollToRef = useRef(unreadInfo?.scrollTo === true);
  unreadScrollToRef.current = unreadInfo?.scrollTo === true;

  const readUptoEventIdRef = useRef<string | undefined>(undefined);
  if (unreadInfo) readUptoEventIdRef.current = unreadInfo.readUptoEventId;
  const unreadResolvedRef = useRef(unreadInfo !== undefined);
  const hideReadsRef = useRef(hideReads);
  hideReadsRef.current = hideReads;

  const scrollAnchorRef = useRef<string | undefined>(undefined);
  const messageListRef = useRef<HTMLDivElement>(null);

  const openUserRoomProfile = useOpenUserRoomProfile();
  const optionalSpace = useSpaceOptionally();
  const roomParents = useAtomValue(roomToParentsAtom);
  const imagePackRooms = useImagePackRooms(room.roomId, roomParents);
  const pushProcessor = mx.pushProcessor;

  const replyDraftAtom = useMemo(() => roomIdToReplyDraftAtomFamily(room.roomId), [room.roomId]);
  const activeReplyDraft = useAtomValue(replyDraftAtom);
  const setReplyDraft = useSetAtom(replyDraftAtom);
  const activeReplyId = activeReplyDraft?.eventId;

  const openThreadAtom = useMemo(() => roomIdToOpenThreadAtomFamily(room.roomId), [room.roomId]);
  const openThreadId = useAtomValue(openThreadAtom);
  const setOpenThread = useSetAtom(openThreadAtom);

  const vListRef = useRef<VListHandle>(null);
  // WebKit renders a bounded plain list instead of virtua (fallback #4, 1.1.1).
  const plainTimeline = usePlainTimeline();
  const [plainWindow, setPlainWindow] = useState<PlainWindow>(EMPTY_WINDOW);
  // Hold mode: the window stops following the live tail once the reader has scrolled away from the
  // bottom or paginated backwards. Without it every backward page is undone by the next reconcile,
  // which re-slices the newest 150 rows and throws the reader forward a page at a time.
  const [plainHold, setPlainHold] = useState(false);
  const plainShiftRef = useRef<{ firstId?: string; start: number; height: number }>({
    start: -1,
    height: 0,
  });
  const { isScrolling: isTimelineScrolling, notifyScroll } = useScrollActivity();
  const [atBottomState, setAtBottomState] = useState(true);
  const atBottomRef = useRef(atBottomState);
  const setAtBottom = useCallback((val: boolean) => {
    setAtBottomState(val);
    atBottomRef.current = val;
  }, []);

  const syncAtBottom = useCallback(
    (offset?: number) => {
      const v = vListRef.current;
      if (!v) return;
      const scrollTop = offset ?? v.scrollOffset;
      let isNowAtBottom = v.scrollSize - scrollTop - v.viewportSize < 100;
      if (isNowAtBottom && !atBottomRef.current && timelineSyncRef.current.focusItem) {
        isNowAtBottom = false;
      }
      if (isNowAtBottom !== atBottomRef.current) setAtBottom(isNowAtBottom);
    },
    [setAtBottom]
  );

  const [topSpacerHeight, setTopSpacerHeight] = useState(0);

  const topSpacerHeightRef = useRef(0);
  const hasInitialScrolledRef = useRef(false);
  const initialScrollTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const initialScrollCancelledRef = useRef(false);
  const pinBottomFrameRef = useRef<number | undefined>(undefined);
  const hasUserScrollIntentRef = useRef(false);
  const focusedPaginationIntentRef = useRef<'backward' | 'forward' | undefined>(undefined);
  const touchStartYRef = useRef<number | undefined>(undefined);
  const pendingReadyRef = useRef(false);
  const [isReady, setIsReady] = useState(false);
  const isReadyRef = useRef(isReady);
  isReadyRef.current = isReady;

  // Sampler context, read at call time so a stale closure can never report yesterday's numbers.
  const debugCtx = useCallback(
    () => ({
      roomId: room.roomId,
      spacer: topSpacerHeightRef.current,
      atBottom: atBottomRef.current,
      isReady: isReadyRef.current,
    }),
    [room.roomId]
  );

  useEffect(() => {
    timelineDebug.mountTimeline(room.roomId);
  }, [room.roomId]);

  useEffect(() => {
    timelineDebug.ready(isReady, vListRef.current, messageListRef.current, debugCtx());
  }, [isReady, debugCtx]);


  const processedEventsRef = useRef<ProcessedEvent[]>([]);
  const timelineSyncRef = useRef<typeof timelineSync>(null as unknown as typeof timelineSync);

  const scrollElRef = useRef<HTMLElement | null>(null);
  const [scrollElementVersion, setScrollElementVersion] = useState(0);

  const scrollToBottom = useCallback(
    (behavior: 'instant' | 'smooth' = 'instant') => {
      const v = vListRef.current;
      const lastIndex = processedEventsRef.current.length - 1;
      if (!v || lastIndex < 0) return;

      const smooth = behavior === 'smooth' && !reducedMotion;

      const scrollEl = scrollElRef.current;
      if (scrollEl) {
        scrollElementToBottom(scrollEl, smooth ? 'smooth' : 'instant');
        return;
      }

      v.scrollToIndex(lastIndex, { align: 'end', smooth });
    },
    [reducedMotion]
  );

  useLayoutEffect(() => {
    const messageListEl = messageListRef.current;
    if (!messageListEl) return () => {};

    const resolveScrollElement = () => {
      const scrollEl = messageListEl.firstElementChild;
      const nextScrollEl = scrollEl instanceof HTMLElement ? scrollEl : null;
      if (nextScrollEl === scrollElRef.current) return;
      scrollElRef.current = nextScrollEl;
      setScrollElementVersion((version) => version + 1);
    };

    resolveScrollElement();
    const observer = new MutationObserver(resolveScrollElement);
    observer.observe(messageListEl, { childList: true });
    return () => observer.disconnect();
  }, []);

  // iOS-only measurement fix. On the device, `document.querySelectorAll('[data-message-id]').length`
  // returns 1 right after a room switch and jumps to the full set the moment anything touches the
  // page — so virtua rendered a single item, it is not a paint bug. That means its first measurement
  // of the scroll container was far smaller than the real viewport (the flex chain has not resolved
  // to a pixel height yet when the VList mounts), and nothing re-measures it until a user interaction
  // resizes something. Two things force that re-measure: pin the scroller to the wrapper's measured
  // height, and nudge the scroller's width by 1px once so its ResizeObserver fires.
  useLayoutEffect(() => {
    if (!isMobileTauri()) return () => {};
    const wrap = messageListRef.current;
    if (!wrap) return () => {};

    let raf = 0;
    let inner = 0;

    const resolveScroller = () =>
      wrap.firstElementChild instanceof HTMLElement ? (wrap.firstElementChild as HTMLElement) : null;

    const pinHeight = () => {
      const scroller = resolveScroller();
      const height = wrap.clientHeight;
      if (!scroller || height <= 0) return;
      if (Math.abs(scroller.clientHeight - height) > 1) {
        scroller.style.height = `${height}px`;
      }
    };

    const nudgeWidth = () => {
      const scroller = resolveScroller();
      if (!scroller) return;
      const previous = scroller.style.width;
      scroller.style.width = 'calc(100% - 1px)';
      inner = requestAnimationFrame(() => {
        scroller.style.width = previous;
      });
    };

    pinHeight();
    raf = requestAnimationFrame(() => {
      pinHeight();
      nudgeWidth();
    });

    const observer = new ResizeObserver(() => pinHeight());
    observer.observe(wrap);

    return () => {
      cancelAnimationFrame(raf);
      if (inner) cancelAnimationFrame(inner);
      observer.disconnect();
    };
  }, [isReady, room.roomId]);

  // A room switch can lay the room out at zero height for a frame or two — the trace shows
  // `wrap 0, par 0` on the second mount of a switch. virtua measures that as its viewport, and when
  // the box expands WebKit drops its resize notification ("ResizeObserver loop completed with
  // undelivered notifications"), so the list keeps a one-row range: the newest message alone, or a
  // viewport that empties at the bottom until a scroll forces a re-measure. Watch the wrapper here
  // and nudge the scroller's width once on the 0 → N transition, which is what makes virtua
  // re-measure.
  useEffect(() => {
    const wrap = messageListRef.current;
    if (!wrap) return undefined;

    let lastHeight = wrap.clientHeight;
    let nudgeFrame = 0;

    const observer = new ResizeObserver(() => {
      const height = wrap.clientHeight;
      const restored = lastHeight === 0 && height > 0;
      lastHeight = height;
      if (!restored) return;

      const scroller = wrap.firstElementChild;
      if (!(scroller instanceof HTMLElement)) return;

      const previous = scroller.style.width;
      scroller.style.width = 'calc(100% - 1px)';
      nudgeFrame = requestAnimationFrame(() => {
        scroller.style.width = previous;
      });
      timelineDebug.note('remeasure', { height }, vListRef.current, wrap, debugCtx());
    });

    observer.observe(wrap);
    return () => {
      observer.disconnect();
      if (nudgeFrame) cancelAnimationFrame(nudgeFrame);
    };
  }, [debugCtx]);

  const jumpToEvent = useCallback(
    (id: string) => {
      setAtBottom(false);
      scrollAnchorRef.current = id;
      void timelineSyncRef.current.loadEventTimeline(id);
    },
    [setAtBottom]
  );
  const handleJumpError = useCallback(() => {
    scrollAnchorRef.current = undefined;
    setAtBottom(true);
    showErrorToast('Unable to load this message.');
  }, [setAtBottom]);
  const handleReturnToLive = useCallback(() => {
    scrollAnchorRef.current = undefined;
    if (eventId) navigateRoom(room.roomId, undefined, { replace: true });
    setAtBottom(true);
  }, [eventId, navigateRoom, room.roomId, setAtBottom]);

  const timelineSync = useTimelineSync({
    room,
    mx,
    eventId,
    isAtBottom: atBottomState,
    isAtBottomRef: atBottomRef,
    scrollToBottom,
    unreadInfo,
    setUnreadInfo,
    hideReadsRef,
    readUptoEventIdRef,
    isInactivePanelRef,
    onJumpError: handleJumpError,
    onReturnToLive: handleReturnToLive,
    isEventVisible: useCallback(
      (mEvent: MatrixEvent, timelineSet: EventTimelineSet) => {
        const sender = mEvent.getSender();
        if (sender && ignoredUsersSet.has(sender)) return false;

        const type = mEvent.getType();
        const isEdit = isEditEvent(mEvent);
        const isReaction = isReactionEvent(mEvent);
        const isRedactionEvt = mEvent.isRedaction();

        if (hideMemberInReadOnly && isReadOnly) {
          if (isReaction) return false;
          if (
            isRedactionEvt &&
            getRedactionTargetEvent(timelineSet, mEvent)?.getType() ===
              (EventType.Reaction as string)
          ) {
            return false;
          }
        }

        if (mEvent.isRedacted()) {
          const showMessageTombstone =
            hiddenEvents.showTombstoneEvents && isRedactableMessageType(type);
          const showReactionTombstone = hiddenEvents.hiddenEventReactionTombstone && isReaction;
          if (!showMessageTombstone && !showReactionTombstone) return false;
        }

        if (type === 'm.room.member') {
          const membershipChanged = isMembershipChanged(mEvent);
          if (hideMemberInReadOnly && isReadOnly) return false;
          if (membershipChanged && hideMembershipEvents) return false;
          if (!membershipChanged && hideNickAvatarEvents) return false;
        }

        const allowSpecificHiddenEvent =
          (isEdit && hiddenEvents.hiddenEventEdits) ||
          (isReaction && !mEvent.isRedacted() && hiddenEvents.hiddenEventReactions) ||
          (isReaction && mEvent.isRedacted() && hiddenEvents.hiddenEventReactionTombstone) ||
          (isRedactionEvt &&
            shouldShowRedactionTimelineEvent(
              mEvent,
              timelineSet,
              hiddenEvents.hiddenEventRedactionTimeline,
              hiddenEvents.hiddenEventReactionRedactionTimeline
            ));

        if (!(hiddenEvents.showHiddenEvents && hiddenEvents.hiddenEventOther)) {
          const isStandardRendered = STANDARD_RENDERED_EVENT_TYPES.has(type);
          if (!isStandardRendered && !allowSpecificHiddenEvent) {
            return false;
          }
        }

        const threadRootId = mEvent.threadRootId;
        if (
          threadRootId !== undefined &&
          threadRootId !== mEvent.getId() &&
          isThreadRelationEvent(mEvent, threadRootId)
        ) {
          return false;
        }

        if (isEdit && !hiddenEvents.hiddenEventEdits) return false;
        if (isReaction) {
          if (mEvent.isRedacted()) {
            if (!hiddenEvents.hiddenEventReactionTombstone) return false;
          } else if (!hiddenEvents.hiddenEventReactions) {
            return false;
          }
        }
        if (
          isRedactionEvt &&
          !shouldShowRedactionTimelineEvent(
            mEvent,
            timelineSet,
            hiddenEvents.hiddenEventRedactionTimeline,
            hiddenEvents.hiddenEventReactionRedactionTimeline
          )
        ) {
          return false;
        }

        return true;
      },
      [
        hiddenEvents,
        hideMemberInReadOnly,
        isReadOnly,
        hideMembershipEvents,
        hideNickAvatarEvents,
        ignoredUsersSet,
      ]
    ),
  });

  timelineSyncRef.current = timelineSync;
  const focusLiveTimeline = timelineSync.focusLiveTimeline;

  // Mirrors the `key` on the VList below: every room switch (and every change of live/anchor
  // state) remounts the virtual list, which re-measures and re-runs the initial scroll sequence.
  const timelineListKey = `${room.roomId}:${
    timelineSync.liveTimelineLinked || (timelineSync.focusItem?.eventId ?? scrollAnchorRef.current) === undefined
      ? 'live'
      : (timelineSync.focusItem?.eventId ?? scrollAnchorRef.current)
  }`;

  useEffect(() => {
    timelineDebug.mountVList(room.roomId);
    const raf = window.requestAnimationFrame(() => {
      timelineDebug.trace(14, 'mount', vListRef.current, messageListRef.current, debugCtx());
    });
    return () => window.cancelAnimationFrame(raf);
  }, [timelineListKey, room.roomId, debugCtx]);

  const eventsLengthRef = useRef(timelineSync.eventsLength);
  eventsLengthRef.current = timelineSync.eventsLength;

  const canPaginateBackRef = useRef(timelineSync.canPaginateBack);
  canPaginateBackRef.current = timelineSync.canPaginateBack;
  const viewportFillCountRef = useRef(0);

  const liveTimelineLinkedRef = useRef(timelineSync.liveTimelineLinked);
  liveTimelineLinkedRef.current = timelineSync.liveTimelineLinked;

  const backwardStatusRef = useRef(timelineSync.backwardStatus);
  backwardStatusRef.current = timelineSync.backwardStatus;

  const forwardStatusRef = useRef(timelineSync.forwardStatus);
  forwardStatusRef.current = timelineSync.forwardStatus;

  const canPaginateForwardRef = useRef(timelineSync.canPaginateForward);
  canPaginateForwardRef.current = timelineSync.canPaginateForward;

  const scrollOwner: 'live' | 'event' =
    eventId !== undefined ||
    timelineSync.focusItem !== undefined ||
    !timelineSync.liveTimelineLinked
      ? 'event'
      : 'live';
  const scrollOwnerRef = useRef(scrollOwner);
  scrollOwnerRef.current = scrollOwner;

  const resolveFocusRowIndex = useCallback((focusEventId: string): number | undefined => {
    const events = processedEventsRef.current;
    const rowIndex = events.findIndex((e) => e.id === focusEventId);
    if (rowIndex >= 0) return rowIndex;

    const linkedTimelines = timelineSyncRef.current.timeline.linkedTimelines;
    const evtTimeline = getDisplayedEventTimeline(linkedTimelines, focusEventId);
    if (!evtTimeline) return undefined;
    const rawIndex = getEventIdAbsoluteIndex(linkedTimelines, evtTimeline, focusEventId);
    if (rawIndex === undefined) return undefined;
    return getProcessedRowIndexForRawTimelineIndex(events, rawIndex)?.rowIndex;
  }, []);

  const restoreScrollAnchor = useCallback(() => {
    const anchorId = scrollAnchorRef.current;
    if (!anchorId) return;
    const index = resolveFocusRowIndex(anchorId);

    if (plainTimeline) {
      if (index !== undefined) {
        setPlainWindow(anchorWindow(processedEventsRef.current.length, index));
      }
      requestAnimationFrame(() => {
        const el = messageListRef.current?.querySelector<HTMLElement>(
          `[data-message-id="${anchorId}"]`
        );
        el?.scrollIntoView({ block: 'center' });
        // The jump is done. Hold only if the list can actually scroll and the reader did not land
        // at the bottom — a short room fires no scroll event, so an unconditional hold would stick
        // and stop the window following the room as it grows.
        const scroller = messageListRef.current?.firstElementChild as HTMLElement | null;
        if (scroller) {
          const scrollable = scroller.scrollHeight > scroller.clientHeight + 1;
          const distanceFromBottom =
            scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
          setPlainHold(scrollable && distanceFromBottom >= 100);
        }
        scrollAnchorRef.current = undefined;
      });
      return;
    }

    if (index !== undefined) vListRef.current?.scrollToIndex(index, { align: 'center' });
  }, [resolveFocusRowIndex, plainTimeline]);

  const restoreScrollPosition = useCallback(() => {
    if (scrollAnchorRef.current !== undefined) {
      restoreScrollAnchor();
      return;
    }
    if (atBottomRef.current && processedEventsRef.current.length > 0) scrollToBottom();
  }, [restoreScrollAnchor, scrollToBottom]);

  /**
   * Bottom latch.
   *
   * The event window arrives in stages: the first page mounts the list at its own bottom, then the
   * full window replaces it and the content height jumps by an order of magnitude (measured on the
   * device: 3163 px of first page, 37798 px once loaded). A single scroll — or an 80 ms timer plus
   * one rAF, which is what this used to do — lands at the bottom of whatever existed at that
   * instant and then sits there: `scrollTop` 2469 for ~180 ms, then a step to 29028, then 37104.
   * That is the "snap up, then correct down".
   *
   * So while the initial scroll still owns the timeline, re-pin to the bottom every frame and stop
   * only once the geometry has been stable for three frames. The scroll element's own
   * `scrollHeight` is the authority here, not virtua's index maths: asking virtua for the last index
   * while its size cache is empty produces an estimated offset that is wrong by tens of thousands
   * of pixels.
   */
  const startBottomLatch = useCallback(() => {
    const running = pinBottomFrameRef.current;
    if (running !== undefined) cancelAnimationFrame(running);

    let stableFrames = 0;
    let frames = 0;
    let previousTop = -1;
    let previousSize = -1;

    const step = () => {
      pinBottomFrameRef.current = undefined;

      const scrollEl = scrollElRef.current;
      const cancelled =
        !scrollEl ||
        initialScrollCancelledRef.current ||
        hasUserScrollIntentRef.current ||
        // An explicit anchor (jump to event, unread) owns the scroll; a room that is merely still
        // linking its live timeline does not, and that is exactly the state a fast switch leaves
        // behind — so the latch must not cancel on `scrollOwner`.
        scrollAnchorRef.current !== undefined;

      if (cancelled) {
        timelineDebug.note('latch-end', { frames, reason: 'cancelled' }, vListRef.current, messageListRef.current, debugCtx());
        setIsReady(true);
        return;
      }

      frames += 1;

      // Skip the write when the list is already at the bottom: every scroll event feeds
      // `notifyScroll` and re-renders the timeline, and a latch that fires 60 times a second in a
      // busy room would cost more than it fixes.
      const target = scrollEl.scrollHeight - scrollEl.clientHeight;
      if (Math.abs(scrollEl.scrollTop - target) > 1) scrollElementToBottom(scrollEl, 'auto');

      const top = Math.round(scrollEl.scrollTop);
      const size = scrollEl.scrollHeight;

      if (top === previousTop && size === previousSize) stableFrames += 1;
      else stableFrames = 0;

      previousTop = top;
      previousSize = size;

      // Content arrives in bursts, so three quiet frames right after mount do not mean the window
      // is complete. Require ~200 ms of minimum pinning before stability can end the latch.
      if ((frames >= 12 && stableFrames >= 3) || frames >= 90) {
        timelineDebug.note(
          'latch-end',
          { frames, stableFrames, scrollTop: top, scrollHeight: size },
          vListRef.current,
          messageListRef.current,
          debugCtx()
        );
        setIsReady(true);
        return;
      }

      pinBottomFrameRef.current = requestAnimationFrame(step);
    };

    if (running === undefined) {
      timelineDebug.note('latch-start', { frames: 0 }, vListRef.current, messageListRef.current, debugCtx());
    }
    pinBottomFrameRef.current = requestAnimationFrame(step);
  }, [debugCtx]);

  useEffect(
    () => () => {
      if (pinBottomFrameRef.current !== undefined) cancelAnimationFrame(pinBottomFrameRef.current);
    },
    []
  );

  useLayoutEffect(() => {
    if (!eventId) return;
    if (initialScrollTimerRef.current !== undefined) {
      clearTimeout(initialScrollTimerRef.current);
      initialScrollTimerRef.current = undefined;
    }
    pendingReadyRef.current = false;
  }, [eventId]);

  useLayoutEffect(() => {
    if (
      scrollOwner === 'live' &&
      !hasInitialScrolledRef.current &&
      timelineSync.eventsLength > 0 &&
      timelineSync.liveTimelineLinked &&
      vListRef.current
    ) {
      initialScrollCancelledRef.current = false;
      hasInitialScrolledRef.current = true;
      if (unreadScrollToRef.current) {
        setIsReady(true);
        return;
      }
      scrollToBottom();
      // The first page is on screen; the full window is still arriving. Pin until the geometry
      // stops moving instead of trusting one timer and one frame.
      startBottomLatch();
    }
  }, [
    timelineSync.eventsLength,
    timelineSync.liveTimelineLinked,
    scrollOwner,
    room.roomId,
    scrollToBottom,
    startBottomLatch,
  ]);

  useEffect(
    () => () => {
      if (initialScrollTimerRef.current !== undefined) clearTimeout(initialScrollTimerRef.current);
    },
    []
  );

  useLayoutEffect(() => {
    if (timelineSync.eventsLength > 0) return;
    hasInitialScrolledRef.current = false;
    // The next room inherits nothing: not the hold, not the window, not the last measured height.
    setPlainHold(false);
    setPlainWindow(EMPTY_WINDOW);
    plainShiftRef.current = { start: -1, height: 0 };
    plainFillAttemptsRef.current = 0;
    plainFillLengthRef.current = 0;
  }, [timelineSync.eventsLength]);

  const recalcTopSpacer = useCallback(() => {
    const v = vListRef.current;
    if (!v) return;
    const prev = topSpacerHeightRef.current;

    const newH = Math.max(0, v.viewportSize - v.scrollSize + prev);
    if (Math.abs(prev - newH) > 2) {
      topSpacerHeightRef.current = newH;
      setTopSpacerHeight(newH);
      timelineDebug.spacer(prev, newH, v, messageListRef.current, debugCtx());
      if (prev > 0 && newH === 0 && processedEventsRef.current.length > 0) {
        requestAnimationFrame(restoreScrollPosition);
      }
    }
  }, [restoreScrollPosition, debugCtx]);

  useLayoutEffect(() => {
    const id = requestAnimationFrame(recalcTopSpacer);
    return () => cancelAnimationFrame(id);
  }, [recalcTopSpacer, timelineSync.eventsLength]);

  const prevBackwardStatusRef = useRef(timelineSync.backwardStatus);
  const wasAtBottomBeforePaginationRef = useRef(false);

  useLayoutEffect(() => {
    const prev = prevBackwardStatusRef.current;
    prevBackwardStatusRef.current = timelineSync.backwardStatus;
    if (timelineSync.backwardStatus === 'loading') {
      wasAtBottomBeforePaginationRef.current = atBottomRef.current;
    } else if (
      prev === 'loading' &&
      timelineSync.backwardStatus === 'idle' &&
      !timelineSync.backwardError
    ) {
      if (scrollOwnerRef.current === 'event' && scrollAnchorRef.current !== undefined) {
        restoreScrollAnchor();
      } else if (wasAtBottomBeforePaginationRef.current) scrollToBottom();
    }
  }, [
    timelineSync.backwardStatus,
    timelineSync.backwardError,
    restoreScrollAnchor,
    scrollToBottom,
  ]);

  useEffect(() => {
    if (!timelineSync.focusItem?.scrollTo || !vListRef.current) return;
    const processedIndex = resolveFocusRowIndex(timelineSync.focusItem.eventId);
    if (processedIndex === undefined) return;

    const landedId = processedEventsRef.current[processedIndex]?.id;
    const isLiveEnd =
      landedId === timelineSync.focusItem.eventId &&
      isNewestLiveEvent(room, timelineSync.focusItem.eventId) &&
      getEventTimeline(room, timelineSync.focusItem.eventId) === room.getLiveTimeline() &&
      timelineSync.liveTimelineLinked &&
      processedIndex === processedEventsRef.current.length - 1;
    if (isLiveEnd) {
      scrollAnchorRef.current = undefined;
      setAtBottom(true);
      scrollToBottom();
      if (eventId === timelineSync.focusItem.eventId) {
        navigateRoom(room.roomId, undefined, { replace: true });
      }
      timelineSyncRef.current.setFocusItem(undefined);
      return;
    }

    scrollAnchorRef.current = landedId ?? timelineSync.focusItem.eventId;
    if (landedId && landedId !== timelineSync.focusItem.eventId) {
      timelineSyncRef.current.setFocusItem((prev) =>
        prev ? { ...prev, eventId: landedId, scrollTo: true } : undefined
      );
    }
    vListRef.current.scrollToIndex(processedIndex, { align: 'center' });
    const replayId = setTimeout(() => {
      if (timelineSyncRef.current.focusItem?.scrollTo) restoreScrollAnchor();
    }, VIRTUA_SCROLL_SETTLE_MS);
    return () => clearTimeout(replayId);
  }, [
    timelineSync.focusItem,
    timelineSync.eventsLength,
    timelineSync.liveTimelineLinked,
    eventId,
    navigateRoom,
    resolveFocusRowIndex,
    room,
    restoreScrollAnchor,
    scrollToBottom,
    setAtBottom,
  ]);

  useEffect(() => {
    if (!timelineSync.focusItem) return undefined;
    const timeoutId = setTimeout(() => {
      timelineSyncRef.current.setFocusItem(undefined);
    }, 2000);
    return () => clearTimeout(timeoutId);
  }, [timelineSync.focusItem]);

  useEffect(() => {
    if (timelineSync.focusItem || timelineSync.jumpFailed) {
      setIsReady(true);
    }
  }, [timelineSync.focusItem, timelineSync.jumpFailed]);

  useEffect(() => {
    if (!eventId) return;
    jumpToEvent(eventId);
  }, [eventId, room, jumpToEvent]);

  const previousEventIdRef = useRef(eventId);
  useEffect(() => {
    const previousEventId = previousEventIdRef.current;
    previousEventIdRef.current = eventId;
    if (previousEventId === undefined || eventId !== undefined) return;

    scrollAnchorRef.current = undefined;
    focusLiveTimeline();
    setAtBottom(true);
  }, [eventId, focusLiveTimeline, setAtBottom]);

  useEffect(() => {
    if (unreadResolvedRef.current) return;
    const resolved = getRoomUnreadInfo(room, !isReady);
    if (!resolved) return;
    unreadResolvedRef.current = true;
    readUptoEventIdRef.current = resolved.readUptoEventId;
    setUnreadInfo(resolved);
  }, [room, isReady, timelineSync.eventsLength]);

  useEffect(() => {
    if (eventId) return;
    if (isReady) return;
    const { readUptoEventId, inLiveTimeline, scrollTo } = unreadInfo ?? {};
    if (readUptoEventId && inLiveTimeline && scrollTo) {
      const evtTimeline = getEventTimeline(room, readUptoEventId);
      const absoluteIndex = evtTimeline
        ? getEventIdAbsoluteIndex(
            timelineSync.timeline.linkedTimelines,
            evtTimeline,
            readUptoEventId
          )
        : undefined;

      if (absoluteIndex !== undefined) {
        const rows = processedEventsRef.current;
        const exactRow = rows.findIndex((e) => e.id === readUptoEventId);
        const processedIndex =
          exactRow >= 0
            ? exactRow
            : getProcessedRowIndexForRawTimelineIndex(rows, absoluteIndex)?.rowIndex;
        if (processedIndex !== undefined && vListRef.current) {
          vListRef.current.scrollToIndex(processedIndex, { align: 'start' });
          setAtBottom(false);
        }
        unreadScrollToRef.current = false;
        setUnreadInfo((prev) => (prev ? { ...prev, scrollTo: false } : prev));
      }
    }
  }, [room, unreadInfo, timelineSync.timeline.linkedTimelines, eventId, isReady, setAtBottom]);

  useEffect(() => {
    const el = messageListRef.current;
    if (!el) return () => {};

    const contentEl = scrollElRef.current?.firstElementChild;
    let contentObserver: ResizeObserver | undefined;
    if (contentEl) {
      contentObserver = new ResizeObserver(() => {
        if (scrollOwnerRef.current === 'live' && atBottomRef.current) scrollToBottom();
        syncAtBottom();
      });
      contentObserver.observe(contentEl);
    }

    const observer = new ResizeObserver(() => {
      if (scrollOwnerRef.current === 'live' && atBottomRef.current) scrollToBottom();
      syncAtBottom();
    });

    observer.observe(el);
    return () => {
      observer.disconnect();
      contentObserver?.disconnect();
    };
  }, [scrollElementVersion, scrollToBottom, syncAtBottom]);

  const actions = useTimelineActions({
    room,
    mx,
    editor,
    nicknames,
    getGlobalProfile,
    spaceId: optionalSpace?.roomId,
    openUserRoomProfile: openUserRoomProfile as unknown as (
      roomId: string,
      spaceId: string | undefined,
      userId: string,
      pmp: Persona | undefined,
      rect: DOMRect,
      undefinedArg?: undefined,
      options?: unknown
    ) => void,
    activeReplyId,
    setReplyDraft: setReplyDraft as unknown as (draft: unknown) => void,
    openThreadId,
    setOpenThread: setOpenThread as unknown as (threadId: string | undefined) => void,
    handleEdit,
    handleOpenEvent: (id) => {
      const anchorId = unwrapRelationJumpTarget(room, id);
      let resolvedId = anchorId;
      let processedIndex = resolveFocusRowIndex(anchorId);
      if (processedIndex === undefined && anchorId !== id) {
        resolvedId = id;
        processedIndex = resolveFocusRowIndex(id);
      }

      if (processedIndex !== undefined) {
        timelineSync.cancelEventTimelineLoad();
        setAtBottom(false);
        if (vListRef.current) {
          vListRef.current.scrollToIndex(processedIndex, { align: 'center' });
        }
        const landedId = processedEventsRef.current[processedIndex]?.id ?? resolvedId;
        scrollAnchorRef.current = landedId;
        timelineSync.setFocusItem({ eventId: landedId, scrollTo: false, highlight: true });
      } else {
        jumpToEvent(anchorId);
      }
    },
  });

  // renderMatrixEvent keeps a stable identity and reads these through a ref, so
  // the row memo has to compare them itself to notice a power-level change.
  const rowPermissions = { canRedact, canDeleteOwn, canSendReaction, canPinEvent };

  const [selectedMediaEventId, setSelectedMediaEventId] = useState<string>();
  const [roomMedia, setRoomMedia] = useState<RoomMediaItem[]>([]);
  const openRoomMedia = useCallback(
    (mEvent: MatrixEvent) => {
      const mediaEventId = mEvent.getId();
      if (!isMobile || !mediaEventId || !getRoomMediaItem(mEvent, room, nicknames)) return false;
      setRoomMedia(
        timelineSyncRef.current.timeline.linkedTimelines.flatMap((timeline) =>
          timeline.getEvents().flatMap((timelineEvent) => {
            const item = getRoomMediaItem(timelineEvent, room, nicknames);
            return item ? [item] : [];
          })
        )
      );
      setSelectedMediaEventId(mediaEventId);
      return true;
    },
    [isMobile, room, nicknames]
  );

  const renderMatrixEvent = useTimelineEventRenderer({
    room,
    mx,
    pushProcessor,
    nicknames,
    getProfile: getGlobalProfile,
    imagePackRooms,
    settings,
    state: { focusItem: timelineSync.focusItem, editId, activeReplyId, openThreadId },
    permissions: rowPermissions,
    callbacks: {
      onUserClick: actions.handleUserClick,
      onUsernameClick: actions.handleUsernameClick,
      onReplyClick: actions.handleReplyClick,
      onReactionToggle: actions.handleReactionToggle,
      onEditId: actions.handleEdit,
      onResend: actions.handleResend,
      onDeleteFailedSend: actions.handleDeleteFailedSend,
      setOpenThread: actions.setOpenThread,
      handleOpenReply: actions.handleOpenReply,
      onOpenMedia: openRoomMedia,
    },
    utils: { htmlReactParserOptions, linkifyOpts, getMemberPowerTag, parseMemberEvent },
  });

  const tryAutoMarkAsRead = useCallback(() => {
    if (isInactivePanel) return; // Don't clear unread while room is behind the list
    if (!isReady) return;
    if (!atBottomRef.current) return;
    if (!readUptoEventIdRef.current) {
      requestAnimationFrame(() => markAsRead(mx, room.roomId, hideReads));
      return;
    }
    const evtTimeline = getEventTimeline(room, readUptoEventIdRef.current);
    const latestTimeline = evtTimeline && getFirstLinkedTimeline(evtTimeline, Direction.Forward);
    if (latestTimeline === room.getLiveTimeline()) {
      requestAnimationFrame(() => markAsRead(mx, room.roomId, hideReads));
    }
  }, [mx, room, hideReads, isInactivePanel, isReady]);

  useDocumentFocusChange(
    useCallback(
      (inFocus) => {
        if (inFocus) {
          if (atBottomState && timelineSync.liveTimelineLinked) tryAutoMarkAsRead();
          return;
        }
        // Re-anchor the divider at the last read when tabbing out while caught up.
        if (atBottomState && timelineSync.liveTimelineLinked) {
          readUptoEventIdRef.current = undefined;
          setUnreadInfo(undefined);
        }
      },
      [tryAutoMarkAsRead, atBottomState, timelineSync.liveTimelineLinked, setUnreadInfo]
    )
  );

  // Reading elsewhere clears the room list badge, so clear the in-room marker too.
  useMatrixEvent(
    room,
    RoomEvent.Receipt,
    useCallback(
      (mEvent: MatrixEvent) => {
        const myUserId = mx.getUserId();
        if (!myUserId) return;
        const content =
          mEvent.getContent<Record<string, Record<string, Record<string, unknown>>>>();
        const isMyReceipt = Object.values(content).some((byType) =>
          Object.values(byType ?? {}).some((byUser) => myUserId in (byUser ?? {}))
        );
        // Re-anchoring on a partial remote read would move the divider mid-read.
        if (!isMyReceipt || getRoomUnreadInfo(room)) return;
        readUptoEventIdRef.current = undefined;
        setUnreadInfo(undefined);
      },
      [mx, room]
    )
  );

  useEffect(() => {
    if (atBottomState && isWindowFocused() && timelineSync.liveTimelineLinked) tryAutoMarkAsRead();
  }, [
    atBottomState,
    timelineSync.liveTimelineLinked,
    tryAutoMarkAsRead,
    timelineSync.eventsLength,
  ]);

  useEffect(() => {
    const messageListEl = messageListRef.current;
    if (!messageListEl) return () => {};
    const setFocusedPaginationIntent = (direction: 'backward' | 'forward') => {
      hasUserScrollIntentRef.current = true;
      scrollAnchorRef.current = undefined;
      if (eventId === undefined && !timelineSyncRef.current.focusItem) return;
      focusedPaginationIntentRef.current = direction;
    };
    const recordWheelIntent = (evt: WheelEvent) => {
      if (evt.deltaY === 0) return;
      setFocusedPaginationIntent(evt.deltaY < 0 ? 'backward' : 'forward');
    };
    const recordKeyIntent = (evt: KeyboardEvent) => {
      if (!SCROLL_KEYS.has(evt.key)) return;
      if (evt.key === 'Home' || evt.key === 'PageUp' || evt.key === 'ArrowUp') {
        setFocusedPaginationIntent('backward');
      } else if (evt.key === 'End' || evt.key === 'PageDown' || evt.key === 'ArrowDown') {
        setFocusedPaginationIntent('forward');
      } else {
        setFocusedPaginationIntent(evt.shiftKey ? 'backward' : 'forward');
      }
    };
    const recordTouchStart = (evt: TouchEvent) => {
      touchStartYRef.current = evt.touches[0]?.clientY;
    };
    const recordTouchIntent = (evt: TouchEvent) => {
      const startY = touchStartYRef.current;
      const currentY = evt.touches[0]?.clientY;
      if (startY === undefined || currentY === undefined || startY === currentY) return;
      setFocusedPaginationIntent(currentY < startY ? 'forward' : 'backward');
      touchStartYRef.current = currentY;
    };
    messageListEl.addEventListener('wheel', recordWheelIntent, { passive: true });
    messageListEl.addEventListener('keydown', recordKeyIntent);
    messageListEl.addEventListener('touchstart', recordTouchStart, { passive: true });
    messageListEl.addEventListener('touchmove', recordTouchIntent, { passive: true });
    return () => {
      messageListEl.removeEventListener('wheel', recordWheelIntent);
      messageListEl.removeEventListener('keydown', recordKeyIntent);
      messageListEl.removeEventListener('touchstart', recordTouchStart);
      messageListEl.removeEventListener('touchmove', recordTouchIntent);
    };
  }, [eventId]);

  const prefetchPreviews = useUrlPreviewPrefetch(mx, settings.showUrlPreview, processedEventsRef);

  const prefetchAroundViewport = useCallback(() => {
    const v = vListRef.current;
    if (!v) return;
    const { scrollOffset, viewportSize } = v;
    prefetchPreviews(v.findItemIndex(scrollOffset), v.findItemIndex(scrollOffset + viewportSize));
  }, [prefetchPreviews]);

  useEffect(prefetchAroundViewport, [prefetchAroundViewport, timelineSync.eventsLength]);

  const handleVListScroll = useCallback(
    (offset: number) => {
      notifyScroll();
      const v = vListRef.current;
      if (!v) return;

      timelineDebug.scroll(v, messageListRef.current, debugCtx());
      prefetchAroundViewport();

      const distanceFromBottom = v.scrollSize - offset - v.viewportSize;
      syncAtBottom(offset);

      if (hasUserScrollIntentRef.current && distanceFromBottom >= 100) {
        initialScrollCancelledRef.current = true;
        if (initialScrollTimerRef.current !== undefined) {
          clearTimeout(initialScrollTimerRef.current);
          initialScrollTimerRef.current = undefined;
        }
        setIsReady(true);
      }

      if (eventId !== undefined || timelineSyncRef.current.focusItem) {
        const intent = focusedPaginationIntentRef.current;
        if (
          intent === 'backward' &&
          offset <= FOCUSED_PAGINATION_EDGE_PX &&
          canPaginateBackRef.current &&
          backwardStatusRef.current === 'idle'
        ) {
          focusedPaginationIntentRef.current = undefined;
          void timelineSyncRef.current.handleTimelinePagination(true);
        } else if (
          intent === 'forward' &&
          distanceFromBottom <= FOCUSED_PAGINATION_EDGE_PX &&
          canPaginateForwardRef.current &&
          forwardStatusRef.current === 'idle'
        ) {
          focusedPaginationIntentRef.current = undefined;
          void timelineSyncRef.current.handleTimelinePagination(false);
        }
        return;
      }

      if (scrollAnchorRef.current !== undefined) return;

      if (offset < 500 && canPaginateBackRef.current && backwardStatusRef.current === 'idle') {
        void timelineSyncRef.current.handleTimelinePagination(true);
      }
      if (
        distanceFromBottom < 500 &&
        canPaginateForwardRef.current &&
        forwardStatusRef.current === 'idle'
      ) {
        void timelineSyncRef.current.handleTimelinePagination(false);
      }
    },
    [eventId, notifyScroll, syncAtBottom, prefetchAroundViewport, debugCtx]
  );
  const handleVListScrollEnd = useCallback(() => {
    timelineDebug.settle(vListRef.current, messageListRef.current, debugCtx());
    if (!timelineSyncRef.current.focusItem?.scrollTo) return;
    restoreScrollAnchor();
    timelineSyncRef.current.setFocusItem((prev) =>
      prev ? { ...prev, scrollTo: false } : undefined
    );
  }, [restoreScrollAnchor, debugCtx]);

  // A failed backfill keeps its pagination token, so the placeholder condition
  // would otherwise hold forever and never reach the error and its Retry.
  const showEmptyPaginationError = timelineSync.eventsLength === 0 && timelineSync.backwardError;

  const showLoadingPlaceholders =
    timelineSync.eventsLength === 0 &&
    !showEmptyPaginationError &&
    (!isReady || timelineSync.canPaginateBack || timelineSync.backwardStatus === 'loading');

  let backPaginationJSX: ReactNode | undefined;
  if (
    timelineSync.canPaginateBack ||
    timelineSync.backwardStatus !== 'idle' ||
    timelineSync.backwardError
  ) {
    if (timelineSync.backwardError) {
      backPaginationJSX = (
        <Box
          justifyContent="Center"
          alignItems="Center"
          gap="200"
          style={{ padding: config.space.S300 }}
        >
          <Text style={{ color: color.Critical.Main }} size="T300">
            Failed to load history.
          </Text>
          <Chip
            variant="SurfaceVariant"
            radii="Pill"
            outlined
            onClick={() => timelineSync.handleTimelinePagination(true)}
          >
            <Text size="B300">Retry</Text>
          </Chip>
        </Box>
      );
    }
  }

  let frontPaginationJSX: ReactNode | undefined;
  if (
    !timelineSync.liveTimelineLinked ||
    timelineSync.forwardStatus !== 'idle' ||
    timelineSync.forwardError
  ) {
    if (timelineSync.forwardError) {
      frontPaginationJSX = (
        <Box
          justifyContent="Center"
          alignItems="Center"
          gap="200"
          style={{ padding: config.space.S300 }}
        >
          <Text style={{ color: color.Critical.Main }} size="T300">
            Failed to load messages.
          </Text>
          <Chip
            variant="SurfaceVariant"
            radii="Pill"
            outlined
            onClick={() => timelineSync.handleTimelinePagination(false)}
          >
            <Text size="B300">Retry</Text>
          </Chip>
        </Box>
      );
    }
  }

  const showBackPaginationSpinner =
    timelineSync.backwardStatus === 'loading' && timelineSync.eventsLength > 0;
  const showFrontPaginationSpinner =
    timelineSync.forwardStatus === 'loading' && timelineSync.eventsLength > 0;
  const hasPowerLevelState = !!room
    .getLiveTimeline()
    ?.getState(EventTimeline.FORWARDS)
    ?.getStateEvents(EventType.RoomPowerLevels, '');
  const hideTimelineForRoomState = roomSyncLoading && hideMemberInReadOnly && !hasPowerLevelState;
  const timelineBottomFloatLift =
    !atBottomState && isReady ? { bottom: `calc(${config.space.S400} + ${toRem(52)})` } : undefined;
  const timelineTopFloatLift =
    unreadInfo?.readUptoEventId && !unreadInfo?.inLiveTimeline && isReady
      ? { top: `calc(${config.space.S400} + ${toRem(52)})` }
      : undefined;

  let vListItemCount = timelineSync.eventsLength;
  if (showLoadingPlaceholders) vListItemCount = 3;
  // One row so the error and its Retry have somewhere to render.
  else if (showEmptyPaginationError) vListItemCount = 1;
  const vListIndices = useMemo(() => {
    // Keep the cache-busting timeline identity explicit for exhaustive-deps.
    void timelineSync.timeline;
    return Array.from({ length: vListItemCount }, (_, i) => i);
  }, [vListItemCount, timelineSync.timeline]);

  const processedEvents = useProcessedTimeline({
    items: vListIndices,
    linkedTimelines: timelineSync.timeline.linkedTimelines,
    ignoredUsersSet,
    hiddenEvents,
    mxUserId: mx.getUserId(),
    readUptoEventId: readUptoEventIdRef.current,
    hideMembershipEvents,
    hideNickAvatarEvents,
    isReadOnly,
    hideMemberInReadOnly,
  });

  processedEventsRef.current = processedEvents;

  /**
   * Fallback #4 (1.1.1): the WebKit plain list.
   *
   * Rows are real DOM, the window is a plain index range, and every scroll target comes from
   * `scrollHeight` — no list measurement anywhere, because the measurement is the bug (virtua
   * reported 635 px for a 33,370 px scroller on the device).
   */
  const plainRows = useMemo(
    () =>
      plainTimeline
        ? processedEvents.slice(plainWindow.start, plainWindow.end + 1)
        : processedEvents,
    [plainTimeline, processedEvents, plainWindow]
  );

  const plainScrollAtRef = useRef(0);
  const plainFillAttemptsRef = useRef(0);
  const plainFillLengthRef = useRef(0);
  // The first *rendered* row is the reader's anchor, and it is not the first processed event once
  // the window has slid. Kept as a plain value so the effects depend on an id, not an array.
  const firstRenderedId = plainRows[0]?.id;

  /** Only commit a window that actually changed — every helper returns a fresh object. */
  const commitPlainWindow = useCallback((next: PlainWindow, prev: PlainWindow) => {
    return next.start === prev.start && next.end === prev.end ? prev : next;
  }, []);

  useLayoutEffect(() => {
    if (!plainTimeline) return;
    const total = processedEvents.length;
    if (total === 0) {
      setPlainWindow((prev) => (windowLength(prev) === 0 ? prev : EMPTY_WINDOW));
      return;
    }
    const anchorId = scrollAnchorRef.current;
    const anchorIndex =
      anchorId === undefined ? -1 : processedEvents.findIndex((event) => event.id === anchorId);

    // Rows prepended at the front shift every existing row up. Detected by the first rendered id,
    // not by `start`: while holding, `start` deliberately does not move, so a start-based test
    // never fires on the case that matters.
    const previousFirstId = plainShiftRef.current.firstId;
    const renderedStart = plainShiftRef.current.start;
    const prependCount =
      previousFirstId !== undefined && previousFirstId !== firstRenderedId
        ? processedEvents.findIndex((event) => event.id === previousFirstId)
        : -1;

    setPlainWindow((prev) => {
      let next: PlainWindow;
      // A window that already moved is a grow-back, not a page prepend: the extra rows are already
      // in it, and only the scroll compensation is owed.
      const windowMoved = prev.start !== renderedStart;
      if (prependCount > 0 && !windowMoved && (plainHold || anchorIndex >= 0)) {
        next = extendForPrepend(prev, total, prependCount);
      } else if (anchorIndex >= 0) {
        next = containsIndex(prev, anchorIndex)
          ? reconcileWindow(prev, total, true, anchorIndex)
          : anchorWindow(total, anchorIndex);
      } else {
        next = reconcileWindow(prev, total, plainHold);
      }
      return commitPlainWindow(next, prev);
    });
  }, [plainTimeline, processedEvents, firstRenderedId, plainHold, commitPlainWindow]);

  /**
   * Keep the viewport on the same rows when content height changes above it.
   *
   * Runs after the reconcile effect, so it measures the height *with* the extension applied. The
   * correction is the measured `scrollHeight` delta — no row estimates, no index arithmetic.
   */
  useLayoutEffect(() => {
    if (!plainTimeline) return;
    const el = messageListRef.current?.firstElementChild as HTMLElement | null;
    if (!el) return;

    const previous = plainShiftRef.current;
    const height = el.scrollHeight;
    const prepended =
      previous.firstId !== undefined &&
      previous.firstId !== firstRenderedId &&
      processedEvents.some((event) => event.id === previous.firstId);

    if (prepended && previous.height > 0) {
      el.scrollTop = compensateForPrepend(el.scrollTop, previous.height, height);
    }

    plainShiftRef.current = { firstId: firstRenderedId, start: plainWindow.start, height };
  }, [plainTimeline, processedEvents, firstRenderedId, plainRows.length, plainWindow.start]);

  useLayoutEffect(() => {
    if (!plainTimeline) return undefined;
    const el = messageListRef.current?.firstElementChild as HTMLElement | null;
    if (!el || processedEvents.length === 0) return undefined;

    if (!hasInitialScrolledRef.current) {
      hasInitialScrolledRef.current = true;
      el.scrollTop = el.scrollHeight;
      setIsReady(true);
      return undefined;
    }
    if (atBottomRef.current) el.scrollTop = el.scrollHeight;
    return undefined;
  }, [plainTimeline, processedEvents.length, plainRows.length]);

  /**
   * Mount-time fill.
   *
   * Backfill runs only inside the scroll handler, and a window that does not overflow never
   * produces a scroll event — so a room that sync opens with a handful of events stays at those
   * rows forever, however tall the scroller is. virtua's initial scroll-to-bottom emits a scroll
   * event even when the list is short; assigning `scrollTop` on a non-overflowing plain scroller
   * changes nothing and emits nothing, so the plain path has to drive the first page itself.
   *
   * The window is set explicitly rather than grown: `growWindow` returns the same window when
   * `start` is already 0, and the tail-anchored reconcile stops including prepended pages once the
   * room passes the live tail, so growth would stall while attempts burned.
   *
   * Two guards, both deliberate. A page that returns nothing stops the pass (a room at the start of
   * history would otherwise spend every attempt on empty pages). And a collapsed scroller — where
   * `scrollHeight > 1` at `clientHeight === 0` — returns early: this covers "short window, no
   * overflow", not "the layout is broken", which only the chain numbers can decide.
   */
  useLayoutEffect(() => {
    if (!plainTimeline) return;
    const el = messageListRef.current?.firstElementChild as HTMLElement | null;
    if (!el || !hasInitialScrolledRef.current) return;

    const total = processedEvents.length;
    if (total === 0) return;
    if (el.scrollHeight > el.clientHeight + 1) return;
    if (plainFillAttemptsRef.current >= 5) return;
    if (!timelineSync.canPaginateBack || backwardStatusRef.current !== 'idle') return;
    if (plainFillAttemptsRef.current > 0 && total <= plainFillLengthRef.current) return;

    plainFillAttemptsRef.current += 1;
    plainFillLengthRef.current = total;
    void timelineSync.handleTimelinePagination(true);
    setPlainWindow({ start: 0, end: Math.min(total - 1, PLAIN_MAX_ROWS - 1) });
  }, [plainTimeline, processedEvents.length, timelineSync]);

  const handlePlainScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const el = event.currentTarget;
      notifyScroll();
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      const isNowAtBottom = distanceFromBottom < 100;
      if (isNowAtBottom !== atBottomRef.current) setAtBottom(isNowAtBottom);
      // Hold is a property of a scrollable list: a short room never enters it, and away from the
      // bottom the window stops chasing the tail. Both sides come from measured geometry.
      const scrollable = el.scrollHeight > el.clientHeight + 1;
      setPlainHold(scrollable && !isNowAtBottom);

      const now = Date.now();
      if (now - plainScrollAtRef.current < 300) return;
      plainScrollAtRef.current = now;

      const total = processedEventsRef.current.length;
      if (el.scrollTop < 500 && timelineSyncRef.current.canPaginateBack) {
        void timelineSyncRef.current.handleTimelinePagination(true);
        setPlainWindow((prev) => growWindow(prev, total, 'back'));
      } else if (distanceFromBottom < 500 && timelineSyncRef.current.canPaginateForward) {
        void timelineSyncRef.current.handleTimelinePagination(false);
        setPlainWindow((prev) => growWindow(prev, total, 'forward'));
      }
    },
    [notifyScroll, setAtBottom]
  );
  const previousProcessedEventIdsRef = useRef<string[] | undefined>(undefined);
  const processedEventIds = useMemo(
    () => processedEvents.map((event) => event.id),
    [processedEvents]
  );
  useLayoutEffect(() => {
    const previousIds = previousProcessedEventIdsRef.current;
    timelineDebug.arrival(
      previousIds?.length ?? 0,
      processedEventIds.length,
      vListRef.current,
      messageListRef.current,
      debugCtx()
    );
    previousProcessedEventIdsRef.current = processedEventIds;

    // Content keeps arriving after the initial scroll has fired (the device trace shows the window
    // growing for ~180 ms after a switch). While the reader is still meant to be at the bottom, keep
    // re-pinning instead of trusting the one scroll that ran against the first page.
    if (atBottomRef.current && scrollAnchorRef.current === undefined && eventId === undefined) {
      startBottomLatch();
    }
  }, [processedEventIds, debugCtx, eventId, startBottomLatch]);
  useLayoutEffect(() => {
    if (!pendingReadyRef.current) return;
    if (processedEvents.length === 0) return;
    pendingReadyRef.current = false;
    restoreScrollPosition();
    setIsReady(true);
  }, [processedEvents.length, restoreScrollPosition]);

  useEffect(() => {
    if (!onEditLastMessageRef) return;
    const ref = onEditLastMessageRef;
    ref.current = () => {
      const myUserId = mx.getUserId();
      const found = [...processedEventsRef.current]
        .toReversed()
        .find(
          (e) =>
            e.mEvent.getSender() === myUserId &&
            e.mEvent.getType() === (EventType.RoomMessage as string) &&
            !e.mEvent.isRedacted()
        );
      if (found?.mEvent.getId()) actions.handleEdit(found.mEvent.getId());
    };
  }, [onEditLastMessageRef, mx, actions]);

  useEffect(() => {
    viewportFillCountRef.current = 0;
  }, [room.roomId]);

  // Fill an initially short live timeline. Focused history is user-owned and must not
  // auto-continue after its anchor is released.
  useEffect(() => {
    if (scrollOwner !== 'live') return () => {};
    if (!canPaginateBackRef.current) return () => {};
    if (scrollAnchorRef.current !== undefined) return () => {};

    let rafId: number;
    let attempts = 0;
    const MAX_ATTEMPTS = 20;

    const check = () => {
      if (scrollAnchorRef.current !== undefined) return;

      const v = vListRef.current;
      if (!v) return;

      if (v.viewportSize === 0) {
        attempts += 1;
        if (attempts <= MAX_ATTEMPTS) rafId = requestAnimationFrame(check);
        return;
      }

      if (!canPaginateBackRef.current) return;
      if (backwardStatusRef.current !== 'idle') return;

      if (viewportFillCountRef.current >= MAX_VIEWPORT_FILL_PAGINATIONS) return;

      if (v.scrollSize <= v.viewportSize + 300) {
        viewportFillCountRef.current += 1;
        void timelineSyncRef.current.handleTimelinePagination(true, true);
      }
    };

    rafId = requestAnimationFrame(check);
    return () => cancelAnimationFrame(rafId);
  }, [room.roomId, scrollOwner, timelineSync.eventsLength, timelineSync.backwardStatus]);

  return (
    <Box grow="Yes" style={{ position: 'relative', minWidth: 0, minHeight: 0, width: '100%' }}>
      {(hideTimelineForRoomState || (roomSyncLoading && timelineSync.eventsLength === 0)) && (
        <Box
          justifyContent="Center"
          alignItems="Center"
          style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}
        >
          <Spinner variant="Secondary" size="400" />
        </Box>
      )}
      {unreadInfo?.readUptoEventId && !unreadInfo?.inLiveTimeline && isReady && (
        <TimelineFloat position="Top" style={{ background: 'transparent' }}>
          <Chip
            variant="Primary"
            radii="Pill"
            outlined
            before={chipIcon(ChatTeardropDots)}
            onClick={() => jumpToEvent(unreadInfo.readUptoEventId)}
          >
            <Text size="L400">Jump to Unread</Text>
          </Chip>
          <Chip
            variant="SurfaceVariant"
            radii="Pill"
            outlined
            before={chipIcon(Checks)}
            onClick={() => markAsRead(mx, room.roomId, hideReads, true)}
          >
            <Text size="L400">Mark as Read</Text>
          </Chip>
        </TimelineFloat>
      )}

      <div
        ref={messageListRef}
        data-testid="timeline"
        style={{
          flex: 1,
          minHeight: 0,
          width: '100%',
          overflow: 'hidden',
          position: 'relative',
          // A tile that WebKit drops on a freshly mounted virtual list shows whatever is behind
          // the timeline, which was the window colour. Paint the room surface here, on the
          // wrapper rather than the scroller: the wrapper is a separate element, so its background
          // is not part of the layer whose tiles get dropped. `Surface.Container` is the token the
          // native app puts behind the timeline (#121e35 dark / #e6ecf5 light); using
          // `Background.Container` instead made the timeline a shade darker than the composer.
          background: color.Surface.Container,
          opacity: hideTimelineForRoomState ? 0 : 1,
        }}
      >
        <TimelineScrollingProvider value={isTimelineScrolling}>
          {plainTimeline ? (
            <div
              id="timeline-scroller"
              data-testid="timeline-plain"
              className={css.messageList}
              style={{
                // `flex: 1` was inert in a block wrapper, and a percentage height depends on that
                // same chain resolving on WebKit. Absolute inset does not depend on either: the
                // wrapper is already `position: relative`, so the scroller takes its box outright.
                position: 'absolute',
                inset: 0,
                // The browser's own scroll anchoring fights the explicit window arithmetic on a
                // plain list: rows above the viewport are added and dropped by the reducer.
                overflowAnchor: 'none',
              }}
              onScroll={handlePlainScroll}
            >
              {/* Bottom-aligns a short room without putting `justify-content` on the scroller,
                  which WebKit clips. */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  minHeight: '100%',
                  paddingTop: config.space.S600,
                  paddingBottom: config.space.S600,
                }}
              >
              {plainRows.map((eventData, index) => (
                <MemoizedTimelineItem
                  key={`${eventData.id}:${eventData.isRedacted ? 'redacted' : 'message'}`}
                  eventData={eventData}
                  index={plainWindow.start + index}
                  showLoadingPlaceholders={showLoadingPlaceholders}
                  canPaginateBack={timelineSync.canPaginateBack}
                  backPaginationJSX={backPaginationJSX}
                  room={room}
                  messageLayout={messageLayout}
                  messageSpacing={messageSpacing}
                  settings={settings as unknown as Record<string, unknown>}
                  permissions={rowPermissions}
                  renderMatrixEvent={renderMatrixEvent}
                  focusItem={timelineSync.focusItem}
                  editId={editId}
                  activeReplyId={activeReplyId}
                  openThreadId={openThreadId}
                />
              ))}
              </div>
            </div>
          ) : (
            <VList<ProcessedEvent>
              key={timelineListKey}
              ref={vListRef}
              data={processedEvents}
              // `shift` is virtua's own scroll compensation for items prepended to the list. This
              // timeline already compensates manually (`restoreScrollPosition`, `scrollAnchorRef`,
              // the top spacer), and the two fighting is a candidate for the empty viewport the
              // recording shows mid-fling: correct `scrollSize`, one 54 px row rendered. Off for now;
              // the app's own anchoring has to carry it.
              shift={false}
              id="timeline-scroller"
              className={css.messageList}
              style={{
                flex: 1,
                minHeight: 0,
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                paddingTop: topSpacerHeight > 0 ? topSpacerHeight : config.space.S600,
                paddingBottom: config.space.S600,
              }}
              onScroll={handleVListScroll}
              onScrollEnd={handleVListScrollEnd}
            >
              {(eventData, index) => (
                <MemoizedTimelineItem
                  key={
                    eventData
                      ? `${eventData.id}:${eventData.isRedacted ? 'redacted' : 'message'}`
                      : `placeholder-${index}`
                  }
                  eventData={eventData}
                  index={index}
                  showLoadingPlaceholders={showLoadingPlaceholders}
                  canPaginateBack={timelineSync.canPaginateBack}
                  backPaginationJSX={backPaginationJSX}
                  room={room}
                  messageLayout={messageLayout}
                  messageSpacing={messageSpacing}
                  settings={settings as unknown as Record<string, unknown>}
                  permissions={rowPermissions}
                  renderMatrixEvent={renderMatrixEvent}
                  focusItem={timelineSync.focusItem}
                  editId={editId}
                  activeReplyId={activeReplyId}
                  openThreadId={openThreadId}
                />
              )}
            </VList>
          )}
        </TimelineScrollingProvider>
      </div>
      {selectedMediaEventId && (
        <RoomMediaViewer
          items={roomMedia}
          selectedEventId={selectedMediaEventId}
          selectEvent={setSelectedMediaEventId}
          requestClose={() => setSelectedMediaEventId(undefined)}
        />
      )}

      {showBackPaginationSpinner && (
        <TimelineFloat position="Top" style={timelineTopFloatLift}>
          <Spinner variant="Secondary" size="400" style={{ backgroundColor: 'transparent' }} />
        </TimelineFloat>
      )}

      {showFrontPaginationSpinner && (
        <TimelineFloat position="Bottom" style={timelineBottomFloatLift}>
          <Spinner variant="Secondary" size="400" style={{ backgroundColor: 'transparent' }} />
        </TimelineFloat>
      )}

      {frontPaginationJSX && (
        <TimelineFloat position="Bottom" style={timelineBottomFloatLift}>
          {frontPaginationJSX}
        </TimelineFloat>
      )}

      {(!atBottomState || !timelineSync.liveTimelineLinked) && (
        <TimelineFloat position="Bottom">
          <Chip
            variant="SurfaceVariant"
            radii="Pill"
            outlined
            before={chipIcon(ArrowDown)}
            onClick={() => {
              scrollAnchorRef.current = undefined;
              if (eventId) navigateRoom(room.roomId, undefined, { replace: true });
              timelineSync.focusLiveTimeline();
              setAtBottom(true);
              scrollToBottom();
            }}
            style={{
              WebkitUserSelect: 'none',
              msUserSelect: 'none',
              userSelect: 'none',
              MozUserSelect: 'none',
            }}
          >
            <Text size="L400">Jump to Latest</Text>
          </Chip>
        </TimelineFloat>
      )}
    </Box>
  );
}
