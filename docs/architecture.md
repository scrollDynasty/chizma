# Architecture

Chizma turns a free-hand drawing into a real website. This page describes the test-phase architecture (milestones M0–M1).

## Pipeline

```
canvas (Excalidraw)
  -> snapshot: PNG + simplified vector shapes JSON
  -> vision model -> scene graph (JSON, validated against packages/scene-schema)
       element: { id, kind, label, bbox, confidence, style_hints, alternatives[] }
  -> block generator -> HTML/CSS/SVG per element (no JavaScript) -> server-side checks
  -> page builder (layout from bboxes, responsive rules)
  -> live preview in a sandboxed iframe
```

Every model response is validated against the JSON schema. On failure the request is retried once with the validation error; after that the user gets a clear error message.

## Components

| Component | Path | Hosted on (test) |
|---|---|---|
| Editor and landing page | `apps/web` | GitHub Pages (static) |
| API | `apps/api` | Azure App Service F1 (Linux, free) |
| Scene schema and pipeline | `apps/api/src/chizma_api/generation` | API |
| Page builder and sandbox | `apps/web/src/preview` | editor (moves to a shared package for export in M4) |

GitHub Pages can only serve static files, so everything that needs a secret (AI keys, OAuth secrets) or state (database) lives in the API.

## Security model

- **Secrets only on the server.** The editor is public static code; it never sees API keys.
- **Generated code is isolated.** Model output is HTML/CSS/SVG only, sanitised on the server and again with DOMPurify, and rendered via `<iframe sandbox srcdoc>` **without** `allow-same-origin` plus a strict CSP. It cannot read the editor's DOM, storage, cookies or tokens.
- **Behaviour from a registry.** From M3 on, interactivity comes from an audited action runtime; the model only picks and configures actions.
- **Sign-in via GitHub or Google (OAuth).** The API issues its own JWT, sent as a `Bearer` header (the editor and the API live on different sites, so cookies are not used).
- **Cost limits.** Per-user daily quota, project-wide daily budget, allow-list for the closed test, and a kill switch (`CHIZMA_GENERATION_ENABLED`).

## AI providers

All model calls go through one `AIProvider` interface. Implementations: `FakeProvider` (no key; deterministic fixtures for development, CI and demos) and `OpenAIProvider` (default model `gpt-6-luna`). Other providers, including Claude and self-hosted open models, plug in behind the same interface.

## Storage

- Test phase: SQLite on the App Service persistent disk (`/home/data`) for users, quotas and spend; drawings stay in the browser (IndexedDB).
- From M2/M3: PostgreSQL, drawings and versions server-side, images in Blob storage.

## Generation API

- `POST /v1/generations` (signed in, multipart: `image` PNG, `shapes` JSON, `width`, `height`, `locale`) returns `202 {id}`.
- `GET /v1/generations/{id}` returns `status` (`queued`, `running`, `done`, `failed`), `stage`, `scene`, `blocks`, `error`.
- `GET /v1/generations/quota` returns today's usage for the user.

Switch the model with `CHIZMA_AI_PROVIDER=openai`, `OPENAI_API_KEY`, `CHIZMA_AI_MODEL` and the matching `CHIZMA_AI_*_USD_PER_MTOK` prices (used for the daily budget).
