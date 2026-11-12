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

   Done when every row is filled and a device pass says the iOS timeline is fixed. There is no
   "not fixed, defer" branch: the line stays open until that pass exists (see Decisions).

   **2026-11-11 (first run): measured, not fixed.** Blank on every room change (1.1.0 at least kept
   the latest
   message), occasional bottom gap, and the RO loop now fires on every scroll — up to 23 repeats —
   rather than only at mount. The sampler names the mechanism: every mount records
   `scrollSize = viewportSize = 635` while the live DOM is 33,370 px tall, so virtua's index maths is
   off by ~50× — that is the "scrolled up days-to-weeks" the tester hit, and mount 1 rendered **zero**
   rows for the whole trace window. Fallback #4 opened; evidence and rows live in
   [`docs/1.1.1-ios-device-pass/2026-11-11/`](docs/1.1.1-ios-device-pass/2026-11-11/notes.md).

   **2026-11-11 (second run): fallback #4 built and deployed** (`7335a42`, container started
   `2026-11-11T08:44:00Z`, image `sha256:c63d0411af5d…`, edge chunk `page-Bwfzz9oM.js`). On iOS the
   timeline now renders a bounded plain list — 150 rows live, 400 cap, sliding growth both ways so a
   jump older than the bound can still scroll down to the newest message; initial scroll from
   `scrollHeight`; no virtua, no latch, no workaround stack. `?plainlist=0` forces the virtual path
   back for A/B, `?plainlist=1` forces the plain path anywhere. Awaiting the canary.

   **2026-11-12 — `05d02e8` on staging** (`09:13:38Z`, chunk `page-CtZmmMsX.js`): the window is derived
   during render (`nextPlainWindow`) so the commit that first sees a page already slices past it, and the
   plain path re-pins the bottom for eight frames while the reader is at the bottom. Pending a device pass
   on both gestures.

   **2026-11-12 — 1.2.0 follow-ups from review:** `nextPlainWindow` tests the prepend branch before the
   anchor, so a jump page landing in the same commit as a prepend extends instead of centring; and the
   "derived during render" claim has no component-level (jsdom) regression test — only the pure transition.

   **2026-11-11 — anchor compensation (`e1d486c` + `fd48292` nit) on staging** (`12:24:25Z`, chunk
   `page-Ca1xS7f5.js`). The gate that stops premature backfill and the anchor that keeps the reader's row
   fixed are both in: the scroll correction measures the first rendered row's content-space offset before
   and after the commit, so a cap-sized window that adds rows above and drops rows below no longer drifts.
   29 window tests, typecheck and lint green.

   **2026-11-11 — staging re-checked read-only (pm):** `https://appdev.daiwascarlet.com/` serves
   `assets/page-Ca1xS7f5.js` — the anchor build — while production serves a different chunk
   (`page-CXK2pRjJ.js`). The pass is unambiguously against staging, and nothing has moved since the
   deploy.

   **2026-11-11 — landmark on `29d8c07`:** encrypted rooms load without crashing, the timeline paints on
   every channel switch, hard flings are no longer jittery. Unencrypted and encrypted both pass; the one
   remaining defect was the history jump on scroll-up, caused by using a row's absolute index as a prepend
   count. Fixed in `d8943fa` with the case pinned at a 2,600-row window; `63c5c74` corrects the assertion
   to the row the reader was actually on. Deployed to staging `11:47:10Z`, chunk `page-CzahqwkQ.js`.

   **2026-11-11 — `29d8c07` on staging** (started `11:28:20Z`, edge chunk `page-CRJVdBa0.js`), the
   first candidate with the update-storm guard. The decisive test is an encrypted room: `plain-fill`
   should read 2 with no repeats and `RoomState.events` should stay flat.

   **2026-11-11 — encryption is the discriminator (device, `6a218dc`).** Unencrypted rooms on the
   plain path **fill and scroll normally, no crash**. Encrypted rooms soft-crash on opening the
   timeline (`#185`, 51 `RoomState.events` listeners) once a page starts filling. So the renderer,
   the fill and the window maths now have a device pass on unencrypted rooms — the first real
   evidence that path works — and the remaining defect is the interaction with asynchronous
   decryption. `29d8c07` guards the per-render `setPlainWindow` that produced the update storm; it
   is the next candidate for an encrypted room, not a speculative rewrite.

   **Read this before trusting any "no change" report on this line:** the installed PWA serves its own
   precache, so a device session can test a bundle that predates the fix. Two of the reports below may
   be exactly that, and the log should not be read as two failed fixes until the *installed* app's
   About string is recorded. First fact of every session: About from the home-screen app
   (`(7335a42)` or no hash = the fix was never on the device). The private tab answers a different
   question — whether the layout resolves on the edge bundle — because its cache is always fresh.

   **2026-11-11 (third run): the plain scroller was collapsed** — `flex: 1` inside a block wrapper is
   inert, so the scroller took its content height, never overflowed, and the wrapper's
   `overflow: hidden` clipped the rest: newest row at the top of an empty box, no scrolling possible.
   Fixed in `dc77085` (container started `2026-11-11T09:00:45Z`, image `sha256:6a8738fab7d8…`, edge
   `page-C8jcykVL.js`): the scroller owns `height: 100%` of the wrapper and a short room is
   bottom-aligned by an inner `min-height: 100%` column, never `justify-content` on the scroller.
   Verified in Chromium with the same nesting (680 px scroller in a 680 px wrapper: 2 rows bottom-aligned
   with no overflow, 60 rows `scrollTop` 1720 = max and the last row flush with the scroller bottom).

   **2026-11-11 (fourth run): hold mode.** The layout was not the only thing wrong — every backward
   page was undone on the next render, because `reconcileWindow(prev, total, false)` re-sliced the
   newest 150 rows whenever no jump anchor was set, and normal scrolling never sets one. The window
   now holds once the reader leaves the bottom (`plainHold`), prepended rows are compensated with a
   `scrollHeight` delta, and hold is released when the reader returns to the bottom. `517d2cb`,
   container started `2026-11-11T09:12:02Z`, image `sha256:25d1d612c9be…`, edge `page-B0ZJ2r9N.js`.

   **Real-user crash from the loop, 2026-11-11.** A user of the live PWA tapped the "new update"
   banner and got the error boundary: `Minified React error #185` (maximum update depth exceeded),
   stack frame in `assets/page-C8jcykVL.js` — the `dc77085` build, i.e. **before** the identity guard.
   That is the unguarded `setPlainWindow` in the reconcile effect @review caught, confirmed in the
   wild rather than merely inferred. Fixed in `ac45e4e`/`32ce410`; the edge is on `32ce410`. A reload
   re-serves the same precache, so the recovery is delete-and-re-add the home-screen app.
   Also observed while checking: old chunk names are **not** retained — `/assets/page-C8jcykVL.js`
   now answers `200` with the SPA shell (`7752` bytes = `index.html`), not a 404. A stale precache
   that asks for a removed chunk therefore receives HTML where it expects JavaScript.

   **2026-11-11 (fifth run): `32ce410` — inset.** Deployed `2026-11-11T09:45:32Z`, image
   `sha256:76496f8d1833…`, edge `page-bFQ5k_ii.js`. The scroller is `position: absolute; inset: 0`,
   which never asks a percentage question.

   **2026-11-11 (sixth run): `ed2f1cf` — solver + the two production fixes.** Container started
   `2026-11-11T10:03:10Z`, image `sha256:fb09b920f991…`, edge chunk `page-CNzCkQa2.js`. Verified from
   outside the edge: an existing asset is `200 text/javascript` with `immutable`, a rotated chunk name
   is now **404** (was `200 text/html` + `immutable`), deep routes and `/` still return the shell.

   **Why `dc77085` looked verified and was not:** the Chromium harness gave the wrapper an explicit
   height. The real chain has none — `folds` `Box` defaults to `display: Flex` with no direction, so
   the timeline's `<Box grow="Yes">` is a **row** container and the wrapper is a stretched row item
   whose specified height is `auto`. `height: 100%` had no containing block to resolve against, so
   the harness tested a box the DOM never has. A harness that supplies the missing containing block
   cannot adjudicate a layout bug; it can only check the fix's arithmetic.

