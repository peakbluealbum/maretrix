# Changelog

This fork versions independently of upstream, starting at 1.0.0. Upstream's own changelog lives at
<https://github.com/SableClient/Sable/blob/dev/CHANGELOG.md>.

## 1.1.0

Focus: shipping the native clients properly, and making Linux installable at all. This entry
covers the whole rc1 -> rc2 -> 1.1.0 line; the release candidates were never published as stable.

### Windows

- **Windows ships again.** Two blockers, both independent of the Tauri version mismatch that had
  been blamed: `vite-plugin-static-copy` was given an absolute path, which is not a valid glob on
  Windows, so the frontend build died before Rust ran; and the WiX/MSI target rejects a
  non-numeric pre-release identifier (`1.1.0-rc2`). The config is now emitted as a bundle asset
  instead of copied, and Windows bundles NSIS only.

### macOS

- **The Dock icon actually renders the Liquid Glass asset.** The `.icon` document was one opaque raster with
  `specular`, `glass` and `translucency` all disabled, and it was compiled under the name `Icon` while
  `Info.plist` asked for `AppIcon` — so macOS silently fell back to the flat `.icns` and every icon change
  was invisible. Recomposed as a system gradient fill + bloom layer + glass glyph (refractivity, specular
  placement, system shadow), and the compiled `Assets.car` name now matches `CFBundleIconName`.
- Clear and Tinted icon styles no longer read as mud: the field is 82% opaque and the Tinted appearance uses
  a monochrome glyph, because the Tinted style recolours by luminance.
- **Local builds now ship the real `config.json`.** A plain `pnpm tauri build` embedded the empty template —
  no homeserver, no GIF keys, no push gateway. `scripts/build-macos-local.sh` merges `config.secrets.json`
  into a scratch file, points vite at it via `MARETRIX_CONFIG_PATH`, signs the updater artefacts and asserts
  the result before declaring success.
- Built and verified on Xcode 27.2 / Tauri 2.12.5 after a clean `cargo clean`; the `.icns`, `Assets.car` and
  embedded config in the installed bundle were checked against the repo copies.

### iOS

- **The app launches.** iOS 27 terminates any app that has not adopted the UIScene lifecycle
  (`EXC_BREAKPOINT` in `_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`, before app code runs).
  `tao` 0.35 (Tauri 2.11) has no scene delegate, so the whole Tauri family moved to 2.12.5 and the iOS
  Info.plist now declares `UIApplicationSceneManifest`.
- **Shipping a Liquid Glass app icon on iOS too**, from the same Icon Composer document: xcodegen places it in
  Resources, Xcode compiles it with `actool`, and one car provides the iOS 26+ `IconImageStack` (light, dark,
  tinted) plus the loose PNGs iOS 16–25 reads. The duplicate legacy appiconset was removed — one `Assets.car`
  per bundle, and a duplicate name silently loses.
- `scripts/install-ios-device.sh`: builds signed with a free Personal Team, blanks the `aps-environment` /
  App Group entitlements a free team cannot provision, merges the real config, and installs with `devicectl`.
- Verified on an iPhone 14 Pro Max / iOS 27.2: login, device verification, calls, GIF search, file and photo
  upload.

### Linux

- **The blank window is fixed by packaging, not code.** The AppImage bundled a WebKitGTK from an Ubuntu 22.04
  build that cannot create an EGL display against Mesa 26, so the WebProcess died and only the window
  background showed. The same application built against the distro's WebKitGTK 2.54 runs cleanly on Artix with
  no performance problem.
- New `packaging/arch/PKGBUILD` (+ `.SRCINFO`, AUR runbook) so Arch-based systems build against their own
  WebKitGTK; CI grew a `linux-arch` job that produces a `.pkg.tar.zst`.
- Linux releases are now **deb/rpm only**; the AppImage is dropped.
- Masked, high-resolution icons for Linux desktops (they draw the bitmap verbatim, so the old unmasked 32×32
  square looked blurry and hard-edged), with the 512 px icon leading `bundle.icon` so the WM downsamples.
- `docs/INSTALL-linux.md`, including the honest limitation: Arch's WebKitGTK is built without WebRTC, so calls
  do not work there (Debian's does).

### Web

- Welcome page carries the three links the fork owes its users: the project site, the source (AGPL §13) and the
  terms.

### Known issues

- **iOS: the timeline stays blank for a moment after switching channels** until any touch scrolls or taps the
  page. Not a paint bug — the virtual list renders a single item because its first measurement of the scroll
  container is short, and it re-measures only when something resizes. Cosmetic and self-healing.
- **Linux (Arch-based): voice/video calls are unavailable** because the distro's WebKitGTK is compiled without
  WebRTC (`RTCPeerConnection` is undefined even though GStreamer's `webrtcbin` is present).
- **Prerelease builds log `update endpoint did not respond`** on startup: GitHub has no `latest.json` for a
  release candidate, so the auto-updater's check 404s.

## 1.0.0

Initial release of Maretrix, based on upstream Sable `98416a9` (*chore: prepare release 1.22.11*, 2026-09-30).

- Rebranded: name, logo, icons and favicons.
- Built-in dark theme repainted navy/scarlet, with a scarlet accent and halo on the interactive action icons
  and notification badges.
- `config.json` ships as an empty template; deployment-specific values are merged in at build time from an
  untracked `config.secrets.json`.
- Removed: pronouns, the "animal identity" cosmetics, and PluralKit.
- Own version line, independent of upstream.
