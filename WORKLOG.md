# Worklog

## Settled

- **1.1.0 shipped.** Native clients (macOS, Windows NSIS, Linux), Linux installable, rc1 → rc2 →
  1.1.0 collapsed into one changelog entry. See `CHANGELOG.md`.
- **virtua 0.50.1 → 0.54.2** (`24283aa`). `pnpm why virtua` → one version, `0.54.2`. Lockfile and
  `package.json` only; the app-layer workarounds are untouched. Lint, typecheck and the failing-test
  set are identical before and after the bump, so locally the two versions are indistinguishable —
  only the device pass can tell them apart. `pnpm build` exit 0, `dist/sw.js` written (67 precache
  entries).
- **Pronoun residue cleared** (`1a5ba1b`). 16 lint errors + the TS2488 typecheck error, all inherited
  from the fork baseline (present on `main` at `Message.tsx:239`). Deleted the dead pronoun helpers
  (`MorePronounsPill`, `clamp`, the unreachable body of `Pronouns` — which still returns `null` and
  keeps its `as<'span', …>` shape for call sites), plus unused locals/imports in `UserRoomProfile`,
  `Profile`, `PerMessageProfileOverview` and the unused `isMobile` parameter in `SettingsTab`
  (kept in its props type). `pnpm lint` exit 0, `pnpm typecheck` exit 0, `pnpm test:run` failure set
  diffs empty against `ce78d51` (11 files / 18 tests, 3136 passed).

## Open

1. **Device pass on 0.54.2 — the gate for 1.1.1.** Build `1a5ba1b` (or later) and measure on iOS
   WebKit. Done when this item carries the measured rendered range from 0.54.2 across the item-5
   scenarios plus a verdict: **fixed**, or **go to fallback #4**. Nothing else opens until then.
2. **Root cause, named but unfixed.** On iOS WebKit the room mounts at **0 px** height; virtua turns
   that into its viewport, the box then expands, and WebKit drops the resize notification
   (`ResizeObserver loop completed with undelivered notifications`), leaving a one-row range —
   `rendered: 0` in a 5–6k px scroller. Evidence: the `Maretrix 1.1.1` session (Nov 4–7) and its
   deploy traces (`v15: wrap 0, par 0`). The 8 commits on this line are workarounds around it.
   Releases between 0.50.1 and 0.54.2 address exactly this class: `0.50.6` imperative-scroll race
   during measurement, `0.51.3` viewport measurement with `position: fixed`, `0.52.10` blank viewport
   after hidden/detached, `0.53.6` blank viewport when scrolled before mount, `0.54.0` suppress the
   ResizeObserver loop error.
3. **Peel the workaround stack.** The 1px width nudge, rAF re-measure, `pinHeight` observer and
   first-paint hold each compensate for 0.50.x behaviour. Remove them one at a time against a
   measured pass, not all at once.
4. **Fallback if 0.54.2 still fails:** on WebKit, render a bounded plain list (last ~150 messages,
   `content-visibility: auto`, `contain-intrinsic-size`) instead of virtualizing. Rooms at this size
   do not need true virtualization; this removes the measurement dependency entirely.
5. **Device verification scenarios** (the only pass/fail that counts): cold open a room, switch rooms
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
- **Pass 2 (peeling the workarounds) does not open on a green CI.** Locally 0.54.2 and 0.50.1 are
  indistinguishable, so the device pass decides; a green local run is not evidence.
- **Release checklist gates on lint + typecheck green** on the release commit. The pronoun residue
  was fixed as its own commit on this line and forward-ported to `main` the same day, because TS2488
  shipped in 1.1.0. Scope was the errors only — no warning sweep, no refactor, no version-field
  movement.
- **Leave the three `RoomTimeline.test.tsx` failures alone.** They belong to the workaround stack and
  die with the peel; do not pre-fix them.
- **Checks run on Node 24.18.0** (the CI pin in `.github/workflows/build.yml`). On Node 26 the suite
  reports 319 failures from `localStorage` being unavailable in the runtime, which is noise, not a
  regression.
- One worktree per release line; 1.2.0 gets its own worktree when it starts.
- Long work runs in a dedicated session (`mrx/<line>/<topic>`), never in a room turn.
- Signing stays ad-hoc; no Developer ID or notarization.
