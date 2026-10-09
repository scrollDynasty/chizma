"""Runtime settings, read from environment variables (prefix ``CHIZMA_``)."""

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import AliasChoices, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

DEV_JWT_SECRET = "dev-insecure-secret-change-me"  # noqa: S105 - placeholder, rejected in production


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="CHIZMA_",
        env_file=(".env", "../../.env"),
        extra="ignore",
        populate_by_name=True,
    )

    env: Literal["development", "test", "production"] = "development"
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    database_url: str = "sqlite:///./data/chizma.db"

    # Public URLs used to build OAuth redirects.
    public_api_url: str = "http://localhost:8000"
    web_url: str = "http://localhost:5173/chizma"

    # Auth
    jwt_secret: SecretStr = SecretStr(DEV_JWT_SECRET)
    jwt_ttl_hours: int = 24 * 7
    github_client_id: str = ""
    github_client_secret: SecretStr = SecretStr("")
    google_client_id: str = ""
    google_client_secret: SecretStr = SecretStr("")
    # Closed-test allow-list, e.g. "github:octocat,google:1234567890". Empty means open.
    allowed_users: Annotated[list[str], NoDecode] = []

    # AI generation
    ai_provider: Literal["fake", "openai"] = "fake"
    ai_model: str = "gpt-6-luna"
    # USD per million tokens for the chosen model; used for the daily budget.
    ai_input_usd_per_mtok: float = 0.10
    ai_output_usd_per_mtok: float = 0.50
    openai_api_key: SecretStr = Field(
        default=SecretStr(""),
        validation_alias=AliasChoices("OPENAI_API_KEY", "CHIZMA_OPENAI_API_KEY"),
    )
    generation_enabled: bool = True
    daily_user_limit: int = 30
    daily_budget_usd: float = 2.0
    min_seconds_between_generations: float = 10.0
    max_image_bytes: int = 2 * 1024 * 1024

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip().rstrip("/") for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("allowed_users", mode="before")
    @classmethod
    def _split_users(cls, value: object) -> object:
        if isinstance(value, str):
            return [entry.strip().lower() for entry in value.split(",") if entry.strip()]
        return value

    @field_validator("public_api_url", "web_url")
    @classmethod
    def _strip_slash(cls, value: str) -> str:
        return value.rstrip("/")

    @property
    def auth_enabled(self) -> bool:
        """Sign-in works only with a real JWT secret outside development and tests."""
        secret = self.jwt_secret.get_secret_value()
        if self.env == "production":
            return secret != DEV_JWT_SECRET and len(secret) >= 32
        return bool(secret)

    def oauth_providers(self) -> list[str]:
        providers = []
        if self.github_client_id and self.github_client_secret.get_secret_value():
            providers.append("github")
        if self.google_client_id and self.google_client_secret.get_secret_value():
            providers.append("google")
        return providers


@lru_cache
def get_settings() -> Settings:
    return Settings()
