"""recognize -> validate (one retry with the error) -> generate blocks -> validate -> sanitise."""

import json
import logging
from collections.abc import Callable
from dataclasses import dataclass, field

from pydantic import BaseModel, ValidationError

from chizma_api.generation.providers import (
    AIProvider,
    ModelReply,
    RefineInput,
    SketchInput,
    Usage,
)
from chizma_api.generation.sanitize import clean_css, sanitize_fragment
from chizma_api.generation.schemas import BBox, Block, BlockSet, SceneGraph

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


def fit_to_shapes(scene: SceneGraph, sketch: SketchInput) -> SceneGraph:
    """Place every element exactly over the shapes it came from.

    The model decides what things are; where they are comes from the drawing itself, so
    the result lands 1:1 on top of the sketch. Elements without known shapes keep the
    model's estimate.
    """
    shapes = {str(shape.get("id")): shape for shape in sketch.shapes if "id" in shape}
    width, height = max(sketch.width, 1.0), max(sketch.height, 1.0)
    for element in scene.elements:
        own = [shapes[i] for i in element.source_shape_ids if i in shapes]
        if not own:
            continue
        try:
            x1 = min(float(s["x"]) for s in own)
            y1 = min(float(s["y"]) for s in own)
            x2 = max(float(s["x"]) + float(s["width"]) for s in own)
            y2 = max(float(s["y"]) + float(s["height"]) for s in own)
        except (KeyError, TypeError, ValueError):
            continue
        element.bbox = BBox(x=x1 / width, y=y1 / height, w=(x2 - x1) / width, h=(y2 - y1) / height)
    return scene


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
    scene = fit_to_shapes(scene, sketch)

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


@dataclass
class RefineResult:
    block: Block
    usage: Usage = field(default_factory=Usage)


async def run_refine(
    provider: AIProvider,
    refine: RefineInput,
    on_stage: Callable[[str], None] = lambda _: None,
) -> RefineResult:
    """Regenerate one block from words and/or strokes drawn over it."""
    usage = Usage()
    on_stage("refining")
    feedback: str | None = None
    for _attempt in range(2):
        reply = await provider.refine_block(refine, feedback)
        usage.add(reply.usage)
        try:
            block_set = _parse(BlockSet, reply)
            block = next(b for b in block_set.blocks if b.element_id == refine.element.id)
        except (ValidationError, ValueError) as exc:
            feedback = _short_error(exc)
        except StopIteration:
            feedback = f"return exactly one block with element_id {refine.element.id!r}"
        else:
            return RefineResult(
                block=Block(
                    element_id=block.element_id,
                    html=sanitize_fragment(block.html),
                    css=clean_css(block.css),
                ),
                usage=usage,
            )
        log.warning("invalid refined block from %s: %s", provider.name, feedback)
    raise InvalidModelOutputError("refined block")
