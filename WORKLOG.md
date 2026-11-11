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
- **The line is on origin.** `release/1.1.1` pushed (`15964b0` plus this docs commit); `origin/main`
  = `0fe0e5c` (fast-forward from `3416a70`, no force); `fix/pronoun-residue-main` deleted locally and
  on origin. `git ls-remote` after the push shows no other head or tag moved.
- **The 15 waived failures triaged** (`mrx/main/test-triage`): 14 stale tests, 1 product bug.
  - *Branding/domain* — `pushCallNotificationCopy` (body copy says "Sable"), `TelemetryConsentBanner`
    (aria-label "Help improve Maretrix"), `Desktop` ×2 and `KeyboardShortcuts` (visible copy says
    Maretrix), `platform` ×2 (`getAppOrigin` deliberately returns `https://app.daiwascarlet.com`),
    `Themes` ×3 (theme id `dracula` is labelled **Scarlet** in `$plugins/arborium/themes.ts`).
  - *Paths/hashes* — `edgeToEdgeInsets` (hardcodes `moe/sable/client/MainActivity.kt`; the generated
    project is `com/daiwascarlet/maretrix/MainActivity.kt`), `useTimelineEventRenderer` ×2 (snapshot
    differs only in vanilla-extract class hashes; DOM and text identical).
  - *Timezone* — `useProcessedTimeline` (fixed UTC instants straddle a local-day boundary only east of
    UTC; `inSameDay` uses local `getDate()`, so it fails at UTC−7 and passes at UTC — flaky test).
  - *Product bug* — `TauriDeepLinkBridge`: see Open #7.

## Open

