# Maretrix 1.1.0 — plan

Three workstreams, in the order I think they should be attacked. Written after rc2 shipped, so
each item names the evidence that closed in rc2 rather than re-deriving it.

---

## A. Timeline jitter / compositing (the real 1.1.0 feature)

### What the owner reports

- Inside a loaded channel it is stable.
- Flinging to the bottom is **jittery and non-deterministic**: sometimes a clean bounce, sometimes
  it "snaps up as if a new message were about to render" and then corrects down, sometimes the
  top half of the screen paints the window background before correcting.
- Switching channels feels like the app **discards the channel state and reloads everything**.
- **Identical in the iOS PWA**, which is the important clue: WKWebView and the iOS PWA are both
  WebKit, and the desktop PWA is not affected the same way. So this is a WebKit-specific
  scroll/paint interaction, not a Tauri packaging problem — which is why the IPA did not help.

### What we already know from the code (verify, don't assume)

1. `RoomTimeline`'s `VList` is keyed by `${roomId}:${live ? 'live' : anchor}` — **switching rooms
   remounts the whole virtual list**. Every switch re-measures, re-renders the visible range and
   re-runs the initial scroll sequence (80 ms timer → rAF → `scrollToBottom` again).
2. `messageList` sets `overflow-anchor: none`, which disables the browser's own scroll anchoring.
   Combined with a remount and async event loading, content height changes are not compensated.
3. `scrollToBottom` is called from several effects (`timelineSync`, pagination, unread, initial),
   and the scroller has no `overscroll-behavior`, so iOS rubber-band scroll events feed back into
   the same "am I at the bottom?" logic.
4. The scroller has **no background of its own**; when WebKit drops a frame during a relayout the
   window colour shows through. That is the blue flash, and it is a separate defect from the
   jitter — worth fixing even if the jitter remains.

### How to diagnose (concrete, in order)

**Phase 0 — cheap, no build required.** Two CSS-level changes, deployable to
`app.daiwascarlet.com` and testable in the PWA immediately:

- give the timeline container an opaque background matching the room surface (kills the blue
  flash even if a frame is dropped),
- `overscroll-behavior: contain` on the scroller (stops the rubber-band from being interpreted
  as scroll intent).

These are not the fix; they are the experiment that separates "paint is dropped" from
"scroll logic is fighting the user".

**Phase 1 — instrument.** Add a debug-only sampler (feature-flagged, off in normal builds) that
records a JSONL line at each of: room switch, scroll settle, new-message arrival, initial-scroll
completion. Fields: `t`, `roomId`, `mountCount` (RoomTimeline and VList), `scrollTop`,
`scrollHeight`, `clientHeight`, `renderedMessages` (`[data-message-id]`.length), `atBottom`,
`isReady`. Write to the app data directory through one tiny Tauri command, so the file can be
pulled off the phone with `devicectl` and read here — no screenshots, no guessing.

**Phase 2 — reproduce three scenarios** with the sampler running: (a) switch channels ten times,
(b) fling to bottom and hold the overscroll, (c) receive a message while scrolled up. The line
counts and the `scrollHeight` deltas answer the owner's hypothesis directly: if `mountCount`
increments on every switch and `renderedMessages` drops to 1 during the remount, the channel
state really is being thrown away.

**Phase 3 — fixes, in order of risk.** Only after Phase 2 says which hypothesis is true:

| Hypothesis | Fix | Risk |
|---|---|---|
| Remount churn (likely) | keep a small LRU of mounted room timelines, or park the scroller instead of remounting the VList | medium — touches routing/state |
| Scroll logic fights overscroll | debounce/hysteresis on "at bottom", ignore scroll events during rubber-band, single owner of `scrollToBottom` | low |
| Paint dropped (blue flash) | opaque background + explicit compositing layer / `contain: paint` | very low |
| Content-height drift with `overflow-anchor: none` | re-enable anchoring for the timeline, keep the manual restore only for pagination | low |

Success criterion: the three scenarios above run clean ten times each on the iPhone, and the
sampler shows no `renderedMessages` collapse and no `scrollTop` oscillation larger than a few px.

---

## B. Calls on Arch-based systems

### Established facts

- Arch's `webkit2gtk-4.1` PKGBUILD passes **no** `ENABLE_WEB_RTC` token (`cmake_options` inspected:
  documentation, minibrowser, speech, `PORT=GTK`), so it takes the GTK port's default, which is off.
- Runtime probe of the *installed* engine (empty page, `typeof RTCPeerConnection`) returns
  `undefined`, with `MediaStream` present and GStreamer's `webrtcbin` installed. So this is a
  compile-time omission, not a runtime plugin lookup.
- Therefore nothing in Maretrix can enable calls on stock Arch.

### Options, with honest cost

1. **Flatpak** — one artifact for every distro, and the runtime supplies WebKit. *Open question to
   verify before committing:* whether the GNOME runtime's WebKitGTK is built with WebRTC. Check it
   the same way we checked Arch: install the runtime, load an empty page inside it, read
   `typeof RTCPeerConnection`. Do this **before** promising anything.
2. **AUR variant that compiles WebKit with WebRTC** — `-DENABLE_WEB_RTC=ON` on a local WebKit
   build. Cost: multi-hour compile, several GB, and it has to be installed under a private prefix
   (or shadowing the system package) because the soname matches. Honest answer: viable for a few
   enthusiasts, not a default.
3. **Web client in a browser for calls** — the browser has WebRTC. Zero work, already true today.
4. **CEF build** — dropped by the owner (never launched, heavier). Not revisiting unless 1 and 2
   fail.

**Recommendation:** Flatpak becomes the "calls work" package, `.deb`/`.rpm`/Arch stay the native
packages, and `docs/INSTALL-linux.md` states plainly that calls need the Flatpak or a browser.
**AUR should keep shipping the source PKGBUILD** (native, system WebKit) — do not make the AUR
package depend on a patched WebKit.

---

## C. Windows

The blocker recorded in rc2 was a version mismatch: `tauri` 2.11.5 with `tauri-codegen` 2.7.0,
which emits a call to `tauri::image::default_window_icon_from_app_icon_resource()` — a function
that only exists in tauri 2.12+. The rc2 cycle bumped the whole Tauri family to 2.12.5, so the
mismatch is gone on paper.

Next step is simply to dispatch the job (`targets=windows`) and read the result — a dispatch has
been started. If it builds, Windows moves from "dispatch-only, broken" to a released artifact,
and the workflow comment needs rewriting rather than the code.

---

## D. Smaller items carried from rc2

- AUR publication at 1.1.0 (recipe and runbook already in `packaging/arch/`).
- Skip the auto-updater check on prerelease versions (silences the `latest.json` 404 noise).
- Re-verify the claim in the rc2 notes that Debian's WebKitGTK has WebRTC — currently asserted,
  not measured. Measure it the same way as Arch before repeating it to users.
