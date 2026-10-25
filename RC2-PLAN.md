# RC2 — platform build fixes. Working document.

> ## ⛔ PAUSED 2026-10-25 — DO NOT EXECUTE ANY RC2 WORK
>
> All Maretrix/rc2 work is on hold until the Hermes context-compaction problem is
> fixed and the user confirms. Reason: repeated compaction destroys the working
> state mid-task, which is what produced the recheck/re-verify loops and the two
> wasted hours. Fixing compaction comes first; nothing in this file is in flight.
>
> ### Decisions recorded 2026-10-25 (user answers — do not re-ask)
>
> 1. **Signing — self-signed is fine.** There is no paid Apple Developer account and
>    none is being bought. rc2 ships ad-hoc/self-signed exactly as it does today.
>    "Developer ID + notarization" was never a requirement; it was an option. Closed.
> 2. **Diagnostics depth — DROPPED.** The extra device-enumeration / secure-storage
>    backend dump was my suggestion; the user approved it only because I said it was
>    needed. It is not needed (calls now prompt once and work). Keep the existing
>    Capture Diagnostics as-is. Do not implement device/keyring dumping.
> 3. **Liquid Glass icon — try precompiling `Assets.car`.** Do not wait on tauri#15315.
>    Compile the `.icon` to `Assets.car` with Apple's `actool` and ship the `.car`
>    directly in `bundle.icon` (tauri-bundler accepts a prebuilt `.car` and skips the
>    crashing path). **Assume Xcode 27** (October 2026), minimum-deployment-target 26.0.
>    Our host has Command Line Tools only, so compilation happens on a macOS CI runner.
>    `src-tauri/icons/AppIcon.icon/` and `scripts/icons/build-liquid-glass.py` stay.
>
> ### State at pause
>
> - macOS: builds green. Run `40148567360` (commit `8d3ed62`) succeeded, artifact
>   `maretrix-macos-universal` 125,435,492 bytes uploaded. Ships flat `.icns`
>   (icon jail on macOS 26) until `.car` precompilation lands.
> - Icon art verified numerically: navy `(35,40,55)` field, scarlet `(242,48,73)`
>   glyph, identical across `icon.icns`, `AppIcon-1024.png`, `public/favicon.png`,
>   and both 512px logo sets. Variant C is what ships; no rework needed.
> - Linux / iOS / Android / signing / diagnostics: untouched, nothing in flight.

**Purpose:** single source of truth for the 1.1.0-rc2 pass. Read this before doing anything.
**Rule:** one platform at a time. Update the Progress log *as each step finishes*.
If a step is not in the Progress log as done, it is not done. Do not re-derive settled facts.

**Repo:** `/Users/preston/sable-dws` · **Branch:** `main` · **Current version:** 1.1.0-rc1
**Live web client:** https://app.daiwascarlet.com (VPS2, verified 2026-10-24 — title `Maretrix`, homeserverList `daiwascarlet.com`, push configured)
**Docs:** `~/homelab-docs/services/maretrix.md`, `~/homelab-docs/runbooks/maretrix-redeploy.md`

---

## Anti-loop protocol (read this first)

1. Start every session by reading this file's **Progress log**. If an item is `[x]`, do not re-check it.
2. Work **one platform per phase**. Do not touch a second platform until the first is closed or explicitly parked.
3. Every action must produce evidence (command output, artifact, CI run URL, screenshot). "Should work" is not evidence.
4. If a step fails twice with the same error, stop and write the error + two candidate causes into **Blockers** — do not retry a third time in the same way.
5. Never rewrite this file wholesale. Append to Progress log; edit only the relevant section.
6. A CI run is not "verified" until the artifact is downloaded and inspected (`unzip -l`, `file`, size > 0).

---

## Scope

| Platform | rc1 verdict | rc2 goal |
|---|---|---|
| Android | fine, no problems | **CLOSED** — no work |
| macOS | calls impossible; keychain prompt loop; no mic/camera devices; dated chrome | working calls + modern titlebar + `macos-latest` |
| Linux | navy-blue window, nothing loads (wry); CEF does not launch | window renders the app; **drop CEF** |
| iOS | untested; Apple broke sideloading | decide deliverable; document signing workaround |
| Windows | broken in rc1 (codegen mismatch), dispatch-only | **out of scope** unless asked |

---

## Root causes established (evidence-backed — do not re-investigate)

