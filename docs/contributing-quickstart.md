# Contributor quick start

1. Install Node 22+, pnpm 9+, Python 3.12+ and [uv](https://docs.astral.sh/uv/).
2. Clone and install:
   ```bash
   git clone https://github.com/scrollDynasty/chizma.git
   cd chizma
   cp .env.example .env
   pnpm install
   cd apps/api && uv sync && cd ../..
   ```
3. Run both parts:
   ```bash
   pnpm dev:api    # http://localhost:8000/health
   pnpm dev:web    # http://localhost:5173/chizma/
   ```
4. Before pushing:
   ```bash
   pnpm check && pnpm check:api
   ```

The default AI provider is `fake`: no API key is needed to work on the editor or the pipeline.

## Repository map

| Path | What |
|---|---|
| `apps/web` | React editor and landing page |
| `apps/api` | FastAPI backend (`src/chizma_api`), Alembic migrations |
| `packages/*` | Shared TypeScript packages |
| `infra/azure` | One-time Azure setup script |
| `docs` | Architecture and guides |
