"""Cost guards: kill switch, per-user daily quota, project daily budget, request spacing."""

import time
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from chizma_api.config import Settings
from chizma_api.models import DailySpend, GenerationUsage


class QuotaError(Exception):
    def __init__(self, code: str, status_code: int = 429) -> None:
        super().__init__(code)
        self.code = code
        self.status_code = status_code


@dataclass
class Quota:
    used: int
    limit: int

    @property
    def remaining(self) -> int:
        return max(0, self.limit - self.used)


def today(now: float | None = None) -> str:
    return datetime.fromtimestamp(now if now is not None else time.time(), UTC).strftime("%Y-%m-%d")


def quota(db: Session, settings: Settings, user_id: int, now: float | None = None) -> Quota:
    usage = db.get(GenerationUsage, (user_id, today(now)))
    return Quota(used=usage.count if usage else 0, limit=settings.daily_user_limit)


class RateLimiter:
    """Minimum spacing between generation starts per user (in memory, single worker)."""

    def __init__(self, min_interval_seconds: float) -> None:
        self.min_interval = min_interval_seconds
        self._last: dict[int, float] = {}

    def check(self, user_id: int, now: float | None = None) -> None:
        current = now if now is not None else time.monotonic()
        last = self._last.get(user_id)
        if last is not None and current - last < self.min_interval:
            raise QuotaError("too_fast")
        self._last[user_id] = current


def reserve(db: Session, settings: Settings, user_id: int, now: float | None = None) -> None:
    """Check every guard and count the generation. Commit is up to the caller."""
    if not settings.generation_enabled:
        raise QuotaError("generation_disabled", status_code=503)
    day = today(now)
    spend = db.get(DailySpend, day)
    if (spend.usd if spend else 0.0) >= settings.daily_budget_usd:
        raise QuotaError("budget_exhausted")
    usage = db.get(GenerationUsage, (user_id, day))
    if usage is None:
        usage = GenerationUsage(user_id=user_id, day=day, count=0)
        db.add(usage)
    if usage.count >= settings.daily_user_limit:
        raise QuotaError("daily_limit")
    usage.count += 1


def record_spend(db: Session, usd: float, now: float | None = None) -> None:
    day = today(now)
    spend = db.get(DailySpend, day)
    if spend is None:
        spend = DailySpend(day=day, usd=0.0, generations=0)
        db.add(spend)
    spend.usd += usd
    spend.generations += 1


def release(db: Session, user_id: int, now: float | None = None) -> None:
    """Give a generation back to the user when it failed for reasons outside their control."""
    usage = db.get(GenerationUsage, (user_id, today(now)))
    if usage and usage.count > 0:
        usage.count -= 1