2. **Root cause, named but unfixed.** On iOS WebKit the room mounts at **0 px** height; virtua turns
   that into its viewport, the box then expands, and WebKit drops the resize notification
   (`ResizeObserver loop completed with undelivered notifications`), leaving a one-row range —
   `rendered: 0` in a 5–6k px scroller. Evidence: the `Maretrix 1.1.1` session (Nov 4–7) and its
   deploy traces (`v15: wrap 0, par 0`). The 8 commits on this line are workarounds around it.
   Releases between 0.50.1 and 0.54.2 address exactly this class: `0.50.6` imperative-scroll race
   during measurement, `0.51.3` viewport measurement with `position: fixed`, `0.52.10` blank viewport
   after hidden/detached, `0.53.6` blank viewport when scrolled before mount, `0.54.0` suppress the
   ResizeObserver loop error.
3. **Peel the workaround stack — retired for 1.1.1.** On WebKit the stack disappears with virtua: the
   plain list replaces it wholesale, so there is nothing to peel. On every other platform the
   workarounds stay exactly as they are. No peel pass ships in this release.
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
8. **Pagination rejects are thread classification — re-measure after the plain path.** The 15
   `addEventToTimeline: Ignoring event=…` lines in the 2026-11-11 capture are `canContain` rejections
   (`event-timeline-set.js:536`): `eventShouldLiveIn` says a thread reply does not belong in the
   room's main set, and every captured line ends `timelineSet(threadId=undefined)`. One per page
   across 16 pages is ordinary backfill of a room with threads. The timeline-name timestamp is
   construction time (`event-timeline.js:84`), not a correlation key, and `Room.addEventsToTimeline`
   delegates to `timeline.getTimelineSet()`, so a foreign set is unreachable on that path.
   The 16 forward `/messages` requests are downstream of the geometry collapse: with
   `scrollSize == viewportSize`, `distanceFromBottom` is `-offset`, so the forward edge is true at
   every scroll position. The same collapse makes `distanceFromBottom >= 100` unreachable, so the
   initial-scroll cancel cannot fire either — one more candidate for blank-until-input. Re-measure
   after the plain path: forward requests that persist once `scrollHeight` is real are a bug; if they
   stop, this item closes and the reducer proceeds.

