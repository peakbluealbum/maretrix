# RC2 — platform build fixes. Working document.

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

⚠️ **Blocker:** `gh` auth became invalid mid-session (`HTTP 401: Requires
authentication`, "The token in default is invalid"). Re-run `gh auth login -h github.com`
before secret updates or build dispatch.

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
- [ ] Commit macOS changes locally. ← in progress
- [ ] Push + dispatch macOS build (BLOCKED on `gh` auth).
- [ ] Download DMG; inspect entitlements/signature (`codesign -d --entitlements -` must now list camera/audio-input; signature must no longer be `adhoc`).
- [ ] User test on real Mac: calls, device list, titlebar, keychain prompt count.

### Phase 2 — Linux
- [ ] Commit the GPU-probe fix (already drafted).
- [ ] Remove CEF job + target input.
- [ ] Build x86_64 + aarch64; download and inspect.
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
