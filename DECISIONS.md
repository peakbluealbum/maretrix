# Standing decisions — do not re-litigate

## macOS code signing: AD-HOC / UNSIGNED (decided long ago; closed)

Maretrix ships **ad-hoc signed** (`APPLE_SIGNING_IDENTITY: '-'`). There is no paid
Apple Developer account and none is being purchased. Developer ID certificates and
notarization are **out of scope** and are not an rc2 blocker.

Do not raise this again. The CI already implements it: `build.yml` falls back to
`'-'` whenever the `MACOS_CERT_P12` secret is absent. Nothing needs to change.

Revisit only if distribution moves outside the homelab (public Gatekeeper-signed
release or Mac App Store). That would be a new, separate decision requiring a paid
account — not a continuation of rc2.

---

## Liquid Glass icon: PRECOMPILED `Assets.car` (decided 2026-10-25)

Ship a precompiled `Assets.car` rather than flat icons. Compile it locally with
Xcode 27.1's `actool` and list the `.car` in `bundle.icon`; the bundler copies a
`.car` verbatim and never invokes actool, so CI cannot crash on it.

Do not ship flat `.icns` as the final answer. `.icns` remains only as the fallback
entry in `bundle.icon` (CFBundleIconFile), which the bundler sets automatically.

### How to regenerate `Assets.car`

```sh
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
cp -R src-tauri/icons/AppIcon.icon /tmp/Icon.icon   # bundler renames dir to Icon.icon
xcrun actool /tmp/Icon.icon --compile /tmp/out \
  --output-format human-readable-text --notices --warnings \
  --output-partial-info-plist /tmp/out/assetcatalog_generated_info.plist \
  --app-icon Icon --include-all-app-icons --accent-color AccentColor \
  --enable-on-demand-resources NO --development-region en \
  --target-device mac --minimum-deployment-target 26.0 --platform macosx
cp /tmp/out/Assets.car src-tauri/icons/Assets.car
```

Verified 2026-10-25 on Xcode 27.1 (27A9275), actool 27.1: exit 0, `Assets.car`
1,547,896 bytes, `assetutil --info` reports `Icon/Ember Glass` and
`CFBundleIconName => Icon`.

The earlier `failed to run actool` crashes in CI were the macos-latest runner's
older actool, not our document. Our `icon.json` and `Assets/` layout are correct.
