# Maretrix 1.1.0-rc2

Second release candidate of Maretrix, the daiwascarlet fork of Sable. This cycle was almost
entirely about **shipping the native clients properly** — and about making Linux installable at
all.

## What changed

**macOS**
- The app icon actually renders as a Liquid Glass icon now (it had been silently falling back
  to the legacy bitmap), in light, dark, clear and tinted styles.
- Local builds ship the real configuration: homeserver, GIF search and the push gateway are
  baked in, so the login screen points at `daiwascarlet.com` out of the box.

**iOS**
- The app launches on iOS 27 at all — Apple now terminates apps that have not adopted the
  UIScene lifecycle, and the previous runtime did not.
- Liquid Glass app icon, plus a device install script for free Apple IDs.

**Linux**
- **The blank-window bug is fixed.** The old AppImage bundled a WebKit from an Ubuntu 22.04
  build that cannot start on current Mesa; packages now link your distro's WebKitGTK.
- Linux is packaged per distribution: `.deb`, `.rpm`, and a native Arch package. There is no
  AppImage any more, deliberately.

**Web**
- The post-login page carries the site, source and terms links.

## Downloads

| Platform | File | Install |
|---|---|---|
| **macOS** (Apple silicon + Intel) | `Maretrix_1.1.0-rc2_universal.dmg` | Open the DMG, drag to Applications. The app is ad-hoc signed, not notarised: first launch needs right-click → **Open**, or `xattr -dr com.apple.quarantine /Applications/Maretrix.app` |
| **Arch / Artix / Manjaro / EndeavourOS** | `maretrix-1.1.0rc2-1-x86_64.pkg.tar.zst` | `sudo pacman -U maretrix-1.1.0rc2-1-x86_64.pkg.tar.zst` |
| **Debian / Ubuntu / Mint / Pop!\_OS** | `Maretrix_1.1.0+rc2_amd64.deb` | `sudo apt install ./Maretrix_1.1.0+rc2_amd64.deb` |
| **Fedora / openSUSE** | `Maretrix-1.1.0+rc2-1.x86_64.rpm` | `sudo dnf install ./Maretrix-1.1.0+rc2-1.x86_64.rpm` |
| **Android** | `app-universal-release.apk` | Sideload; allow install from unknown sources |
| **iOS** | — | No IPA in this release — see below |
| ARM64 Linux | `..._arm64.deb`, `...aarch64.rpm` | as above |

> The Linux packages are versioned `1.1.0+rc2` rather than `1.1.0-rc2`: the deb/rpm bundler
> rejects the hyphen. Your package manager still orders it as the same version.

**Arch users:** the package in this release was rebuilt after a packaging bug that left the app
pointing at a development server (a blank window). If your copy is older, re-download it.

## First run

The packages ship an **empty configuration** — no homeserver is preconfigured. Enter
`daiwascarlet.com` on the login screen, or your own homeserver. This is deliberate: published
binaries must not carry credentials.

## iOS

There is no IPA attached this time. The app itself is fine — it was built, installed and tested
on an iPhone 14 Pro Max (login, device verification, calls, GIF search, file and photo upload).
What failed is only the *release-profile* packaging step, on a build-tool incompatibility
between Swift 6 and the current Xcode. Tracked as the first item for 1.1.0.

To build it yourself you need a Mac with Xcode and a free Apple ID:

```bash
pnpm install
APPLE_DEVELOPMENT_TEAM=<your team id> bash scripts/install-ios-device.sh
```

Free-team signatures expire after 7 days; re-running the script renews them without losing app
data.

## Known issues

- **iOS: the timeline can stay blank for a moment after switching channels** until you scroll
  or tap. Cosmetic, and it clears itself on any interaction.
- **Linux on Arch-based systems: voice/video calls do not work.** The distro's
  `webkit2gtk-4.1` is compiled without WebRTC, so `RTCPeerConnection` does not exist in the
  engine — nothing the app can enable. Debian/Ubuntu's WebKitGTK does have it, so calls work
  from the `.deb`.
- **Prerelease builds log an updater error on startup** ("update endpoint did not respond"):
  GitHub has no `latest.json` for a release candidate. Harmless.
- **macOS builds are ad-hoc signed** — no paid Apple Developer account, so no notarisation.

## Full details

`CHANGELOG.md` in the repository has the complete entry, including the specific defects fixed
this cycle. Linux install notes live in `docs/INSTALL-linux.md`.
