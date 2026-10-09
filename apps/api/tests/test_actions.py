from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from chizma_api.actions.schemas import ActionHolder, from_model_output
from tests.test_generation_api import signed_in

ClientFactory = Callable[..., TestClient]

NONE: dict[str, Any] = {
    "type": "none", "url": None, "new_tab": True, "title": None, "text": None,
    "with_form": False, "form_fields": [], "submit_label": None, "success_text": None,
    "target_id": None, "explanation": "",
}  # fmt: skip


def test_links_only_allow_safe_schemes() -> None:
    for url in ("https://instagram.com/cafe", "mailto:hi@cafe.uz", "tel:+998 90 123 45 67"):
        assert ActionHolder.model_validate({"action": {"type": "link", "url": url}}).action

    for url in ("javascript:alert(1)", "data:text/html,x", "ftp://x", "//evil.example"):
        with pytest.raises(ValidationError):
            ActionHolder.model_validate({"action": {"type": "link", "url": url}})


def test_model_output_with_unknown_target_is_rejected_for_retry() -> None:
    with pytest.raises(ValueError, match="target_id must be one of"):
        from_model_output({**NONE, "type": "toggle", "target_id": "ghost"}, {"el_2"})


def test_model_output_becomes_a_form_window() -> None:
    raw = {
        **NONE,
        "type": "modal",
        "title": "Записаться",
        "with_form": True,
        "form_fields": [{"name": "phone", "label": "Телефон", "type": "tel", "required": True}],
        "submit_label": "Отправить",
        "success_text": "Спасибо!",
        "explanation": "Откроет окно записи",
    }

    action, explanation = from_model_output(raw, set())

    assert action.type == "modal"
    assert action.form.fields[0].name == "phone"
    assert explanation == "Откроет окно записи"


def suggest(
    client: TestClient, instruction: str, targets: list[dict[str, str]] | None = None
) -> Any:
    return client.post(
        "/v1/actions/suggest",
        json={
            "instruction": instruction,
            "block": {"id": "b1", "kind": "button", "label": "button"},
            "targets": targets or [],
            "locale": "ru",
        },
    )


def test_suggest_picks_a_link_from_words(client_factory: ClientFactory) -> None:
    client = signed_in(client_factory)

    body = suggest(client, "открой https://instagram.com/cafe").json()

    assert body["action"] == {"type": "link", "url": "https://instagram.com/cafe", "new_tab": True}


def test_suggest_toggle_uses_a_given_target(client_factory: ClientFactory) -> None:
    client = signed_in(client_factory)

    body = suggest(
        client, "показывай описание", [{"id": "b2", "kind": "text", "label": "описание"}]
    ).json()

    assert body["action"] == {"type": "toggle", "target_id": "b2", "start_hidden": True}


def test_suggest_requires_sign_in_and_counts_quota(client_factory: ClientFactory) -> None:
    assert suggest(client_factory(env="test"), "x").status_code == 401

    client = signed_in(client_factory, daily_user_limit=1)
    assert suggest(client, "открой https://a.example").status_code == 200
    assert suggest(client, "открой https://a.example").json()["detail"] == "daily_limit"