9. **Release office (pm) — changelog and bump are staged, nothing committed.** `CHANGELOG.md` carries
   the 1.1.1 section and `VERSIONS.md` names the SSO fix; both are uncommitted in `~/maretrix-1.1.1`
   on purpose (pm does not commit). The six-file bump is a ready patch at
   `~/worklogs/maretrix-1.1.1-bump.patch`, checked with `git apply --check` against `94d358e`; it is
   not applied because the version string would then change in any build made from this worktree. The
   changelog section is a draft: at tag time, strike any bullet the device pass does not confirm.

10. **Non-iOS timeline smoke before the tag — the pass covers the plain path only.** `virtua` moved
   0.50.1 → 0.54.2 on every platform that still virtualises, and no device has run it: the 7-scenario
   pass is iOS/plain, and a green jsdom suite says nothing about layout. Done when one busy room is
   scrolled to the top and back on the macOS build (and the Linux build if it is at hand) with no
   blank range, no stuck scroll and no console loop. Same session can confirm the two shared-layout
   bullets in the changelog (overscroll containment, swipe flash).

## Blocked

- **1.1.1 does not ship without a device pass.** A fix release that does not fix the bug is worse
  than no release.
- **1.2.0** — not started by design. Start only when 1.1.1 is done or clearly trending correctly.
  Prerequisite: merge `release/1.1.1` back into `main` so 1.2.0 branches from the shipped state.
- **SSO end-to-end check** — needs SSO enabled on `chat.daiwascarlet.com` (different team, later). Until
  then the scheme fix ships on the static proof in Decisions; re-run one native sign-in the first time
  a homeserver with SSO is reachable.

## Decisions

- **The plain path drives its own first backfill.** Backfill lives in the scroll handler, and a window that
  does not overflow emits no scroll event, so a room sync opens with a few events stays at thosefew rows.
  virtua's initial scroll-to-bottom emitted a scroll event even for a short list; `scrollTop` assignment on a
  non-overflowing plain scroller emits nothing. The fill sets `{start: 0, end: min(total-1, cap-1)}` explicitly
  (`growWindow` is a no-op at `start` 0), stops when a page adds no events, and is bounded to five attempts.
  It does **not** cover a collapsed scroller: `scrollHeight > 1` at `clientHeight === 0` returns early, which
  only the chain numbers can decide.
