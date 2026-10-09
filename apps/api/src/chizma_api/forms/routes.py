"""Forms: the owner registers a form and reads submissions; visitors submit (no sign-in)."""

import json
import secrets
import time
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select

from chizma_api.actions.schemas import FormField, unique_fields
from chizma_api.deps import CurrentUser, DbDep
from chizma_api.models import Form, FormSubmission

router = APIRouter(prefix="/v1/forms", tags=["forms"])

MAX_VALUE_LENGTH = 2000
MAX_SUBMISSIONS_PER_MINUTE = 5
HONEYPOT = "_hp"


class FormIn(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=80)]
    fields: Annotated[list[FormField], Field(min_length=1, max_length=8)]

    @field_validator("fields")
    @classmethod
    def _unique_names(cls, fields: list[FormField]) -> list[FormField]:
        return unique_fields(fields)


class FormOut(BaseModel):
    id: str
    name: str
    fields: list[FormField]
    submissions: int
    created_at: datetime


class SubmissionOut(BaseModel):
    id: int
    data: dict[str, str]
    created_at: datetime


class SubmitOut(BaseModel):
    ok: bool


class SubmitLimiter:
    """Per-client sliding window for the public submit endpoint (single worker, in memory)."""

    def __init__(self, per_minute: int) -> None:
        self.per_minute = per_minute
        self._hits: dict[str, list[float]] = {}

    def allow(self, key: str, now: float | None = None) -> bool:
        current = now if now is not None else time.monotonic()
        recent = [t for t in self._hits.get(key, []) if current - t < 60]
        allowed = len(recent) < self.per_minute
        if allowed:
            recent.append(current)
        self._hits[key] = recent
        return allowed


def _client_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    host = forwarded.split(",")[0].strip() or (request.client.host if request.client else "")
    return host or "unknown"


def _owned(db: DbDep, form_id: str, user_id: int) -> Form:
    form = db.get(Form, form_id)
    if form is None or form.owner_id != user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    return form


def _out(form: Form, count: int) -> FormOut:
    return FormOut(
        id=form.id,
        name=form.name,
        fields=[FormField.model_validate(f) for f in json.loads(form.fields_json)],
        submissions=count,
        created_at=form.created_at,
    )


@router.post("", status_code=status.HTTP_201_CREATED)
def create_form(body: FormIn, user: CurrentUser, db: DbDep) -> FormOut:
    form = Form(
        id=secrets.token_hex(8),
        owner_id=user.id,
        name=body.name,
        fields_json=json.dumps([f.model_dump() for f in body.fields], ensure_ascii=False),
    )
    db.add(form)
    db.commit()
    db.refresh(form)
    return _out(form, 0)


@router.get("")
def list_forms(user: CurrentUser, db: DbDep) -> list[FormOut]:
    counts = (
        select(FormSubmission.form_id, func.count().label("n"))
        .group_by(FormSubmission.form_id)
        .subquery()
    )
    rows = db.execute(
        select(Form, func.coalesce(counts.c.n, 0))
        .outerjoin(counts, counts.c.form_id == Form.id)
        .where(Form.owner_id == user.id)
        .order_by(Form.created_at.desc())
    ).all()
    return [_out(form, count) for form, count in rows]


@router.get("/{form_id}/submissions")
def list_submissions(form_id: str, user: CurrentUser, db: DbDep) -> list[SubmissionOut]:
    _owned(db, form_id, user.id)
    rows = db.scalars(
        select(FormSubmission)
        .where(FormSubmission.form_id == form_id)
        .order_by(FormSubmission.id.desc())
        .limit(500)
    ).all()
    return [
        SubmissionOut(id=r.id, data=json.loads(r.data_json), created_at=r.created_at) for r in rows
    ]


@router.post("/{form_id}/submissions", status_code=status.HTTP_201_CREATED)
def submit(form_id: str, body: dict[str, str], request: Request, db: DbDep) -> SubmitOut:
    """Public: called by the published site. Unknown fields are dropped."""
    form = db.get(Form, form_id)
    if form is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    limiter: SubmitLimiter = request.app.state.submit_limiter
    if not limiter.allow(f"{_client_key(request)}:{form_id}"):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "too_many_submissions")
    if body.get(HONEYPOT):
        return SubmitOut(ok=True)  # bots fill hidden fields; pretend success, store nothing
    fields = [FormField.model_validate(f) for f in json.loads(form.fields_json)]
    data: dict[str, str] = {}
    for field in fields:
        value = str(body.get(field.name, "")).strip()[:MAX_VALUE_LENGTH]
        if field.required and not value:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"required:{field.name}")
        data[field.name] = value
    db.add(FormSubmission(form_id=form.id, data_json=json.dumps(data, ensure_ascii=False)))
    db.commit()
    return SubmitOut(ok=True)
