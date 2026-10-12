import type { CSSProperties } from 'react';

/**
 * Scarlet accent tokens for interactive chrome — action icons and notification
 * badges. The halo comes from `--sable-accent-glow`, so a theme can tune or drop
 * it without touching any call site.
 */
export const accentIconStyle: CSSProperties = {
  color: 'var(--sable-primary-main)',
  filter: 'var(--sable-accent-glow)',
};

/** Just the halo, for icons that already take their colour from a `color` prop. */
export const accentGlowStyle: CSSProperties = {
  filter: 'var(--sable-accent-glow)',
};

/** Solid accent pill for notification-count badges, replacing the blue-grey. */
export const accentBadgeStyle: CSSProperties = {
  backgroundColor: 'var(--sable-primary-main)',
  color: 'var(--sable-primary-on-main)',
};
