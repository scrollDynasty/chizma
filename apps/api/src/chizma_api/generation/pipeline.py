"""recognize -> validate (one retry with the error) -> generate blocks -> validate -> sanitise."""

import json
import logging
from collections.abc import Callable
from dataclasses import dataclass, field

from pydantic import BaseModel, ValidationError

from chizma_api.generation.providers import AIProvider, ModelReply, SketchInput, Usage
from chizma_api.generation.sanitize import clean_css, sanitize_fragment
from chizma_api.generation.schemas import Block, BlockSet, SceneGraph

log = logging.getLogger(__name__)


class InvalidModelOutputError(Exception):
    """The model answered twice with output that does not match the schema."""


@dataclass
class PipelineResult:
    scene: SceneGraph
    blocks: list[Block]
    usage: Usage = field(default_factory=Usage)


def _parse[T: BaseModel](model: type[T], reply: ModelReply) -> T:
    return model.model_validate(json.loads(reply.text))


def _short_error(exc: Exception) -> str:
    return str(exc).replace("\n", " ")[:600]


async def run_pipeline(
    provider: AIProvider,
    sketch: SketchInput,
    on_stage: Callable[[str], None] = lambda _: None,
) -> PipelineResult:
    usage = Usage()

    on_stage("recognizing")
    scene: SceneGraph | None = None
    feedback: str | None = None
    for _attempt in range(2):
        reply = await provider.recognize(sketch, feedback)
        usage.add(reply.usage)
        try:
            scene = _parse(SceneGraph, reply)
            break
        except (ValidationError, ValueError) as exc:
            feedback = _short_error(exc)
            log.warning("invalid scene graph from %s: %s", provider.name, feedback)
    if scene is None:
        raise InvalidModelOutputError("scene graph")

    if not scene.elements:
        return PipelineResult(scene=scene, blocks=[], usage=usage)

    on_stage("building")
    block_set: BlockSet | None = None
    feedback = None
    for _attempt in range(2):
        reply = await provider.generate_blocks(sketch, scene, feedback)
        usage.add(reply.usage)
        try:
            block_set = _parse(BlockSet, reply)
            break
        except (ValidationError, ValueError) as exc:
            feedback = _short_error(exc)
            log.warning("invalid blocks from %s: %s", provider.name, feedback)
    if block_set is None:
        raise InvalidModelOutputError("blocks")

    known = {element.id for element in scene.elements}
    blocks: list[Block] = []
    seen: set[str] = set()
    for block in block_set.blocks:
        if block.element_id in known and block.element_id not in seen:
            seen.add(block.element_id)
            blocks.append(
                Block(
                    element_id=block.element_id,
                    html=sanitize_fragment(block.html),
                    css=clean_css(block.css),
                )
            )
    return PipelineResult(scene=scene, blocks=blocks, usage=usage)
