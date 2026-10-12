# Changelog

This fork versions independently of upstream, starting at 1.0.0. Upstream's own changelog lives at
<https://github.com/SableClient/Sable/blob/dev/CHANGELOG.md>.

## 1.0.0

Initial release of Maretrix, based on upstream Sable `98416a9` (*chore: prepare release 1.22.11*, 2026-09-30).

- Rebranded: name, logo, icons and favicons.
- Built-in dark theme repainted navy/scarlet, with a scarlet accent and halo on the interactive action icons
  and notification badges.
- `config.json` ships as an empty template; deployment-specific values are merged in at build time from an
  untracked `config.secrets.json`.
- Removed: pronouns, the "animal identity" cosmetics, and PluralKit.
- Own version line, independent of upstream.
