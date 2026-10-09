FROM python:3.12-slim AS base

COPY --from=ghcr.io/astral-sh/uv:0.12.5 /uv /usr/local/bin/uv

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY . .
RUN uv sync --frozen --no-dev \
 && useradd --create-home --uid 10001 chizma \
 && mkdir -p /data && chown chizma /data

USER chizma
ENV CHIZMA_DATABASE_URL=sqlite:////data/chizma.db \
    CHIZMA_ENV=production \
    PORT=8000
EXPOSE 8000
VOLUME ["/data"]

CMD ["./startup.sh"]
