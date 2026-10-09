"""HTTP routes for sketch generation (start a job, poll it, read the quota)."""

import json
import logging
from collections.abc import Awaitable, Callable
from typing import Annotated, Any

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from pydantic import BaseModel, ValidationError

from chizma_api.deps import CurrentUser, DbDep, SettingsDep
from chizma_api.generation.jobs import Job, JobStore
from chizma_api.generation.limits import QuotaError, RateLimiter, quota, record_spend, reserve
from chizma_api.generation.pipeline import (
    InvalidModelOutputError,
    PipelineResult,
    RefineResult,
    run_pipeline,
    run_refine,
)
from chizma_api.generation.providers import AIProvider, AIProviderError, RefineInput, SketchInput
from chizma_api.generation.schemas import LOCALES, Block, Element, SceneGraph

log = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/generations", tags=["generation"])

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
MAX_SHAPES = 500


class StartOut(BaseModel):
    id: str
    status: str


class JobOut(BaseModel):
    id: str
    status: str
    stage: str
    scene: SceneGraph | None
    blocks: list[Block]
    error: str | None


class QuotaOut(BaseModel):
    used: int
    limit: int
    remaining: int


def _jobs(request: Request) -> JobStore:
    store: JobStore = request.app.state.jobs
    return store


def _rate(request: Request) -> RateLimiter:
    limiter: RateLimiter = request.app.state.rate_limiter
    return limiter


def _provider(request: Request) -> AIProvider:
    provider: AIProvider = request.app.state.ai_provider
    return provider


JobsDep = Annotated[JobStore, Depends(_jobs)]


def _parse_shapes(raw: str) -> list[dict[str, Any]]:
    try:
        shapes = json.loads(raw)
    except ValueError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "invalid_shapes") from None
    if not isinstance(shapes, list) or len(shapes) > MAX_SHAPES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "invalid_shapes")
    if not all(isinstance(shape, dict) for shape in shapes):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "invalid_shapes")
    return shapes


Work = Callable[[Callable[[str], None]], Awaitable[PipelineResult | RefineResult]]


async def _run_job(request: Request, job: Job, work: Work) -> None:
    job.status = "running"

    def set_stage(stage: str) -> None:
        job.stage = stage

    try:
        result = await work(set_stage)
    except AIProviderError as exc:
        log.warning("generation %s failed at provider: %s", job.id, exc)
        job.status, job.stage, job.error = "failed", "failed", "ai_unavailable"
        return
    except InvalidModelOutputError as exc:
        log.warning("generation %s: invalid %s twice", job.id, exc)
        job.status, job.stage, job.error = "failed", "failed", "ai_invalid_output"
        return
    except Exception:
        log.exception("generation %s crashed", job.id)
        job.status, job.stage, job.error = "failed", "failed", "internal_error"
        return

    with request.app.state.session_factory() as db:
        record_spend(db, result.usage.cost_usd)
        db.commit()
    if isinstance(result, RefineResult):
        job.blocks = [result.block]
        elements = 1
    else:
        job.scene, job.blocks = result.scene, result.blocks
        elements = len(result.scene.elements)
    log.info(
        "generation %s done: %d elements, %d+%d tokens, $%.4f",
        job.id, elements, result.usage.input_tokens, result.usage.output_tokens,
        result.usage.cost_usd,
    )  # fmt: skip
    job.status, job.stage = "done", "done"


def _start(request: Request, user_id: int, settings: SettingsDep, db: DbDep) -> None:
    try:
        _rate(request).check(user_id)
        reserve(db, settings, user_id)
    except QuotaError as exc:
        raise HTTPException(exc.status_code, exc.code) from None
    db.commit()


async def _read_png(image: UploadFile, settings: SettingsDep) -> bytes:
    png = await image.read(settings.max_image_bytes + 1)
    if len(png) > settings.max_image_bytes:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "image_too_large")
    if not png.startswith(PNG_MAGIC):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "invalid_image")
    return png


