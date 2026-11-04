import { globalStyle, style } from '@vanilla-extract/css';
import type { RecipeVariants } from '@vanilla-extract/recipes';
import { recipe } from '@vanilla-extract/recipes';
import { DefaultReset, color, config, toRem } from 'folds';

export const TimelineFloat = recipe({
  base: [
    DefaultReset,
    {
      position: 'absolute',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 10,
      minWidth: 'max-content',
      overflow: 'hidden',
      borderRadius: config.radii.Pill,
      background: 'transparent',
    },
  ],
  variants: {
    position: {
      Top: {
        top: config.space.S400,
      },
      Bottom: {
        bottom: config.space.S400,
      },
    },
  },
  defaultVariants: {
    position: 'Top',
  },
});

export type TimelineFloatVariants = RecipeVariants<typeof TimelineFloat>;
export const messageList = style({
  overflowY: 'scroll',
  // Keep the rubber-band inside the timeline: without this the overscroll chains to the document,
  // the whole page bounces, and every one of those scroll events feeds the "are we at the bottom?"
  // logic while the list is mid-gesture.
  overscrollBehavior: 'contain',
  scrollbarGutter: 'stable',
  overflowAnchor: 'none',
  // WKWebView (Tauri iOS) can leave the visible tiles of a freshly mounted virtual list
  // unpainted — the native window colour shows through the timeline until any user
  // interaction forces an invalidation. virtua's own docs blame imperative scrollTop
  // updates during mount (inokawa/virtua#362), which is exactly what the initial
  // scroll-to-bottom does. Promoting the scroller to its own compositing layer hands tile
  // rasterisation to the compositor, which paints the range on the next frame instead of
  // waiting for a scroll/tap. Cost: one extra layer for the timeline.
  transform: 'translateZ(0)',

  '@supports': {
    '(-moz-appearance: none)': {
      scrollbarWidth: 'auto',
      selectors: {
        '&:hover': {
          scrollbarColor: `${color.SurfaceVariant.ContainerLine} ${color.SurfaceVariant.ContainerActive}`,
        },
      },
    },
  },

  selectors: {
    '&::-webkit-scrollbar': {
      width: toRem(16),
      height: toRem(16),
    },
    '&::-webkit-scrollbar-corner': {
      backgroundColor: 'transparent',
    },
    '&::-webkit-scrollbar-thumb': {
      backgroundColor: 'transparent',
      borderRadius: config.radii.Pill,
      minHeight: toRem(35),
      border: `${toRem(4)} solid transparent`,
      backgroundClip: 'padding-box',
    },
    '&::-webkit-scrollbar-track': {
      backgroundColor: 'transparent',
      borderRadius: config.radii.Pill,
      border: `${toRem(4)} solid transparent`,
      backgroundClip: 'padding-box',
    },
    '&:hover::-webkit-scrollbar-thumb, &:has(*:hover)::-webkit-scrollbar-thumb': {
      backgroundColor: color.SurfaceVariant.ContainerLine,
    },
    '&:hover::-webkit-scrollbar-track, &:has(*:hover)::-webkit-scrollbar-track': {
      backgroundColor: color.SurfaceVariant.ContainerActive,
    },
  },
});
globalStyle(`${messageList} > *`, {
  scrollbarWidth: 'auto',
  scrollbarColor: 'auto',
});

globalStyle(`body ${messageList} > *`, {
  overflowAnchor: 'none',
});

globalStyle(`body ${messageList} [data-message-id]`, {
  transition: 'background-color 0.1s ease-in-out !important',
  position: 'relative',
  zIndex: 1,
});

globalStyle(`body ${messageList} [data-message-id]:hover`, {
  backgroundColor: 'var(--sable-surface-container-hover) !important',
  zIndex: 2,
});

globalStyle(`body ${messageList} [data-message-id]:focus-within`, {
  zIndex: 10,
});
