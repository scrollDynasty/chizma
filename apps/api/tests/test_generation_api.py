import json
from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient

from chizma_api.generation.providers import AIProviderError, ModelReply, SketchInput
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
