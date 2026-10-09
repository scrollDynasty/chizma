"""Pick an action for a block from a request in words (the model only selects and configures)."""

import json
import logging
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field, ValidationError

from chizma_api.actions.schemas import Action, from_model_output
from chizma_api.deps import CurrentUser, DbDep, SettingsDep
from chizma_api.generation.limits import QuotaError, RateLimiter, record_spend, reserve
from chizma_api.generation.providers import AIProvider, AIProviderError, SuggestInput, Usage
from chizma_api.generation.schemas import LOCALES

log = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/actions", tags=["actions"])


class BlockRef(BaseModel):
    id: Annotated[str, Field(min_length=1, max_length=80)]
    kind: Annotated[str, Field(max_length=40)] = ""
    label: Annotated[str, Field(max_length=80)] = ""


class SuggestIn(BaseModel):
    instruction: Annotated[str, Field(min_length=1, max_length=500)]
    block: BlockRef
    targets: Annotated[list[BlockRef], Field(max_length=60)] = []
    locale: str


class SuggestOut(BaseModel):
    action: Action | None
    explanation: str


async def run_suggest(provider: AIProvider, suggest: SuggestInput) -> tuple[Any, str, Usage]:
    usage = Usage()
    target_ids = {t["id"] for t in suggest.targets}
    feedback: str | None = None
    for _attempt in range(2):
        reply = await provider.suggest_action(suggest, feedback)
        usage.add(reply.usage)
        try:
            action, explanation = from_model_output(json.loads(reply.text), target_ids)
            return action, explanation, usage
        except (ValidationError, ValueError) as exc:
            feedback = str(exc).replace("\n", " ")[:500]
            log.warning("invalid action suggestion from %s: %s", provider.name, feedback)
    raise HTTPException(status.HTTP_502_BAD_GATEWAY, "ai_invalid_output")


@router.post("/suggest")
async def suggest_action(
    body: SuggestIn, request: Request, user: CurrentUser, settings: SettingsDep, db: DbDep
) -> SuggestOut:
    if body.locale not in LOCALES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "invalid_locale")
    limiter: RateLimiter = request.app.state.rate_limiter
    try:
        limiter.check(user.id)
        reserve(db, settings, user.id)
    except QuotaError as exc:
        raise HTTPException(exc.status_code, exc.code) from None
    db.commit()

    provider: AIProvider = request.app.state.ai_provider
    suggest = SuggestInput(
        instruction=body.instruction.strip(),
        block=body.block.model_dump(),
        targets=[t.model_dump() for t in body.targets if t.id != body.block.id],
        locale=body.locale,
    )
    try:
        action, explanation, usage = await run_suggest(provider, suggest)
    except AIProviderError as exc:
        log.warning("action suggestion failed at provider: %s", exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "ai_unavailable") from None
    record_spend(db, usage.cost_usd)
    db.commit()
    log.info(
        "action suggested for user %s: %s, $%.4f", user.id, action and action.type, usage.cost_usd
    )
    return SuggestOut(action=action, explanation=explanation)
