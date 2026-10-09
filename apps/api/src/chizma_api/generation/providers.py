"""AI providers behind one interface (principle: no lock-in to a single vendor)."""

import base64
import json
import logging
from dataclasses import dataclass, field
from typing import Any, Protocol

from chizma_api.config import Settings
from chizma_api.generation import prompts
from chizma_api.generation.schemas import BLOCKS_JSON_SCHEMA, SCENE_JSON_SCHEMA, SceneGraph

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class SketchInput:
    png: bytes
    shapes: list[dict[str, Any]]
    width: float
    height: float
    locale: str


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    calls: int = 0

    def add(self, other: "Usage") -> None:
        self.input_tokens += other.input_tokens
        self.output_tokens += other.output_tokens
        self.cost_usd += other.cost_usd
        self.calls += other.calls


@dataclass
class ModelReply:
    text: str
    usage: Usage = field(default_factory=Usage)


class AIProviderError(Exception):
    """The provider failed (network, refusal, quota). The message is safe to log."""


class AIProvider(Protocol):
    name: str

    async def recognize(self, sketch: SketchInput, feedback: str | None) -> ModelReply: ...

    async def generate_blocks(
        self, sketch: SketchInput, scene: SceneGraph, feedback: str | None
    ) -> ModelReply: ...


def _with_feedback(text: str, feedback: str | None) -> str:
    if feedback:
        text += f"\n\nYour previous answer was invalid: {feedback}\nFix it and answer again."
    return text


def sketch_context(sketch: SketchInput, feedback: str | None) -> str:
    context = {
        "locale": sketch.locale,
        "drawing_size": {"width": sketch.width, "height": sketch.height},
        "shapes": sketch.shapes,
    }
    return _with_feedback(json.dumps(context, ensure_ascii=False), feedback)


class OpenAIProvider:
    """OpenAI Responses API with strict JSON-schema output."""

    name = "openai"

    def __init__(self, settings: Settings) -> None:
        from openai import AsyncOpenAI  # lazy: the fake provider does not need it

        api_key = settings.openai_api_key.get_secret_value()
        if not api_key:
            raise AIProviderError("OPENAI_API_KEY is not set")
        self._client = AsyncOpenAI(api_key=api_key, timeout=120, max_retries=1)
        self._model = settings.ai_model
        self._in_price = settings.ai_input_usd_per_mtok
        self._out_price = settings.ai_output_usd_per_mtok

    async def _call(
        self,
        instructions: str,
        content: list[dict[str, Any]],
        schema_name: str,
        schema: dict[str, Any],
        max_output_tokens: int,
    ) -> ModelReply:
        import openai

        try:
            response = await self._client.responses.create(  # type: ignore[call-overload]
                model=self._model,
                instructions=instructions,
                input=[{"role": "user", "content": content}],
                text={
                    "format": {
                        "type": "json_schema",
                        "name": schema_name,
                        "schema": schema,
                        "strict": True,
                    }
                },
                max_output_tokens=max_output_tokens,
                store=False,
            )
        except openai.OpenAIError as exc:
            # Server log only: status and provider message help diagnose model/parameter issues.
            status = getattr(exc, "status_code", None)
            log.warning("OpenAI %s (status %s): %s", type(exc).__name__, status, str(exc)[:500])
            raise AIProviderError(type(exc).__name__) from exc

        usage = Usage(calls=1)
        if response.usage:
            usage.input_tokens = response.usage.input_tokens
            usage.output_tokens = response.usage.output_tokens
            usage.cost_usd = (
                usage.input_tokens * self._in_price + usage.output_tokens * self._out_price
            ) / 1_000_000
        if response.status == "incomplete":
            raise AIProviderError("output cut off by max_output_tokens")
        return ModelReply(text=response.output_text, usage=usage)

    @staticmethod
    def _image(sketch: SketchInput) -> dict[str, Any]:
        data = base64.b64encode(sketch.png).decode()
        return {
            "type": "input_image",
            "image_url": f"data:image/png;base64,{data}",
            "detail": "auto",
        }

    async def recognize(self, sketch: SketchInput, feedback: str | None) -> ModelReply:
        content = [
            {"type": "input_text", "text": sketch_context(sketch, feedback)},
            self._image(sketch),
        ]
        return await self._call(prompts.RECOGNIZE, content, "scene_graph", SCENE_JSON_SCHEMA, 8_000)

    async def generate_blocks(
        self, sketch: SketchInput, scene: SceneGraph, feedback: str | None
    ) -> ModelReply:
        text = _with_feedback("Scene graph:\n" + scene.model_dump_json(), feedback)
        content = [{"type": "input_text", "text": text}, self._image(sketch)]
        return await self._call(
            prompts.GENERATE_BLOCKS, content, "blocks", BLOCKS_JSON_SCHEMA, 16_000
        )


class UnavailableProvider:
    """Used when the configured provider cannot start (e.g. missing key): the API stays up
    and every generation fails with a clear error instead of crashing the app."""

    def __init__(self, name: str, reason: str) -> None:
        self.name = name
        self._reason = reason

    async def recognize(self, sketch: SketchInput, feedback: str | None) -> ModelReply:
        raise AIProviderError(self._reason)

    async def generate_blocks(
        self, sketch: SketchInput, scene: SceneGraph, feedback: str | None
    ) -> ModelReply:
        raise AIProviderError(self._reason)


def make_provider(settings: Settings) -> AIProvider:
    if settings.ai_provider == "openai":
        try:
            return OpenAIProvider(settings)
        except AIProviderError as exc:
            log.error("AI provider %s unavailable: %s", settings.ai_provider, exc)
            return UnavailableProvider(settings.ai_provider, str(exc))
    from chizma_api.generation.fake import FakeProvider

    return FakeProvider()
