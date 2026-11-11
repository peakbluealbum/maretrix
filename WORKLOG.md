# Worklog

## Settled

- **1.1.0 shipped.** Native clients (macOS, Windows NSIS, Linux), Linux installable, rc1 → rc2 →
  1.1.0 collapsed into one changelog entry. See `CHANGELOG.md`.

## Open

1. **Root cause, named but unfixed.** On iOS WebKit the room mounts at **0 px** height; virtua turns
   that into its viewport, the box then expands, and WebKit drops the resize notification
   (`ResizeObserver loop completed with undelivered notifications`), leaving a one-row range —
   `rendered: 0` in a 5–6k px scroller. Evidence: the `Maretrix 1.1.1` session (Nov 4–7) and its
   deploy traces (`v15: wrap 0, par 0`). The 8 commits on this line are workarounds around it.
2. **Upgrade virtua before writing another workaround.** The repo pins `virtua@^0.50.1`; upstream is
   `0.54.2` and the releases in between fix this exact class of bug:
   - `0.50.6` race when imperative scroll runs during measurement
   - `0.51.3` viewport measurement with `position: fixed`
   - `0.52.10` blank viewport after it is hidden or detached
   - `0.53.6` blank viewport when it is scrolled before mount
   - `0.54.0` suppress `ResizeObserver loop completed with undelivered notifications`
   Bump to `0.54.2`, rebuild, and re-test on device before touching the app-layer workarounds.
3. **Peel the workaround stack.** The 1px width nudge, rAF re-measure, `pinHeight` observer and
   first-paint hold each compensate for 0.50.x behaviour. Remove them one at a time against a
   measured pass, not all at once.
4. **Fallback if 0.54.2 still fails:** on WebKit, render a bounded plain list (last ~150 messages,
   `content-visibility: auto`, `contain-intrinsic-size`) instead of virtualizing. Rooms at this size
   do not need true virtualization; this removes the measurement dependency entirely.
5. **Device verification** (the only pass/fail that counts): cold open a room, switch rooms
   repeatedly, leave and return, empty room that grows, fling while scrolled up, live message while
   scrolled up, PWA vs native app.
6. **Release hygiene, only after a verified fix:** `tauri.conf.json` → 1.1.1, CHANGELOG 1.1.1
   section, tag.

## Blocked

- **1.1.1 does not ship without a device pass.** A fix release that does not fix the bug is worse
  than no release.
- **1.2.0** — not started by design. Start only when 1.1.1 is done or clearly trending correctly.
  Prerequisite: merge `release/1.1.1` back into `main` so 1.2.0 branches from the shipped state.

## Decisions

- The 8-commit branch is **evidence, not a release**. Keep the history until the fix is known; do not
  squash it into a tidy story that hides which approaches were tried.
- Upgrade the library before layering more app-side compensation.
- One worktree per release line; 1.2.0 gets its own worktree when it starts.
- Long work runs in a dedicated session (`mrx/<line>/<topic>`), never in a room turn.
- Signing stays ad-hoc; no Developer ID or notarization.
