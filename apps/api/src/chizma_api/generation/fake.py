"""Deterministic provider for development, CI and demos: no network, no key, no cost.

Each drawn shape becomes one element; the block is a clean SVG/HTML rendering of that
shape in its drawn colours. It is not smart, but it exercises the whole pipeline.
"""

import json
import re
from html import escape
from typing import Any

from chizma_api.generation.providers import (
    ModelReply,
    RefineInput,
    SketchInput,
    SuggestInput,
    Usage,
)
from chizma_api.generation.schemas import SceneGraph

_KIND = {
    "rectangle": ("section", "box"),
    "ellipse": ("illustration", "circle"),
    "diamond": ("illustration", "diamond"),
    "text": ("heading", "text"),
    "arrow": ("icon", "arrow"),
    "line": ("illustration", "line"),
    "freedraw": ("illustration", "scribble"),
}

_QUESTION = {
    "en": ("What is this scribble?", ["picture", "logo", "decoration"]),
    "ru": ("Что это за рисунок?", ["картинка", "логотип", "украшение"]),
    "uz-Latn": ("Bu qanday chizma?", ["rasm", "logotip", "bezak"]),
    "uz-Cyrl": ("Бу қандай чизма?", ["расм", "логотип", "безак"]),
}

# Colour words the fake understands in edit requests (en, ru, uz).
_COLOURS = {
    "red": "#e03131", "красн": "#e03131", "qizil": "#e03131",
    "blue": "#1971c2", "син": "#1971c2", "ko'k": "#1971c2", "kok": "#1971c2",
    "green": "#2f9e44", "зел": "#2f9e44", "yashil": "#2f9e44",
    "yellow": "#f08c00", "жёлт": "#f08c00", "желт": "#f08c00", "sariq": "#f08c00",
}  # fmt: skip

_TITLE = {"en": "My site", "ru": "Мой сайт", "uz-Latn": "Mening saytim", "uz-Cyrl": "Менинг сайтим"}


def _colour(value: Any, default: str) -> str:
    text = str(value or "")
    if text.startswith("#") and 4 <= len(text) <= 9 and text[1:].isalnum():
        return text
    return default


class FakeProvider:
    name = "fake"

    async def recognize(self, sketch: SketchInput, feedback: str | None) -> ModelReply:
        width = max(sketch.width, 1.0)
        height = max(sketch.height, 1.0)
        elements: list[dict[str, Any]] = []
        questions: list[dict[str, Any]] = []
        shapes = sorted(sketch.shapes, key=lambda s: (s.get("y", 0), s.get("x", 0)))
        for index, shape in enumerate(shapes[:40], start=1):
            kind, label = _KIND.get(str(shape.get("type")), ("illustration", "shape"))
            element_id = f"el_{index}"
            confident = shape.get("type") != "freedraw"
            stroke = _colour(shape.get("stroke"), "#1e1e1e")
            fill = _colour(shape.get("fill"), "")
            elements.append(
                {
                    "id": element_id,
                    "kind": kind,
                    "label": label,
                    "intent": f"{kind} drawn as a {label}",
                    "bbox": {
                        "x": float(shape.get("x", 0)) / width,
                        "y": float(shape.get("y", 0)) / height,
                        "w": float(shape.get("width", 0)) / width,
                        "h": float(shape.get("height", 0)) / height,
                    },
                    "confidence": 0.9 if confident else 0.5,
                    "parent_id": None,
                    "source_shape_ids": [str(shape.get("id", ""))],
                    "text": shape.get("text"),
                    "style_hints": {
                        "colors": [c for c in (stroke, fill) if c],
                        "shape": label,
                        "notes": "",
                    },
                    "alternatives": []
                    if confident
                    else [{"kind": "image", "label": "picture", "confidence": 0.3}],
                }
            )
            if not confident:
                text, options = _QUESTION.get(sketch.locale, _QUESTION["en"])
                questions.append({"element_id": element_id, "text": text, "options": options})
        scene = {
            "schema_version": "0.1",
            "page": {
                "title": _TITLE.get(sketch.locale, "My site"),
                "locale": sketch.locale,
                "palette": [],
                "mood": "friendly",
            },
            "elements": elements,
            "questions": questions,
        }
        return ModelReply(text=json.dumps(scene, ensure_ascii=False), usage=Usage(calls=1))

    async def generate_blocks(
        self, sketch: SketchInput, scene: SceneGraph, feedback: str | None
    ) -> ModelReply:
        blocks = [
            {"element_id": el.id, **_render(el.style_hints.shape, el.text, el.style_hints.colors)}
            for el in scene.elements
        ]
        return ModelReply(text=json.dumps({"blocks": blocks}), usage=Usage(calls=1))

    async def refine_block(self, refine: RefineInput, feedback: str | None) -> ModelReply:
        block = {"element_id": refine.element.id, **_refine(refine)}
        return ModelReply(text=json.dumps({"blocks": [block]}), usage=Usage(calls=1))

    async def suggest_action(self, suggest: SuggestInput, feedback: str | None) -> ModelReply:
        return ModelReply(text=json.dumps(_suggest(suggest)), usage=Usage(calls=1))