### L1 — Linux blank navy window
The app **unconditionally** set `WEBKIT_DISABLE_DMABUF_RENDERER=1` and
`WEBKIT_DISABLE_COMPOSITING_MODE=1` (`src-tauri/src/main.rs`, rc1). On modern Mesa
(AMD/Intel, WebKitGTK ≥ 2.44) the DMABUF path is healthy; forcing it off drops WebKit to an
EGL fallback that aborts with `Could not create default EGL display: EGL_BAD_PARAMETER`, and the
window shows only its background colour — which is `0x1A1C28` (navy) set in `lib.rs`.
→ **The navy blue window is the app's own background colour behind a dead WebProcess.**
An uncommitted fix already exists in `src-tauri/src/main.rs`: probe `/sys/class/drm/*/device/vendor`
for NVIDIA (`0x10de`) and only apply the workaround there; `SABLE_SAFE_RENDERING=1` as escape hatch.
Status: **drafted, not committed, not built, not tested.**

### L2 — CEF
User decision: **drop it** ("kind of a bad option"). CEF job is `continue-on-error`, not in the
default target set. Removing it removes a whole class of failure.

### M1 — macOS "WebCrypto Master Key" prompt loop
`<AppName> WebCrypto Master Key` is **WebKit's own keychain item**, not a Tauri plugin.
Apple's WebCore strings: *"Name of application's single WebCrypto master key in Keychain"* and
*"Used to encrypt WebCrypto keys in persistent storage, such as IndexedDB"*. A WKWebView app
using non-extractable `CryptoKey`s (call E2EE does) creates it.
The CI build signs **ad-hoc** (`APPLE_SIGNING_IDENTITY: '-'`). Ad-hoc signatures change per build,
so the app's designated requirement changes, the keychain ACL no longer matches, and every access
re-prompts. That is the loop — not a wrong password.
→ **Fix requires a stable signing identity across builds.** Options in the decision queue.

**Verified on the actual rc1 artifact** (downloaded `Maretrix_universal.app.tar.gz` from the
v1.1.0-rc1 release and inspected with `codesign`):
```
Identifier=com.daiwascarlet.maretrix
flags=0x10002(adhoc,runtime)      <- hardened runtime ON
Signature=adhoc
TeamIdentifier=not set
Runtime Version=15.5.0
codesign -d --entitlements -  ->  EMPTY (no entitlements at all)
```
And the keychain item already exists on this Mac:
`security find-generic-password -l "Maretrix WebCrypto Master Key"` →
account `com.apple.WebKit.WebCrypto.master+com.daiwascarlet.maretrix`, created 2026-10-14 12:13Z.
The installed `/Applications/Maretrix.app` has the **same CDHash** as the rc1 artifact
(`4d2f5b82…`), so this is not a stale-build mismatch — it is the ad-hoc signature itself.
The keychain dialog for an ad-hoc app typically offers only Allow/Deny (no "Always Allow"),
so every WebCrypto access re-prompts. That is the loop.

### M2 — macOS mic/camera never populate
`Info.plist` *does* declare `NSCameraUsageDescription` / `NSMicrophoneUsageDescription` (good).
But Tauri v2's `bundle.macOS.hardenedRuntime` defaults to **true**, and the repo has **no macOS
entitlements file** (`bundle.macOS.entitlements` is unset; only `src-tauri/ios-entitlements/`
exists). Hardened runtime without `com.apple.security.device.camera` and
`com.apple.security.device.audio-input` blocks capture before TCC can even prompt → `enumerateDevices()`
returns no labelled devices → "options never populate".
wry 0.55.1 routes the WKWebView media permission request to the OS, so the missing piece is the
entitlement, not the delegate.

### M3 — macOS dated chrome
`desktopSettingsDefaultsForPlatform('macos').useCustomTitleBar` is **false**
(`src/app/state/desktopSettings.test.ts` asserts it), so `lib.rs` uses
`TitleBarStyle::Visible`. The app *already* supports a mac custom titlebar
(`getCustomTitlebarKind` → `'mac'`, `lib.rs` Overlay branch, tray.rs setter). The dated look is
the default setting, not the runner image. Changing the runner to `macos-latest` does not by
itself modernise anything — both changes are wanted.

### I1 — iOS sideloading
Confirmed real: since **12 Oct 2026** Apple validates "anisette" data against the claimed device
and refuses sign-in with `-80045`; and since early September free personal teams are being
soft-banned at the provisioning-profile check (`0xe8008024` / `0xe8008018`). Affects every tool
that signs in with a free Apple ID without Xcode (AltStore, SideStore, Sideloadly, iloader…).
The unsigned IPA this repo produces is **not** what is blocked — the user's signing tool is.
Known working paths: fresh burner Apple ID used only for signing (not added to iCloud); paid $99
account; Apparition (on-device sideloader, handles the anisette/2FA change). Also: the installed
PWA already works on iOS and needs no re-sign.