@router.post("", status_code=status.HTTP_202_ACCEPTED)
async def start_generation(
    request: Request,
    background: BackgroundTasks,
    user: CurrentUser,
    settings: SettingsDep,
    db: DbDep,
    jobs: JobsDep,
    image: Annotated[UploadFile, File()],
    shapes: Annotated[str, Form(max_length=200_000)],
    width: Annotated[float, Form(gt=0, le=100_000)],
    height: Annotated[float, Form(gt=0, le=100_000)],
    locale: Annotated[str, Form()],
) -> StartOut:
    if locale not in LOCALES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "invalid_locale")
    png = await _read_png(image, settings)
    parsed_shapes = _parse_shapes(shapes)
    _start(request, user.id, settings, db)

    job = jobs.create(user.id)
    provider = _provider(request)
    log.info(
        "generation %s started by user %s: %d shapes, %d KB image, provider %s",
        job.id, user.id, len(parsed_shapes), len(png) // 1024, provider.name,
    )  # fmt: skip
    sketch = SketchInput(png, parsed_shapes, width, height, locale)
    background.add_task(_run_job, request, job, lambda stage: run_pipeline(provider, sketch, stage))
    return StartOut(id=job.id, status=job.status)


@router.post("/refine", status_code=status.HTTP_202_ACCEPTED)
async def refine_block(
    request: Request,
    background: BackgroundTasks,
    user: CurrentUser,
    settings: SettingsDep,
    db: DbDep,
    jobs: JobsDep,
    element: Annotated[str, Form(max_length=20_000)],
    html: Annotated[str, Form(max_length=20_000)],
    width: Annotated[float, Form(gt=0, le=100_000)],
    height: Annotated[float, Form(gt=0, le=100_000)],
    locale: Annotated[str, Form()],
    css: Annotated[str, Form(max_length=10_000)] = "",
    instruction: Annotated[str, Form(max_length=500)] = "",
    shapes: Annotated[str, Form(max_length=200_000)] = "[]",
    image: Annotated[UploadFile | None, File()] = None,
) -> StartOut:
    """Regenerate one existing block from a description and/or strokes drawn over it."""
    if locale not in LOCALES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "invalid_locale")
    try:
        parsed_element = Element.model_validate_json(element)
    except ValidationError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "invalid_element") from None
    parsed_shapes = _parse_shapes(shapes)
    png = await _read_png(image, settings) if image is not None else None
    if not instruction.strip() and png is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "nothing_to_change")
    _start(request, user.id, settings, db)

    job = jobs.create(user.id)
    provider = _provider(request)
    log.info(
        "refine %s started by user %s: element %s, %d chars, %d strokes, provider %s",
        job.id, user.id, parsed_element.id, len(instruction), len(parsed_shapes), provider.name,
    )  # fmt: skip
    refine = RefineInput(
        element=parsed_element,
        block=Block(element_id=parsed_element.id, html=html, css=css),
        instruction=instruction.strip(),
        width=width,
        height=height,
        locale=locale,
        png=png,
        shapes=parsed_shapes,
    )
    background.add_task(_run_job, request, job, lambda stage: run_refine(provider, refine, stage))
    return StartOut(id=job.id, status=job.status)


@router.get("/quota")
def read_quota(user: CurrentUser, settings: SettingsDep, db: DbDep) -> QuotaOut:
    current = quota(db, settings, user.id)
    return QuotaOut(used=current.used, limit=current.limit, remaining=current.remaining)


@router.get("/{job_id}")
def read_generation(job_id: str, user: CurrentUser, jobs: JobsDep) -> JobOut:
    job = jobs.get(job_id)
    if job is None or job.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    return JobOut(
        id=job.id,
        status=job.status,
        stage=job.stage,
        scene=job.scene,
        blocks=job.blocks,
        error=job.error,
    )
