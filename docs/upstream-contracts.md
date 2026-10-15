# Upstream naming contracts — do not rename

This fork keeps the `sable` name in three places **on purpose**. They are not
oversights and they are not branding debt. Renaming any of them loses user data
or breaks interoperability, so treat them as frozen interfaces.

## 1. The `moe.sable.*` Matrix namespace — a wire format

Defined in `src/unstable/prefixes/sable/` and `src/types/matrix/room.ts`:

| Identifier | Where it lives |
|---|---|
| `moe.sable.app.settings` | account data on the homeserver |
| `moe.sable.app.nicknames` | account data |
| `moe.sable.app.pins_read_marker` | account data |
| `moe.sable.dismissed_invites` | account data |
| `moe.sable.added_servers` | account data |
| `moe.sable.favorite_gifs` | account data |
| `moe.sable.app.bio`, `.name_color`, `.name_color_dark_theme`, `.name_color_light_theme` | per-user profile data |
| `moe.sable.room.cosmetics.*`, `moe.sable.room.abbreviations` | room state events |
| `moe.sable.message.forward` | event content |
| `moe.sable.client.action` | settings deep-link parameter |
| `moe.sable.up`, `moe.sable.thumbnails`, `moe.sable.media_proxy` | push/call capabilities |

These values are **already written to the homeserver**. Renaming them means
every existing user silently loses nicknames, pins, bookmarks, saved GIFs,
dismissed invites and cosmetic settings, and the fork stops interoperating with
upstream Sable clients on the same account. If a rename is ever genuinely
needed, it must be a migration that reads the old keys and writes the new ones —
never a straight substitution.

## 2. The `--sable-*` CSS custom properties — the theme API

`src/app/styles/themes.css` (~141 references) and `src/colors.css.ts` (~71)
expose the theme variable namespace. This is a **published API**: the theme
catalog (`SableClient/themes`) and every theme a user has saved in-app reference
these names. Renaming the namespace breaks all of them at once.

## 3. Upstream attribution — a licence requirement

`LICENSE` is AGPL-3.0. The upstream project, its repository URLs, and the
`@sableclient/*` npm package scope must stay named as they are: those are real
dependency names and required attribution, not branding. `README.md`,
`CHANGELOG.md` and `TRADEMARKS.md` refer to Sable deliberately — they document
the upstream base (`98416a9`).

---

## What is *not* frozen

Everything else is fair game: internal identifiers (`sableThemeMapping`,
`SableCallKitDelegate`), `SABLE_*` build/dev flags and environment variables,
the `sable-media:` / `sable-tiles:` custom protocol schemes, comments, and
test-fixture filenames. None of those cross a process, device, or user boundary.