---

## Decisions taken (grill round 1, answered)

- [x] **D1** macOS signing: **self-signed code-signing cert in CI**, base64 `.p12` in a repo secret. Chosen by user.
- [x] **D2** rc2 targets: `macos, linux, android`; iOS artifact-only; **delete `linux-cef` and `windows` jobs** from `build.yml`, but give Windows one quick best-effort shot first.
- [x] **D3** Landing: **one commit per platform on `main`**, dispatch a build to verify, bump to `1.1.0-rc2` + tag only after hardware confirmation.
- [x] **D4** iOS: try to get it running on the user's iPhone (iOS 27.2 RC dev beta) — determine whether that makes it impossible; if so, park.
- [x] **D5** Linux: user has the Artix box; SSH `preston@100.81.73.66` (headless; launch KDE/Xwayland first). User may test manually instead. An Arch install script / AUR package is a later nice-to-have, not an rc2 blocker.

### Prior-session artefacts recovered (do not re-create)

The stalled session *did* create a working self-signed cert and set the GitHub secrets
before it lost the plot. These exist:

| Artefact | Where | Notes |
|---|---|---|
| `MACOS_CERT_P12` secret | repo secret | base64 of the 2526-byte p12, CN **Maretrix Self-Signed**, 10-year validity, EKU codeSigning |
| `MACOS_CERT_PASSWORD` secret | repo secret | password for that p12 |
| `MACOS_SIGN_IDENTITY` variable | repo variable | `Maretrix Self-Signed` |
| Canonical p12 copy | `~/maretrix-files/macos-signing/maretrix-ci.p12` | mode 600, copied from the prior session's decoded blob |
| Canonical password copy | `~/maretrix-files/macos-signing/maretrix-ci-password.txt` | mode 600 |
| Earlier/other p12 | `~/maretrix-files/macos-signing/maretrix-signing.p12` | CN same, **different cert** (09:46:14Z vs 09:47:26Z) — not the secret |

Verified locally in a throwaway keychain: import succeeds, and
`codesign --force --sign "Maretrix Self-Signed"` signs a test file **after**
`security set-key-partition-list`. `find-identity -v -p codesigning` reports
0 valid identities because the cert is untrusted — that is expected and does
not prevent signing. The workflow's import step therefore needs the partition-list
call (it has it).

✅ **Auth blocker cleared** — user re-ran `gh auth login -h github.com`; push and
workflow dispatch work again.

---

## Progress log

### Phase 0 — general info gathering
- [x] Read `~/homelab-docs` README, `services/maretrix.md`, `runbooks/maretrix-redeploy.md`.
- [x] Inspect `~/sable-dws` git state: `main`, clean except uncommitted `src-tauri/src/main.rs` (Linux GPU probe fix) and untracked `.rc2-worklog.md`.
- [x] Verify live web client on VPS2: HTTP 200, title `Maretrix`, homeserver list present, push configured; containers up.
- [x] Locate macOS keychain item origin (WebKit, not a plugin).
- [x] Locate macOS entitlement gap (hardenedRuntime true, no macOS entitlements file).
- [x] Locate macOS titlebar default (false → Visible).
- [x] Identify Linux navy-window cause (unconditional DMABUF/compositing disable).
- [x] Confirm iOS sideloading break (anisette + free-team bans).
- [x] Confirm Android is closed.

