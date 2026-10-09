"""Scene graph and block contracts.

``SCENE_JSON_SCHEMA`` / ``BLOCKS_JSON_SCHEMA`` are sent to the model (strict structured
output: every property required, nulls explicit). The Pydantic models re-validate the
answer and clamp numbers into range, because strict mode does not enforce min/max.
"""

from typing import Annotated, Any, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, field_validator

Locale = Literal["uz-Latn", "uz-Cyrl", "ru", "en"]
LOCALES: tuple[str, ...] = ("uz-Latn", "uz-Cyrl", "ru", "en")


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, value))


def _cut(limit: int) -> BeforeValidator:
    """Trim over-long model output instead of rejecting it (a retry costs money and time)."""
    return BeforeValidator(lambda value: value[:limit] if isinstance(value, str | list) else value)


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class BBox(_Strict):
    """Position relative to the whole drawing, 0..1 on both axes."""

    x: float
    y: float
    w: float
    h: float

    @field_validator("x", "y", "w", "h")
    @classmethod
    def _in_unit_range(cls, value: float) -> float:
        return _clamp(value)


class StyleHints(_Strict):
    colors: Annotated[list[str], _cut(8)]
    shape: Annotated[str, _cut(80)]
    notes: Annotated[str, _cut(300)]


class Alternative(_Strict):
    kind: Annotated[str, _cut(40)]
    label: Annotated[str, _cut(80)]
    confidence: float

    @field_validator("confidence")
    @classmethod
    def _clamp_confidence(cls, value: float) -> float:
        return _clamp(value)


class Element(_Strict):
    id: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,40}$")
    kind: Annotated[str, _cut(40)]
    label: Annotated[str, _cut(80)]
    intent: Annotated[str, _cut(300)]
    bbox: BBox
    confidence: float
    parent_id: str | None
    source_shape_ids: Annotated[list[str], _cut(200)]
    text: Annotated[str | None, _cut(500)]
    style_hints: StyleHints
    alternatives: Annotated[list[Alternative], _cut(4)]

    @field_validator("confidence")
    @classmethod
    def _clamp_confidence(cls, value: float) -> float:
        return _clamp(value)


class Question(_Strict):
    element_id: str
    text: Annotated[str, _cut(200)]
    options: Annotated[list[str], _cut(5)]


class PageInfo(_Strict):
    title: Annotated[str, _cut(80)]
    locale: Locale
    palette: Annotated[list[str], _cut(8)]
    mood: Annotated[str, _cut(60)]


class SceneGraph(_Strict):
    schema_version: Literal["0.1"]
    page: PageInfo
    elements: Annotated[list[Element], _cut(40)]
    questions: Annotated[list[Question], _cut(10)]


class Block(_Strict):
    element_id: str
    html: str = Field(max_length=20_000)
    css: str = Field(max_length=10_000)


class BlockSet(_Strict):
    blocks: Annotated[list[Block], _cut(40)]


def _obj(properties: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "required": list(properties),
        "properties": properties,
    }


_STR: dict[str, Any] = {"type": "string"}
_NUM: dict[str, Any] = {"type": "number"}
_STR_LIST: dict[str, Any] = {"type": "array", "items": _STR}
_NULLABLE_STR: dict[str, Any] = {"type": ["string", "null"]}

SCENE_JSON_SCHEMA: dict[str, Any] = _obj(
    {
        "schema_version": {"type": "string", "enum": ["0.1"]},
        "page": _obj(
            {
                "title": _STR,
                "locale": {"type": "string", "enum": list(LOCALES)},
                "palette": _STR_LIST,
                "mood": _STR,
            }
        ),
        "elements": {
            "type": "array",
            "items": _obj(
                {
                    "id": _STR,
                    "kind": _STR,
                    "label": _STR,
                    "intent": _STR,
                    "bbox": _obj({"x": _NUM, "y": _NUM, "w": _NUM, "h": _NUM}),
                    "confidence": _NUM,
                    "parent_id": _NULLABLE_STR,
                    "source_shape_ids": _STR_LIST,
                    "text": _NULLABLE_STR,
                    "style_hints": _obj({"colors": _STR_LIST, "shape": _STR, "notes": _STR}),
                    "alternatives": {
                        "type": "array",
                        "items": _obj({"kind": _STR, "label": _STR, "confidence": _NUM}),
                    },
                }
            ),
        },
        "questions": {
            "type": "array",
            "items": _obj({"element_id": _STR, "text": _STR, "options": _STR_LIST}),
        },
    }
)

BLOCKS_JSON_SCHEMA: dict[str, Any] = _obj(
    {
        "blocks": {
            "type": "array",
            "items": _obj({"element_id": _STR, "html": _STR, "css": _STR}),
        }
    }
)
