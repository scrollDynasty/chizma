import json
from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient

from chizma_api.generation.providers import AIProviderError, ModelReply, RefineInput, SketchInput
from chizma_api.generation.schemas import SceneGraph
from tests.sketches import HOUSE_AND_SUN, PNG

ClientFactory = Callable[..., TestClient]


def signed_in(factory: ClientFactory, login: str = "aziza", **overrides: Any) -> TestClient:
    settings: dict[str, Any] = {"env": "test", "min_seconds_between_generations": 0}
    settings.update(overrides)
    client = factory(**settings)
    token = client.post("/v1/auth/test-login", json={"login": login}).json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client


def start(client: TestClient, png: bytes = PNG, **fields: Any) -> Any:
    data = {"shapes": json.dumps(HOUSE_AND_SUN), "width": "380", "height": "220", "locale": "ru"}
    data.update(fields)
    return client.post("/v1/generations", files={"image": ("s.png", png, "image/png")}, data=data)


def test_requires_sign_in(client_factory: ClientFactory) -> None:
    client = client_factory(env="test")

    assert start(client).status_code == 401


def test_generates_scene_and_blocks(client_factory: ClientFactory) -> None:
    client = signed_in(client_factory)

    started = start(client)
    assert started.status_code == 202
    job = client.get(f"/v1/generations/{started.json()['id']}").json()

    assert job["status"] == "done"
    assert job["error"] is None
    assert len(job["scene"]["elements"]) == 3
    assert {b["element_id"] for b in job["blocks"]} == {"el_1", "el_2", "el_3"}


def test_other_users_cannot_read_a_job(client_factory: ClientFactory) -> None:
    owner = signed_in(client_factory, "owner")
    job_id = start(owner).json()["id"]
    stranger = signed_in(client_factory, "stranger")

    assert stranger.get(f"/v1/generations/{job_id}").status_code == 404


def test_rejects_bad_input(client_factory: ClientFactory) -> None:
    client = signed_in(client_factory, max_image_bytes=100)

    assert start(client, png=b"GIF89a").json()["detail"] == "invalid_image"
    assert start(client, png=PNG + b"0" * 200).status_code == 413
    assert start(client, locale="de").json()["detail"] == "invalid_locale"
    assert start(client, shapes="{oops").json()["detail"] == "invalid_shapes"


def test_daily_limit_per_user(client_factory: ClientFactory) -> None:
    client = signed_in(client_factory, daily_user_limit=2)

    assert start(client).status_code == 202
    assert start(client).status_code == 202
    blocked = start(client)

    assert blocked.status_code == 429
    assert blocked.json()["detail"] == "daily_limit"
    assert client.get("/v1/generations/quota").json() == {"used": 2, "limit": 2, "remaining": 0}


def test_requests_too_close_together_are_refused(client_factory: ClientFactory) -> None:
    client = signed_in(client_factory, min_seconds_between_generations=60)

    assert start(client).status_code == 202
    assert start(client).json()["detail"] == "too_fast"


def test_daily_budget_stops_everyone(client_factory: ClientFactory) -> None:
    client = signed_in(client_factory, daily_budget_usd=0)

    response = start(client)

    assert response.status_code == 429
    assert response.json()["detail"] == "budget_exhausted"


def test_kill_switch(client_factory: ClientFactory) -> None:
    client = signed_in(client_factory, generation_enabled=False)

    response = start(client)

    assert response.status_code == 503
    assert response.json()["detail"] == "generation_disabled"


class BrokenProvider:
    name = "broken"

    async def recognize(self, sketch: SketchInput, feedback: str | None) -> ModelReply:
        raise AIProviderError("RateLimitError")

    async def generate_blocks(
        self, sketch: SketchInput, scene: SceneGraph, feedback: str | None
    ) -> ModelReply:
        raise AIProviderError("RateLimitError")

    async def refine_block(self, refine: RefineInput, feedback: str | None) -> ModelReply:
        raise AIProviderError("RateLimitError")


