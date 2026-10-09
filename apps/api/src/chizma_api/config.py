"""Runtime settings, read from environment variables (prefix ``CHIZMA_``)."""

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="CHIZMA_",
        env_file=(".env", "../../.env"),
        extra="ignore",
    )

    env: Literal["development", "test", "production"] = "development"
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    database_url: str = "sqlite:///./data/chizma.db"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip().rstrip("/") for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
