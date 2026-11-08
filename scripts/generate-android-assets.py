#!/usr/bin/env python3
"""Builds the source images @capacitor/assets needs (assets/) from the official Peerly Collab logo.

Run by .github/workflows/build-apk.yml before `capacitor-assets generate --android`, so the launcher icon and
splash screen always match src/assets/peerly-collab-official-logo.webp. Needs Pillow (`pip install pillow`).
The logo is dark rings on a white square; the rings are located automatically, so a new logo file with the
same look needs no changes here.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "assets" / "peerly-collab-official-logo.webp"
OUTPUT = ROOT / "assets"
WHITE = (255, 255, 255)


def find_rings(image: Image.Image) -> tuple[float, float, float]:
    """Returns the centre x, centre y and width of the dark rings, ignoring the white margin."""
    dark_only = image.convert("L").point(lambda value: 255 if value < 200 else 0)
    box = dark_only.getbbox()
    if box is None:
        raise SystemExit(f"No logo artwork found in {SOURCE}")
    left, top, right, bottom = box
    return (left + right) / 2, (top + bottom) / 2, float(right - left)


def render(logo: Image.Image, rings: tuple[float, float, float], size: int, fraction: float) -> Image.Image:
    """A square white canvas with the rings centred and `fraction` of the canvas wide."""
    center_x, center_y, width = rings
    window = width / fraction
    left, top = round(center_x - window / 2), round(center_y - window / 2)
    side = round(window)
    canvas = Image.new("RGB", (side, side), WHITE)
    canvas.paste(logo, (-left, -top))
    return canvas.resize((size, size), Image.LANCZOS)


def main() -> None:
    logo = Image.open(SOURCE).convert("RGB")
    rings = find_rings(logo)
    OUTPUT.mkdir(exist_ok=True)
    outputs = {
        # Legacy and Play Store icon: rings fill most of the square.
        "icon-only.png": render(logo, rings, 1024, 0.78),
        # Adaptive icon: Android crops this layer to a circle or rounded shape, so the rings stay in the safe zone.
        "icon-foreground.png": render(logo, rings, 1024, 0.58),
        "icon-background.png": Image.new("RGB", (1024, 1024), WHITE),
        # Splash screen: small centred logo on white. The dark variant is the same artwork, since the rings are dark.
        "splash.png": render(logo, rings, 2732, 0.30),
        "splash-dark.png": render(logo, rings, 2732, 0.30),
    }
    for name, image in outputs.items():
        image.save(OUTPUT / name)
        print(f"assets/{name} {image.size[0]}x{image.size[1]}")


if __name__ == "__main__":
    main()