- **Timeline layout is measured, not inferred.** `tests/e2e/plain-timeline-chain.spec.ts` (Playwright
  project `webkit-ios`, iPhone descriptor, `?plainlist=1`) loads the real app, opens a room and prints
  `PLAIN_CHAIN` with the scroller, content, wrapper, wrapper parent, viewport and inner column heights.
  It asserts that the plain path is rendering at all before anything else — five candidates were shipped
  against a symptom that had never been measured. Needs Docker for the homeserver fixture and
  `npx playwright install webkit`.
- **The SPA fallback is scoped to non-asset paths.** `/assets/*` has its own handler, so a rotated chunk name
  answers 404 instead of index.html; the cache rule inside that handler keeps `immutable` for real assets only.
  Verified with a throwaway Caddy container against a fixture root: existing asset `200 text/javascript`
  + `immutable`, missing asset `404`, deep route `200 text/html`.
- **The update banner reloads on `controllerchange`, not immediately.** Posting
  `SKIP_WAITING_AND_CLAIM` and reloading on the next line races the new worker: the reload can win and the
  old precache serves the build the user was told to leave. A 3 s timeout still unblocks a worker that never
  claims.
- **1.1.1 closes only on a verified iOS pass; it neither ships nor closes without one.** The line
  has no ship date and no rollback-to-1.1.0 trigger; the live PWA may sit on a test build with
  `?plainlist=0` as the daily bridge. The process gates do not relax for it: @review clears each
  build, the installed app's About string is the first fact of every session, and no device
  session runs on an unverified bundle. 1.2.0 stays blocked behind 1.1.1.
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
- **The SSO scheme fix rides 1.1.1, as its own commit.** Native SSO is dead on the shipped 1.1.0 and
  on this line: `Login.tsx:96` and `Register.tsx:41` build `sable://login/…` through
  `SSOTauri.ts:4` (`TAURI_SSO_PROTOCOL = 'sable:'`) while `tauri.conf.json` and `AndroidManifest.xml`
  register only `maretrix` and `com.daiwascarlet.maretrix`. That is platform breakage, not a feature.
  One constant plus the assertions in `SSOTauri.test.ts` (which currently pin the broken scheme);
  it touches no timeline byte, so the pass on `page-Ca1xS7f5.js` stays valid — prove it at cut time
  with `git diff <pass-commit>..<release> -- src/` naming `SSOTauri.ts` and its test only.
  **No end-to-end check is possible yet (owner, 2026-11-11):** `chat.daiwascarlet.com` has no SSO
  configured, so the flow cannot be exercised from any client until another team enables it. The fix
  ships on static proof, which is complete except for the homeserver's 302: the builder emits
  `maretrix://login/…`; `tauri.conf.json`, `AndroidManifest.xml` and the runtime `register_all()` all
  register `maretrix`; `deep_link_ipc.rs:12` already lists `maretrix:` in `SCHEMES`; and
  `parseTauriSsoCallback` gates on the same constant plus hostname `login`, so `maretrix://share` and
  `maretrix://room` cannot be swallowed. Custom-scheme delivery to this app is already exercised by
  the OIDC callback, so the scheme name is the only variable. End-to-end verification is a Blocked
  item below, not a gate on 1.1.1.
- **`WORKLOG.md` never reaches `main`.** This repo is public; the log carries image digests, container
  names, deploy stamps and end-user reports. It stays on `release/1.1.1` while the device loop is
  live, then moves to `~/homelab-docs/development/maretrix/WORKLOG.md` in the merge-back and the repo
  copy is deleted in an ordinary commit. The private copy is stale at 2026-11-07 — reconcile it from
  the repo copy during that move, not before; two live state files are worse than one stale one.
  `VERSIONS.md` does land on `main` with the merge — it is release documentation, and its absence
  there today is expected, not a defect.
- Signing stays ad-hoc; no Developer ID or notarization.