### Phase 1 — macOS
- [x] Decide D1 signing strategy — self-signed cert, secrets already set by the prior session.
- [x] Add `src-tauri/entitlements.plist` (camera + audio-input + sandbox microphone).
- [x] Set `bundle.macOS.entitlements` in `tauri.conf.json`.
- [x] Change `macos` job runner to `macos-latest`.
- [x] Default `useCustomTitleBar` to true on macOS; update Rust + TS defaults and both tests.
- [x] Add one-time Rust migration so an rc1 install with `useCustomTitleBar:false` picks up the new default.
- [x] Wire the existing `MACOS_CERT_P12` / `MACOS_CERT_PASSWORD` / `MACOS_SIGN_IDENTITY` artefacts into the workflow import step (was not wired before).
- [x] Fixed a latent workflow bug: `base64 --decode` on a *file argument* silently reads empty stdin on macOS — the step pipes via stdin, which is correct; kept as-is.
- [x] Commit macOS changes locally (`202d097`).
- [x] Push to `main`.
- [x] Dispatch macOS build — run `40087497199`; **Import macOS signing certificate step passed** (secret valid, keychain import OK). tauri-action compiling.
- [x] Build completed — run `40087497199`, macOS job 42m28s, success.
- [x] Downloaded + inspected DMG. **Verified:** `Authority=Maretrix Self-Signed`, flags `0x10000(runtime)` (hardened runtime), `codesign --verify --deep --strict` passes, universal `x86_64 arm64`, entitlements list camera + audio-input + microphone. Runner was **macOS 26.5.0** (Tahoe), so `macos-latest` did move to the newest image.
- [ ] User test on real Mac: calls, device list, titlebar, keychain prompt count.
  - DMG staged at `~/Downloads/Maretrix-1.1.0-rc1-macos-entitlements-test.dmg` (sha256 `c45cd2b2de947a5d204148b8a02b0d68b25b37f3d945b799f4a20959aa9f2e2f`, 62.8 MB).
  - Version string is still `1.1.0-rc1` — bump deferred until hardware confirmation per D3.

### Phase 4 — Branding: Liquid Glass icon set (rc2)
- [x] Decided: variant **C — ember glass**; real `.icon` asset set for rc2; same art for web/PWA.
- [x] `scripts/icons/build-liquid-glass.py` regenerates the full set from the ember-glass master.
- [x] `src-tauri/icons/AppIcon.icon/` (`icon.json` + `AppIcon-1024.png`, translucency off).
- [x] Full-bleed 1024, `icon.icns`, `32/64/128/128@2x`, `public/res/logo*`, `public/favicon.png`.
- [x] `tauri.conf.json` icon list includes `icons/AppIcon.icon`.
- [x] Verified numerically: corners opaque navy (L≈40), glyph L≈91, alpha 255 everywhere.
- [x] Attempted real `.icon` compile in CI — **blocked upstream**: bundling dies in
      `create_assets_car_file` → `failed to run actool` (run `40145371140`, 2026-10-25).
      This is tauri-apps/tauri#15315: actool throws
      `__NSPlaceholderArray initWithObjects:count: attempt to insert nil object`
      while selecting Icon Composer items. Reproduces on the upstream example app, so
      it is not caused by our `icon.json`.
- [x] rc2 decision: keep `icons/AppIcon.icon` in the repo but remove it from
      `bundle.icon` so the release builds. The "Verify Liquid Glass icon compiled"
      step became a non-blocking status report. rc2 ships the flat `.icns` (icon jail
      on macOS 26) rather than a red build.
- [ ] Re-enable once #15315 is fixed upstream, or precompile `Assets.car` on a working
      Xcode 26 toolchain and ship the `.car` directly (bundle.icon accepts `.car`).
- [ ] User test: dock icon on macOS 26 (full-size, no icon jail).
- [ ] Deploy web/PWA set to VPS2 (manual image rebuild, redeploy Scenario C) — separate step.

### Phase 2 — Linux
- [x] GPU-probe fix drafted in `src-tauri/src/main.rs` — NVIDIA-only DMABUF disable, `SABLE_SAFE_RENDERING=1` escape hatch, user env overrides win. `rustfmt --check` clean.
- [x] Removed the `linux-cef` job from `.github/workflows/build.yml` (lines 345–424) and dropped `linux-cef` from the `targets` input description. YAML re-parsed OK; jobs now `create-release, macos, linux, windows, android, ios`. Zero `cef` references left.
- [ ] Commit Linux changes.
- [ ] Push + dispatch `linux` build (x86_64 + aarch64); download and inspect artifacts.
- [ ] User test on Artix.

### Phase 3 — iOS
- [ ] Decide D4.
- [ ] Build unsigned IPA; document the current signing path + workarounds.

---

## Blockers
(none yet)

---

## Open questions / risks
- Self-signed CI cert: Gatekeeper still warns (same right-click flow), but keychain ACL persists. Needs a `.p12` in repo secrets and keychain import step.
- If the keychain item already exists from an earlier ad-hoc build, the ACL may be stuck. First run on the stable build may still prompt once — "Always Allow" should then stick. May need a one-time delete of the old keychain item.
- `macos-latest` may point at the same image as `macos-15` (or newer) depending on GitHub's fleet. The user asked for it either way; verify which image the run actually used.
