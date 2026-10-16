#!/usr/bin/env python3
"""Generate daiwascarlet branding assets for this Sable fork.

Sable's own mark (public/res/svg/logo.svg) was a 512x512 vector. Ours is a raster
illustration, so:

  public/res/logo/*          -> circular-cropped disc, transparent outside it
  public/res/logo-maskable/* -> navy full-bleed square with the art inside the
                                maskable safe zone (~72%), per the maskable spec
  public/res/svg/logo*.svg   -> SVG wrappers embedding the PNG as base64, so the
                                six `import LogoSVG from '$public/res/svg/logo.svg'`
                                call sites and manifest.json keep working untouched
  public/res/svg/unread.svg  -> same disc + a grey dot in the bottom-right (unread)
  public/res/svg/highlight.svg -> same disc + a green dot (mentions)
                                Geometry mirrors upstream's badged icons exactly, so
                                the notification favicons match our mark too.
  public/favicon.png         -> 64x64 disc

Nothing here touches upstream's LICENSE or third-party credits.

Usage:
    python3 scripts/dws-branding.py [path/to/mark.png]
"""
from __future__ import annotations

import base64
import io
import pathlib
import sys

from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_SRC = pathlib.Path.home() / "maretrix-files" / "dsklogonew.png"
SRC = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SRC

NAVY = (13, 21, 38, 255)  # #0d1526, matches --sable-bg-container
LOGO_SIZES = [36, 48, 72, 96, 144, 192, 256, 384, 512]
MASKABLE_SIZES = [36, 48, 57, 60, 72, 76, 96, 114, 120, 144, 152, 167, 180, 192, 256, 384, 512]
SAFE_FRACTION = 0.72  # fraction of the tile the art may occupy for maskable icons

# Badged favicon geometry (512-unit viewBox).
# Upstream's unread.svg/highlight.svg put the dot at (413.73, 395.55) with r=62.66 and
# punched a r=125.3 hole in the disc around it. That worked for their mostly-empty navy
# disc, but our mark fills the disc, so a crater that size eats the artwork and leaves a
# bitten-off wedge. Keep upstream's direction and dot size, pull the dot inward so it
# sits inside the disc, and use a thin transparent moat rather than a crater.
_UP_DX, _UP_DY = 413.73395 - 256.0, 395.55249 - 256.0   # upstream offset from centre
_UP_DIST = (_UP_DX**2 + _UP_DY**2) ** 0.5
BADGE_DIST = 190.0        # how far the dot sits from the disc centre
BADGE_CX = 256.0 + _UP_DX / _UP_DIST * BADGE_DIST
BADGE_CY = 256.0 + _UP_DY / _UP_DIST * BADGE_DIST
BADGE_R = 62.658623       # dot radius (upstream's)
NOTCH_R = BADGE_R + 12.0  # thin moat so the dot reads clearly against the artwork
BADGE_FILL = {"unread": "#989898", "highlight": "#31ff41"}


def square(img: Image.Image) -> Image.Image:
    w, h = img.size
    s = min(w, h)
    return img.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))


def disc(img: Image.Image) -> Image.Image:
    """Cut everything outside the inscribed circle to full transparency."""
    size = img.size[0]
    ss = 4  # supersample the mask so the edge is smooth at small sizes
    mask = Image.new("L", (size * ss, size * ss), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size * ss - 1, size * ss - 1), fill=255)
    mask = mask.resize((size, size), Image.Resampling.LANCZOS)
    out = img.convert("RGBA").copy()
    out.putalpha(mask)
    return out


def data_uri(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def svg(mark: Image.Image, size: int = 512, inset: float = 0.0) -> str:
    inner = int(size * (1 - inset * 2))
    off = int(size * inset)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'width="{size}" height="{size}" viewBox="0 0 {size} {size}">\n'
        f'  <image x="{off}" y="{off}" width="{inner}" height="{inner}" '
        f'href="{data_uri(mark)}" xlink:href="{data_uri(mark)}" />\n'
        f"</svg>\n"
    )


def svg_badged(mark: Image.Image, color: str, size: int = 512) -> str:
    """Disc + a notification dot, with the disc notched around it (upstream geometry)."""
    href = data_uri(mark)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'width="{size}" height="{size}" viewBox="0 0 {size} {size}">\n'
        f'  <defs>\n'
        f'    <mask id="notch">\n'
        f'      <rect width="{size}" height="{size}" fill="#ffffff" />\n'
        f'      <circle cx="{BADGE_CX}" cy="{BADGE_CY}" r="{NOTCH_R}" fill="#000000" />\n'
        f'    </mask>\n'
        f'  </defs>\n'
        f'  <image x="0" y="0" width="{size}" height="{size}" '
        f'href="{href}" xlink:href="{href}" mask="url(#notch)" />\n'
        f'  <circle cx="{BADGE_CX}" cy="{BADGE_CY}" r="{BADGE_R}" fill="{color}" />\n'
        f"</svg>\n"
    )


def write(path: pathlib.Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    print(f"  {path.relative_to(ROOT)}  {len(data):,} bytes")


def main() -> int:
    if not SRC.is_file():
        print(f"mark not found: {SRC}", file=sys.stderr)
        return 1
    src = square(Image.open(SRC).convert("RGBA"))
    print(f"source mark: {SRC}  ({src.size[0]}x{src.size[1]})")

    # Master disc, then upscale from it for the logo ladder.
    master = disc(src)

    print("logo disc:")
    for n in LOGO_SIZES:
        img = master.resize((n, n), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        write(ROOT / "public" / "res" / "logo" / f"logo-{n}x{n}.png", buf.getvalue())

    print("maskable (navy full-bleed + safe zone):")
    for n in MASKABLE_SIZES:
        canvas = Image.new("RGBA", (n, n), NAVY)
        inner = max(1, int(n * SAFE_FRACTION))
        art = master.resize((inner, inner), Image.Resampling.LANCZOS)
        off = (n - inner) // 2
        canvas.alpha_composite(art, (off, off))
        buf = io.BytesIO()
        canvas.save(buf, format="PNG", optimize=True)
        write(
            ROOT / "public" / "res" / "logo-maskable" / f"logo-maskable-{n}x{n}.png",
            buf.getvalue(),
        )

    print("svg wrappers (keep the .svg paths valid):")
    write(
        ROOT / "public" / "res" / "svg" / "logo.svg",
        svg(master, 512, inset=0.0).encode("utf-8"),
    )
    write(
        ROOT / "public" / "res" / "svg" / "logo-maskable.svg",
        svg(master, 512, inset=(1 - SAFE_FRACTION) / 2).encode("utf-8"),
    )

    print("badged favicons (unread / highlight):")
    for name, fill in BADGE_FILL.items():
        write(
            ROOT / "public" / "res" / "svg" / f"{name}.svg",
            svg_badged(master, fill).encode("utf-8"),
        )

    print("favicon:")
    fav = master.resize((64, 64), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    fav.save(buf, format="PNG", optimize=True)
    write(ROOT / "public" / "favicon.png", buf.getvalue())

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
