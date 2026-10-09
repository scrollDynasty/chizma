"""FastAPI application entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from chizma_api import __version__
from chizma_api.config import Settings, get_settings


class Health(BaseModel):
    status: str
    version: str


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(
        title="Chizma API",
        version=__version__,
        docs_url=None if settings.env == "production" else "/docs",
        redoc_url=None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.get("/health")
    def health() -> Health:
        return Health(status="ok", version=__version__)

    return app


app = create_app()