def _render(shape: str, text: str | None, colors: list[str]) -> dict[str, str]:
    stroke = colors[0] if colors else "#1e1e1e"
    fill = colors[1] if len(colors) > 1 else "none"
    svg = (
        '<svg viewBox="0 0 100 100" width="100%" height="100%" '
        'preserveAspectRatio="none" role="img">{}</svg>'
    )
    if shape == "text":
        return {
            "html": f'<h2 class="title">{escape(text or "")}</h2>',
            "css": ".title{margin:0;font:600 clamp(1.25rem,3vw,2rem)/1.2 system-ui,sans-serif;}",
        }
    if shape == "box":
        return {
            "html": '<div class="box"></div>',
            "css": f".box{{width:100%;height:100%;min-height:80px;border-radius:16px;"
            f"border:2px solid {stroke};background:{'#f8fafc' if fill == 'none' else fill};}}",
        }
    if shape == "circle":
        body = (
            f'<ellipse cx="50" cy="50" rx="47" ry="47" fill="{fill}" stroke="{stroke}" '
            f'stroke-width="3" vector-effect="non-scaling-stroke"/>'
        )
    elif shape == "diamond":
        body = (
            f'<polygon points="50,4 96,50 50,96 4,50" fill="{fill}" '
            f'stroke="{stroke}" stroke-width="3" vector-effect="non-scaling-stroke"/>'
        )
    else:
        body = (
            f'<rect x="4" y="4" width="92" height="92" rx="12" fill="none" '
            f'stroke="{stroke}" stroke-width="3" stroke-dasharray="6 6"/>'
        )
    return {"html": svg.format(body), "css": "svg{display:block;}"}


def _colour_in(text: str) -> str | None:
    lowered = text.lower()
    for word, colour in _COLOURS.items():
        if word in lowered:
            return colour
    return None


def _refine(refine: RefineInput) -> dict[str, str]:
    """Recolour on colour words, add the request as a caption otherwise, outline drawn strokes."""
    html, css = refine.block.html, refine.block.css
    colour = _colour_in(refine.instruction)
    if colour:
        html = re.sub(r'fill="(?!none)[^"]*"', f'fill="{colour}"', html, count=1)
        css = re.sub(r"background:[^;}]*", f"background:{colour}", css, count=1)
    elif refine.instruction.strip():
        html += f'<p class="note">{escape(refine.instruction.strip())}</p>'
        css += ".note{position:absolute;left:0;right:0;bottom:4px;margin:0;text-align:center;"
        css += "font:600 14cqh/1 system-ui,sans-serif;}"
    if refine.shapes:
        width, height = max(refine.width, 1.0), max(refine.height, 1.0)
        rects = "".join(
            f'<rect x="{float(s.get("x", 0))}" y="{float(s.get("y", 0))}" '
            f'width="{float(s.get("width", 0))}" height="{float(s.get("height", 0))}" '
            f'fill="none" stroke="{_colour(s.get("stroke"), "#1e1e1e")}" stroke-width="2"/>'
            for s in refine.shapes[:50]
        )
        html += (
            f'<svg class="drawn" viewBox="0 0 {width} {height}" preserveAspectRatio="none">'
            f"{rects}</svg>"
        )
        css += ".drawn{position:absolute;inset:0;width:100%;height:100%;}"
    css += ".refined{position:relative;width:100%;height:100%;}"
    return {"html": f'<div class="refined">{html}</div>', "css": css}


_URL = re.compile(r"(https?://\S+|mailto:\S+|tel:\+?[0-9 ()-]+)", re.I)


def _suggest(suggest: SuggestInput) -> dict[str, object]:
    """Keyword rules standing in for the model: link, form window, toggle or scroll."""
    text = suggest.instruction.lower()
    answer: dict[str, object] = {
        "type": "none", "url": None, "new_tab": True, "title": None, "text": None,
        "with_form": False, "form_fields": [], "submit_label": None, "success_text": None,
        "target_id": None, "explanation": "",
    }  # fmt: skip
    target = suggest.targets[0]["id"] if suggest.targets else None
    url = _URL.search(suggest.instruction)
    if url:
        answer.update(type="link", url=url.group(1).strip(), explanation="link")
    elif any(w in text for w in ("форм", "заяв", "запис", "form", "book", "ariza", "yozil")):
        answer.update(
            type="modal", title=suggest.instruction.strip()[:80], text="", with_form=True,
            form_fields=[
                {"name": "name", "label": "Name", "type": "text", "required": True},
                {"name": "phone", "label": "Phone", "type": "tel", "required": True},
            ],
            submit_label="OK", success_text="Thank you!", explanation="form",
        )  # fmt: skip
    elif target and any(w in text for w in ("показ", "скр", "раскр", "show", "hide", "toggle")):
        answer.update(type="toggle", target_id=target, explanation="toggle")
    elif target and any(w in text for w in ("прокрут", "перейти к", "scroll", "jump")):
        answer.update(type="scroll", target_id=target, explanation="scroll")
    elif any(w in text for w in ("окно", "modal", "popup", "oyna")):
        answer.update(
            type="modal", title=suggest.instruction.strip()[:80], text="", explanation="modal"
        )
    return answer