1. **Device pass on 0.54.2 — the gate for 1.1.1.** Deployed `446ab78`: container `maretrix` started
   `2026-11-11T05:16:21Z`, image `sha256:8dc0afbd6d0f…`, edge serves `assets/page-CxHAT_fx.js`, and
   that chunk's sourcemap resolves `node_modules/.pnpm/virtua@0.54.2_…/virtua/lib/index.js` with
   `virtua@0.50.1` absent — the live artifact is provably 0.54.2, not frozen-lockfile faith. About
   reads **`v1.1.1-dev`** (no hash: `.git` is excluded from the build context, and `-dev` follows from
   `git describe` being unable to find a tag there); only **`v1.1.0` voids a run**. One line per
   scenario — About version, deploy stamp, rendered range (`rend:[first,last]` and `now.rows` from
   `__maretrixTL.report()`), RO-loop error yes/no. Clear the sampler between scenarios.

   | # | Scenario | About | Deploy | rendered range | RO error | Verdict |
   |---|---|---|---|---|---|---|
   | 1 | cold open a room | | 05:16:21Z | | | |
   | 2 | switch rooms repeatedly | | 05:16:21Z | | | |
   | 3 | leave and return | | 05:16:21Z | | | |
   | 4 | empty room that grows | | 05:16:21Z | | | |
   | 5 | fling while scrolled up | | 05:16:21Z | | | |
   | 6 | live message while scrolled up | | 05:16:21Z | | | |
   | 7 | PWA vs native app | | 05:16:21Z | | | |

   Done when every row is filled and the item carries a verdict: **fixed** → peel the workarounds
   (Open #3); **not fixed** → fallback #4. Nothing else opens until then.

   **2026-11-11: measured, not fixed.** Blank on every room change (1.1.0 at least kept the latest
   message), occasional bottom gap, and the RO loop now fires on every scroll — up to 23 repeats —
   rather than only at mount. The sampler names the mechanism: every mount records
   `scrollSize = viewportSize = 635` while the live DOM is 33,370 px tall, so virtua's index maths is
   off by ~50× — that is the "scrolled up days-to-weeks" the tester hit, and mount 1 rendered **zero**
   rows for the whole trace window. Fallback #4 opens; evidence and rows live in
   [`docs/1.1.1-ios-device-pass/2026-11-11/`](docs/1.1.1-ios-device-pass/2026-11-11/notes.md).
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
6. **Release hygiene, only after a verified fix:** all six version-bearing files → 1.1.1 (enumerated
   in `VERSIONS.md`), CHANGELOG 1.1.1 section, tag.
7. **Native SSO login dead-ends — product bug, found by triage.** `SSOTauri.ts` still builds
   `sable://login/…` and rejects `maretrix://` callbacks, but the app registers only `maretrix` and
   `com.daiwascarlet.maretrix` (`tauri.conf.json` deep-link, AndroidManifest intent-filter). The
   browser redirect therefore cannot reach the app, and a callback that did arrive would be dropped
   as a protocol mismatch. `SSOTauri.test.ts` asserts the broken scheme, which is why the suite never
   caught it. User-visible: **"Sign in with SSO from a native app dead-ends."** Target: 1.1.1 as
   platform breakage (one constant + the test assertions), otherwise 1.2.0 — owner's call.
8. **Pagination may be attaching events to the wrong timeline — new, from the 2026-11-11 capture.**
   15 events were rejected in one short console capture
   (`EventTimelineSet.addEventToTimeline: Ignoring event=… that does not belong in timeline=<roomId>:<timestamp>`),
   13 of them for one room, while 16 `/messages` requests were issued. The timeline id carries a
   creation timestamp, so the fetch lands in a timeline instance that is not the one rendering. Not
   explained by virtua and not ruled out as a cause of the weeks-long jumps: if the rendered window
   never receives what was paginated, no renderer can anchor on it. Read the pagination path before
   the plain-list reducer derives its window from event indices.

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
- **The 15 other pre-existing test failures ship waived; they do not block the tag.** Gating the iOS
  fix on an untriaged suite is worse than a written waiver, and repairing them is not 1.1.1 scope:
  `TelemetryConsentBanner` (banner with DSN configured, no saved preference); `Themes` ×3 (sections
  split, manual app/code-block theme settings, system code-block theme on chip change); `Desktop` ×2
  (close/tray settings, tray-icon-unavailable copy); `KeyboardShortcuts` (toggle-window shortcut in
  the Global category); `useProcessedTimeline` (indexed next-day reaction after intervening
  messages); `useTimelineEventRenderer` ×2 (unknown state-event fallback, unknown non-state fallback
  — both snapshots); `TauriDeepLinkBridge` (SSO callback nonce match); `edgeToEdgeInsets` (MainActivity
  out of the inset injection path); `platform` ×2 (`getAppOrigin` inside Tauri / on
  `tauri.localhost`); `pushCallNotificationCopy` (generic room-call copy when previews are hidden).
  **Clause:** if triage finds a product bug among them it becomes a CHANGELOG known-issue (or gets
  its own target line) — a waiver never lets a bug pass silently.
- **Forward-port by direct push, not a PR.** The pull-request endpoints are unreachable for this
  credential (404 on `/pulls`, admin permissions notwithstanding), and a UI round trip adds review
  value of zero when the patch-id is identical (`cc23fc6` in both `1a5ba1b` and `0fe0e5c`). `main`
  carries no workaround commits: do not push local `main` (it is `origin/main` + `5eaf1d5`), and it
  stays at shipped state until 1.1.1 merges back.
- **Six version-bearing files, not two** — `package.json`, `src-tauri/tauri.conf.json`,
  `src-tauri/Cargo.toml`, the `maretrix` entry in `src-tauri/Cargo.lock`,
  `packaging/arch/PKGBUILD` (`pkgver` + `_gh_tag`) and `packaging/arch/.SRCINFO`. `e1e5398` moved all
  six in one commit; a stale `_gh_tag` ships an Arch package pointing at the previous tarball.
  `VERSIONS.md` carries the enumeration.
- **Deploy stamp names the build.** Scenario C passes
  `--build-arg VITE_BUILD_HASH=$(git rev-parse --short HEAD)` so the deployed About line carries its
  commit. Chunk names are only comparable between builds with identical args — the hash literal is
  part of the content, so an edge-vs-image chunk match proves a shared *build*, not shared source.
  The deployed sourcemap is the stronger check: it resolves the exact pnpm path of every dependency.
- **Checks run on Node 24.18.0** (the CI pin in `.github/workflows/build.yml`). On Node 26 the suite
  reports 319 failures from `localStorage` being unavailable in the runtime, which is noise, not a
  regression.
- One worktree per release line; 1.2.0 gets its own worktree when it starts.
- Long work runs in a dedicated session (`mrx/<line>/<topic>`), never in a room turn.
- Signing stays ad-hoc; no Developer ID or notarization.