def test_provider_failure_is_reported_on_the_job(client_factory: ClientFactory) -> None:
    client = signed_in(client_factory)
    client.app.state.ai_provider = BrokenProvider()  # type: ignore[attr-defined]

    job = client.get(f"/v1/generations/{start(client).json()['id']}").json()

    assert job["status"] == "failed"
    assert job["error"] == "ai_unavailable"


def test_openai_without_key_keeps_the_api_up(client_factory: ClientFactory) -> None:
    client = signed_in(client_factory, ai_provider="openai", openai_api_key="")

    assert client.get("/health").status_code == 200
    job = client.get(f"/v1/generations/{start(client).json()['id']}").json()
    assert job["error"] == "ai_unavailable"


SUN_ELEMENT = {
    "id": "el_1",
    "kind": "illustration",
    "label": "sun",
    "intent": "illustration of a sun",
    "bbox": {"x": 0.7, "y": 0.0, "w": 0.2, "h": 0.3},
    "confidence": 0.9,
    "parent_id": None,
    "source_shape_ids": ["sun"],
    "text": None,
    "style_hints": {"colors": ["#f08c00"], "shape": "circle", "notes": ""},
    "alternatives": [],
}
SUN_HTML = (
    '<svg viewBox="0 0 100 100"><ellipse cx="50" cy="50" rx="47" ry="47" fill="#ffec99"/></svg>'
)


def refine(client: TestClient, png: bytes | None = None, **fields: Any) -> Any:
    data = {
        "element": json.dumps(SUN_ELEMENT),
        "html": SUN_HTML,
        "css": "",
        "width": "100",
        "height": "100",
        "locale": "ru",
    }
    data.update(fields)
    files = {"image": ("drawn.png", png, "image/png")} if png is not None else None
    return client.post("/v1/generations/refine", data=data, files=files)


def test_refine_changes_one_block_by_words(client_factory: ClientFactory) -> None:
    client = signed_in(client_factory)

    started = refine(client, instruction="сделай синим")
    assert started.status_code == 202
    job = client.get(f"/v1/generations/{started.json()['id']}").json()

    assert job["status"] == "done"
    assert job["scene"] is None
    assert [b["element_id"] for b in job["blocks"]] == ["el_1"]
    assert 'fill="#1971c2"' in job["blocks"][0]["html"]


def test_refine_uses_strokes_drawn_over_the_block(client_factory: ClientFactory) -> None:
    client = signed_in(client_factory)
    door = [
        {
            "id": "d",
            "type": "rectangle",
            "x": 40,
            "y": 60,
            "width": 20,
            "height": 40,
            "stroke": "#000000",
        }
    ]

    started = refine(client, png=PNG, shapes=json.dumps(door))
    job = client.get(f"/v1/generations/{started.json()['id']}").json()

    assert job["status"] == "done"
    assert '<rect x="40.0" y="60.0" width="20.0" height="40.0"' in job["blocks"][0]["html"]


def test_refine_needs_words_or_strokes(client_factory: ClientFactory) -> None:
    client = signed_in(client_factory)

    assert refine(client, instruction="   ").json()["detail"] == "nothing_to_change"
    assert refine(client, element="{}", instruction="x").json()["detail"] == "invalid_element"


def test_refine_counts_towards_the_daily_quota(client_factory: ClientFactory) -> None:
    client = signed_in(client_factory, daily_user_limit=1)

    assert refine(client, instruction="красным").status_code == 202
    assert refine(client, instruction="зелёным").json()["detail"] == "daily_limit"


def test_refine_output_is_sanitised(client_factory: ClientFactory) -> None:
    client = signed_in(client_factory)

    started = refine(client, instruction="<script>alert(1)</script> подпись")
    html = client.get(f"/v1/generations/{started.json()['id']}").json()["blocks"][0]["html"]

    assert "<script" not in html
    assert "&lt;script&gt;" in html
