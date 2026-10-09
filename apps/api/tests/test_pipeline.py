import json

import pytest

from chizma_api.generation.fake import FakeProvider
from chizma_api.generation.pipeline import InvalidModelOutputError, run_pipeline
from chizma_api.generation.providers import ModelReply, SketchInput, Usage
from chizma_api.generation.schemas import SceneGraph
from tests.sketches import house_and_sun


async def test_fake_provider_turns_each_shape_into_a_block() -> None:
    stages: list[str] = []

    result = await run_pipeline(FakeProvider(), house_and_sun(), stages.append)

    assert stages == ["recognizing", "building"]
    assert [e.label for e in result.scene.elements] == ["circle", "diamond", "box"]
    assert result.scene.page.title == "Мой сайт"
    assert [b.element_id for b in result.blocks] == ["el_1", "el_2", "el_3"]
    sun = result.scene.elements[0]
    assert sun.bbox.x == pytest.approx(300 / 380)
    assert "<circle" in result.blocks[0].html


class ScriptedProvider:
    """Replays prepared answers to check retries and post-processing."""

    name = "scripted"

    def __init__(self, scenes: list[str], blocks: list[str]) -> None:
        self.scenes = scenes
        self.blocks = blocks
        self.feedback: list[str | None] = []

    async def recognize(self, sketch: SketchInput, feedback: str | None) -> ModelReply:
        self.feedback.append(feedback)
        return ModelReply(self.scenes.pop(0), Usage(10, 5, 0.001, 1))

    async def generate_blocks(
        self, sketch: SketchInput, scene: SceneGraph, feedback: str | None
    ) -> ModelReply:
        self.feedback.append(feedback)
        return ModelReply(self.blocks.pop(0), Usage(20, 50, 0.002, 1))


async def _valid_scene() -> str:
    reply = await FakeProvider().recognize(house_and_sun(), None)
    return reply.text


async def test_invalid_scene_is_retried_with_the_error() -> None:
    blocks = json.dumps({"blocks": [{"element_id": "el_1", "html": "<p>ok</p>", "css": ""}]})
    provider = ScriptedProvider(['{"elements": "nope"}', await _valid_scene()], [blocks])

    result = await run_pipeline(provider, house_and_sun())

    assert provider.feedback[0] is None
    assert provider.feedback[1] is not None and "schema_version" in provider.feedback[1]
    assert result.usage.calls == 3
    assert result.usage.cost_usd == pytest.approx(0.004)


async def test_two_invalid_answers_fail_cleanly() -> None:
    provider = ScriptedProvider(["not json", "{}"], [])

    with pytest.raises(InvalidModelOutputError):
        await run_pipeline(provider, house_and_sun())


async def test_blocks_are_sanitised_and_unknown_ids_dropped() -> None:
    blocks = json.dumps(
        {
            "blocks": [
                {"element_id": "el_1", "html": '<p onclick="x()">Sun<script>1</script></p>',
                 "css": "@import url(https://x/y.css); p{color:red}"},
                {"element_id": "el_1", "html": "<p>duplicate</p>", "css": ""},
                {"element_id": "ghost", "html": "<p>?</p>", "css": ""},
            ]
        }
    )  # fmt: skip
    provider = ScriptedProvider([await _valid_scene()], [blocks])

    result = await run_pipeline(provider, house_and_sun())

    assert len(result.blocks) == 1
    assert result.blocks[0].html == "<p>Sun</p>"
    assert "https://" not in result.blocks[0].css


async def test_out_of_range_numbers_are_clamped() -> None:
    scene = json.loads(await _valid_scene())
    scene["elements"][0]["source_shape_ids"] = []  # no shapes: the model estimate is used
    scene["elements"][0]["bbox"] = {"x": -0.2, "y": 0.1, "w": 1.7, "h": 0.5}
    scene["elements"][0]["confidence"] = 3
    blocks = json.dumps({"blocks": []})
    provider = ScriptedProvider([json.dumps(scene)], [blocks])

    result = await run_pipeline(provider, house_and_sun())

    first = result.scene.elements[0]
    assert (first.bbox.x, first.bbox.w, first.confidence) == (0.0, 1.0, 1.0)


async def test_positions_come_from_the_drawn_shapes_not_the_model() -> None:
    scene = json.loads(await _valid_scene())
    # The model groups roof + walls into one house but guesses its position badly.
    scene["elements"] = [scene["elements"][1]]
    scene["elements"][0]["source_shape_ids"] = ["roof", "walls"]
    scene["elements"][0]["bbox"] = {"x": 0.5, "y": 0.5, "w": 0.1, "h": 0.1}
    provider = ScriptedProvider([json.dumps(scene)], [json.dumps({"blocks": []})])

    result = await run_pipeline(provider, house_and_sun())

    bbox = result.scene.elements[0].bbox
    assert (bbox.x, bbox.y) == (0.0, pytest.approx(40 / 220))
    assert (bbox.w, bbox.h) == (pytest.approx(160 / 380), pytest.approx(180 / 220))
