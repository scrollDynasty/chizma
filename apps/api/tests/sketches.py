"""Shared sketch fixtures: a house (rectangle + diamond roof) and a sun."""

from chizma_api.generation.providers import SketchInput

# Smallest valid PNG header + IHDR; the fake provider never decodes it.
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR" + b"\x00" * 17

HOUSE_AND_SUN = [
    {"id": "roof", "type": "diamond", "x": 0, "y": 40, "width": 160, "height": 90,
     "stroke": "#1e1e1e", "fill": None, "text": None},
    {"id": "sun", "type": "ellipse", "x": 300, "y": 0, "width": 80, "height": 80,
     "stroke": "#f08c00", "fill": "#ffec99", "text": None},
    {"id": "walls", "type": "rectangle", "x": 10, "y": 110, "width": 140, "height": 110,
     "stroke": "#1e1e1e", "fill": None, "text": None},
]  # fmt: skip


def house_and_sun(locale: str = "ru") -> SketchInput:
    return SketchInput(png=PNG, shapes=HOUSE_AND_SUN, width=380, height=220, locale=locale)
