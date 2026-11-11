# Worklog

## Settled

- **1.1.0 shipped.** Native clients (macOS, Windows NSIS, Linux), Linux installable, rc1 → rc2 →
  1.1.0 collapsed into one changelog entry. See `CHANGELOG.md`.

## Open

1. **Version drift.** `src-tauri/tauri.conf.json` is `1.1.0` while `package.json` is `1.1.1`. Both
   must be `1.1.1` before any build is tagged.
2. **Changelog.** `CHANGELOG.md` has no 1.1.1 section. It needs: iOS WebKit timeline fixes (the
   one-item-mount / latch / re-measure work), the macOS build-script rustc pin, and the Android/iOS
   behaviour note if it changed.
3. **History.** `release/1.1.1` currently carries the 8-commit experiment log from
   `1.1.1-webkit-timeline`, including one commit that reverts an earlier approach. The branch is
   unpushed, so the history can be rewritten locally: squash the timeline iterations into one or two
   commits with messages that describe the final behaviour, not the dead ends.
4. **`timelineDebug.ts` (+182 lines).** Intentional iOS sampler, not leftover debug: on by default on
   iOS WebKit, `?tldebug=0` disables, `?tldebug=1` forces everywhere. Decision needed: ship as-is, or
   force it off in release builds and keep it behind the query flag only.
5. **No tests touched.** A 200-line change to `RoomTimeline.tsx` with zero test or checklist changes.
   Minimum: a documented manual verification list (open a room, scroll to bottom, leave and return,
   room that starts empty then grows, live message while scrolled up) and, if feasible, one automated
   latch/measurement check.
6. **Build verification.** macOS universal build via `scripts/build-macos-local.sh` (rustc pin), and
   a device pass on iOS WebKit before tagging.

## Blocked

- **1.2.0** — not started by design. Start only when 1.1.1 is done or clearly trending correctly.
  Prerequisite: merge `release/1.1.1` back into `main` so 1.2.0 branches from the shipped state.

## Decisions

- One worktree per release line; 1.2.0 gets its own worktree when it starts.
- Long work runs in a dedicated session (`mrx/<line>/<topic>`), never in a room turn.
- Signing stays ad-hoc; no Developer ID or notarization.
