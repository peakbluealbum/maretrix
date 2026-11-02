# Installing Maretrix on Linux

Maretrix is packaged per distribution. **There is no AppImage on purpose** — see
[Why no AppImage](#why-no-appimage).

| Your distro | What to use |
|---|---|
| Arch, Artix, Manjaro, EndeavourOS, CachyOS (Arch-based) | pacman package (`packaging/arch/PKGBUILD`, AUR) |
| Debian, Ubuntu, Mint, Pop!\_OS, Kali | the `.deb` attached to the release |
| Fedora, openSUSE | the `.rpm` attached to the release, or the Arch package as a build recipe |

---

## Arch-based (recommended path)

Either install from the AUR:

```bash
yay -S maretrix        # or: paru -S maretrix
```

or build from this repository:

```bash
cd packaging/arch
makepkg -si
```

Dependencies (`webkit2gtk-4.1`, `gtk3`, `libsoup3`, GStreamer plugins, `xorg-xwayland`)
are pulled in automatically. The app links **your distro's WebKitGTK**, so the rendering
engine is patched by your distro like any other system library.

### Known limitation: voice/video calls on Arch-based systems

Arch's `webkit2gtk-4.1` is built **without WebRTC**. Verified directly against the engine:

```js
typeof RTCPeerConnection   // "undefined"
```

GStreamer does provide `webrtcbin`, so this is a compile-time decision in the WebKitGTK
package, not something the app can enable at runtime. The call UI reports
"Your browser does not support WebRTC, which is required for calling."

Options if you need calls today:

- use the **Chromium (CEF) build**, which ships its own engine — `pnpm tauri:cef build`
  locally, or the `maretrix-cef-*` artifact from the release;
- or run the web client at <https://app.daiwascarlet.com> in a browser that has WebRTC.

Everything else (messages, media, files, GIFs, notifications) works on the system engine.

---

## Debian / Ubuntu

```bash
sudo apt install ./Maretrix_<version>_amd64.deb
```

That pulls the runtime dependencies (`libwebkit2gtk-4.1-0`, GTK 3, GStreamer plugins).
Launch **Maretrix** from your application menu, or run `maretrix`.

> Debian's WebKitGTK *is* built with WebRTC, so calls work here — the opposite of Arch.

---

## Fedora / openSUSE

```bash
sudo dnf install ./Maretrix-<version>-1.x86_64.rpm
```

---

## First run

The package ships an **empty configuration**: no homeserver is preconfigured, so enter
`daiwascarlet.com` on the login screen (or your own homeserver). This is deliberate — the
published packages must not carry daiwascarlet's provider keys.

---

## Why no AppImage

Upstream builds an AppImage for "universal" compatibility. It does not work on current
systems, and the failure is silent and confusing:

- The AppImage bundles a **WebKitGTK from an Ubuntu 22.04 build**. Against Mesa 26 it
  aborts during EGL initialisation —
  `Could not create default EGL display: EGL_BAD_PARAMETER. Aborting...` — the WebProcess
  dies, and all you see is an empty navy window.
- Reproduced on Artix/Plasma with a fully working GPU session; the *same* application
  built against the distro's WebKitGTK renders normally with no performance problem.
- Nothing the user can set fixes it: `WEBKIT_DISABLE_DMABUF_RENDERER`,
  `WEBKIT_DISABLE_COMPOSITING_MODE`, `SABLE_SAFE_RENDERING` and software GL all fail
  identically, because the engine never gets far enough to honour them.
- A bundled engine also means you never receive WebKit security updates for the component
  that renders your Matrix session.

Per-distro packages are the honest answer: they link the engine your distro maintains.
