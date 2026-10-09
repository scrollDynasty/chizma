"""Action registry. The model only picks and configures one of these; it never writes code.

Kinds: link, modal (optionally with a form), toggle (show/hide another block), scroll (to
another block). The published runtime and the editor implement exactly these.
"""

import re
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

SAFE_URL = re.compile(r"^(https?://[^\s<>\"']+|mailto:[^\s<>\"']+|tel:\+?[0-9 ()\-]{3,30})$", re.I)
FIELD_NAME = r"^[a-z][a-z0-9_]{0,30}$"

FieldType = Literal["text", "tel", "email", "textarea"]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class FormField(_Strict):
    name: Annotated[str, Field(pattern=FIELD_NAME)]
    label: Annotated[str, Field(min_length=1, max_length=60)]
    type: FieldType = "text"
    required: bool = True


def unique_fields(fields: list[FormField]) -> list[FormField]:
    names = [f.name for f in fields]
    if len(names) != len(set(names)):
        raise ValueError("form field names must be unique")
    return fields


class FormSpec(_Strict):
    fields: Annotated[list[FormField], Field(min_length=1, max_length=8)]
    submit_label: Annotated[str, Field(min_length=1, max_length=40)]
    success_text: Annotated[str, Field(min_length=1, max_length=200)]
    # Set by the editor after the form is registered on the server.
    id: str | None = None

    @field_validator("fields")
    @classmethod
    def _unique_names(cls, fields: list[FormField]) -> list[FormField]:
        return unique_fields(fields)


class LinkAction(_Strict):
    type: Literal["link"]
    url: Annotated[str, Field(max_length=500)]
    new_tab: bool = True

    @field_validator("url")
    @classmethod
    def _safe_url(cls, url: str) -> str:
        url = url.strip()
        if not SAFE_URL.match(url):
            raise ValueError("url must start with https://, http://, mailto: or tel:")
        return url


class ModalAction(_Strict):
    type: Literal["modal"]
    title: Annotated[str, Field(max_length=80)]
    text: Annotated[str, Field(max_length=1000)] = ""
    form: FormSpec | None = None


class ToggleAction(_Strict):
    type: Literal["toggle"]
    target_id: Annotated[str, Field(min_length=1, max_length=80)]
    start_hidden: bool = True


class ScrollAction(_Strict):
    type: Literal["scroll"]
    target_id: Annotated[str, Field(min_length=1, max_length=80)]


Action = Annotated[
    LinkAction | ModalAction | ToggleAction | ScrollAction, Field(discriminator="type")
]


class ActionHolder(_Strict):
    action: Action | None


def _nullable(schema: dict[str, Any]) -> dict[str, Any]:
    return {"anyOf": [schema, {"type": "null"}]}


_STR = {"type": "string"}
_FIELD = {
    "type": "object",
    "additionalProperties": False,
    "required": ["name", "label", "type", "required"],
    "properties": {
        "name": _STR,
        "label": _STR,
        "type": {"type": "string", "enum": ["text", "tel", "email", "textarea"]},
        "required": {"type": "boolean"},
    },
}

# Flat shape for strict structured output; converted to an Action by `from_model_output`.
SUGGESTION_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "type", "url", "new_tab", "title", "text", "with_form", "form_fields", "submit_label",
        "success_text", "target_id", "explanation",
    ],
    "properties": {
        "type": {"type": "string", "enum": ["link", "modal", "toggle", "scroll", "none"]},
        "url": _nullable(_STR),
        "new_tab": {"type": "boolean"},
        "title": _nullable(_STR),
        "text": _nullable(_STR),
        "with_form": {"type": "boolean"},
        "form_fields": {"type": "array", "items": _FIELD},
        "submit_label": _nullable(_STR),
        "success_text": _nullable(_STR),
        "target_id": _nullable(_STR),
        "explanation": _STR,
    },
}  # fmt: skip


def from_model_output(raw: dict[str, Any], target_ids: set[str]) -> tuple[Any, str]:
    """Turn the model's flat answer into a validated Action (or None) plus its explanation.

    Raises ValueError/ValidationError with a message suitable as retry feedback.
    """
    kind = raw.get("type")
    explanation = str(raw.get("explanation") or "")[:300]
    if kind == "none":
        return None, explanation
    data: dict[str, Any] = {"type": kind}
    if kind == "link":
        data.update(url=raw.get("url") or "", new_tab=bool(raw.get("new_tab", True)))
    elif kind == "modal":
        data.update(title=raw.get("title") or "", text=raw.get("text") or "")
        if raw.get("with_form"):
            data["form"] = {
                "fields": raw.get("form_fields") or [],
                "submit_label": raw.get("submit_label") or "",
                "success_text": raw.get("success_text") or "",
            }
    elif kind in ("toggle", "scroll"):
        target = raw.get("target_id")
        if target not in target_ids:
            raise ValueError(f"target_id must be one of {sorted(target_ids)}")
        data["target_id"] = target
    holder = ActionHolder.model_validate({"action": data})
    return holder.action, explanation
