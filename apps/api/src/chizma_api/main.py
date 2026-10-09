"""FastAPI application entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from starlette.middleware.sessions import SessionMiddleware

from chizma_api import __version__
from chizma_api.auth.providers import AuthlibGateway, OAuthGateway
from chizma_api.auth.routes import router as auth_router
from chizma_api.config import Settings, get_settings
from chizma_api.db import create_db_engine, create_session_factory
from chizma_api.generation.jobs import JobStore
from chizma_api.generation.limits import RateLimiter
from chizma_api.generation.providers import AIProvider, make_provider
from chizma_api.generation.routes import router as generation_router


class Health(BaseModel):
    status: str
    version: str


def create_app(
    settings: Settings | None = None,
    oauth_gateway: OAuthGateway | None = None,
    ai_provider: AIProvider | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(
        title="Chizma API",
        version=__version__,
        docs_url=None if settings.env == "production" else "/docs",
        redoc_url=None,
    )
    app.state.settings = settings
    app.state.session_factory = create_session_factory(create_db_engine(settings.database_url))
    app.state.oauth_gateway = oauth_gateway or AuthlibGateway(settings)
    app.state.ai_provider = ai_provider or make_provider(settings)
    app.state.jobs = JobStore()
    app.state.rate_limiter = RateLimiter(settings.min_seconds_between_generations)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )
    # Short-lived cookie that only carries OAuth state/nonce between login and callback.
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.jwt_secret.get_secret_value(),
        session_cookie="chizma_oauth",
        max_age=600,
        same_site="lax",
        https_only=settings.env == "production",
    )

    app.include_router(auth_router)
    app.include_router(generation_router)

    @app.get("/health")
    def health() -> Health:
        return Health(status="ok", version=__version__)

    return app


app = create_app()
