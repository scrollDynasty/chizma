"""In-memory generation jobs. One worker process during the test phase, so this is enough;
a restart loses running jobs and the editor shows a retry message."""

import secrets
import time
from dataclasses import dataclass, field
from typing import Literal

from chizma_api.generation.schemas import Block, SceneGraph

Status = Literal["queued", "running", "done", "failed"]
JOB_TTL_SECONDS = 3600


@dataclass
class Job:
    id: str
    user_id: int
    status: Status = "queued"
    stage: str = "queued"
    created_at: float = field(default_factory=time.time)
    scene: SceneGraph | None = None
    blocks: list[Block] = field(default_factory=list)
    error: str | None = None


class JobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}

    def create(self, user_id: int) -> Job:
        self._expire()
        job = Job(id=secrets.token_urlsafe(12), user_id=user_id)
        self._jobs[job.id] = job
        return job

    def get(self, job_id: str) -> Job | None:
        return self._jobs.get(job_id)

    def _expire(self) -> None:
        cutoff = time.time() - JOB_TTL_SECONDS
        for job_id in [j.id for j in self._jobs.values() if j.created_at < cutoff]:
            del self._jobs[job_id]
