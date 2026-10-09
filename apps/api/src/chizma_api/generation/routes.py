"""HTTP routes for sketch generation (start a job, poll it, read the quota)."""

import json
import logging
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
from pydantic import BaseModel

from chizma_api.deps import CurrentUser, DbDep, SettingsDep
from chizma_api.generation.jobs import Job, JobStore
from chizma_api.generation.limits import QuotaError, RateLimiter, quota, record_spend, reserve
from chizma_api.generation.pipeline import InvalidModelOutputError, run_pipeline
from chizma_api.generation.providers import AIProvider, AIProviderError, SketchInput
from chizma_api.generation.schemas import LOCALES, Block, SceneGraph

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


async def _run_job(request: Request, job: Job, sketch: SketchInput) -> None:
    provider = _provider(request)
    job.status = "running"

    def set_stage(stage: str) -> None:
        job.stage = stage

    try:
        result = await run_pipeline(provider, sketch, set_stage)
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
    log.info(
        "generation %s done: %d elements, %d+%d tokens, $%.4f",
        job.id, len(result.scene.elements), result.usage.input_tokens,
        result.usage.output_tokens, result.usage.cost_usd,
    )  # fmt: skip
    job.scene, job.blocks = result.scene, result.blocks
    job.status, job.stage = "done", "done"


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
    png = await image.read(settings.max_image_bytes + 1)
    if len(png) > settings.max_image_bytes:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "image_too_large")
    if not png.startswith(PNG_MAGIC):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "invalid_image")
    parsed_shapes = _parse_shapes(shapes)

    try:
        _rate(request).check(user.id)
        reserve(db, settings, user.id)
    except QuotaError as exc:
        raise HTTPException(exc.status_code, exc.code) from None
    db.commit()

    job = jobs.create(user.id)
    log.info(
        "generation %s started by user %s: %d shapes, %d KB image, provider %s",
        job.id, user.id, len(parsed_shapes), len(png) // 1024, _provider(request).name,
    )  # fmt: skip
    sketch = SketchInput(png, parsed_shapes, width, height, locale)
    background.add_task(_run_job, request, job, sketch)
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
