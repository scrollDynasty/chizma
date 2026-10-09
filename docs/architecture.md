# Architecture

Chizma turns a free-hand drawing into a real website. This page describes the test-phase architecture (milestones M0–M1).

## Pipeline

```
canvas (Excalidraw)
  -> snapshot: PNG + simplified vector shapes JSON
  -> vision model -> scene graph (JSON, validated against packages/scene-schema)
       element: { id, kind, label, bbox, confidence, style_hints, alternatives[] }
  -> block generator -> HTML/CSS/SVG per element (no JavaScript) -> server-side checks
  -> element boxes recomputed from the drawn shapes (1:1 with the sketch)
  -> result put on the canvas in place of its strokes (canvas locked while deciding)
  -> Back to drawing / Try again / Accept
  -> accepted blocks are ordinary canvas objects: move, resize, delete, undo, draw more,
     generate again (only new strokes are sent)
```

Blocks are Excalidraw `iframe` elements. Their document is built by us: HTML sanitised on the
server and again with DOMPurify, wrapped in a CSP with `default-src 'none'` (no scripts, no
network), inside an iframe without `allow-same-origin` (no access to the editor, its storage or
sign-in token).

Generation is **1:1**: every drawn object becomes exactly one real element at the same place
and size, and nothing is invented. People refine blocks afterwards (M2). The responsive page
builder (`apps/web/src/preview/pageBuilder.ts`) is kept for publishing (M4).

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

## Editing blocks (M2)

Select one generated block to get its panel:

- **Change in words**: `POST /v1/generations/refine` with the element, its current html/css and the instruction. Only that block is regenerated.
- **Draw over**: strokes drawn over the block after pressing *Draw over* are sent as a PNG plus shapes relative to the block; after *Apply* they are removed and the block is rebuilt with them.
- **Versions**: every edit adds a version (kept in the block's canvas data); step back and forth with ‹ ›. Editing an older version drops the later ones.
- **Clarifying questions**: when the model is unsure it asks one question with options; the answer is sent as a refinement and the question disappears.

Refinements count towards the same daily quota and budget as full generations.

## Actions (M3)

A block can do one thing from a fixed, audited registry (`apps/api/src/chizma_api/actions/schemas.py`, mirrored in `apps/web/src/actions/types.ts`):

| Action | Settings |
|---|---|
| `link` | `url` (https/http/mailto/tel only), `new_tab` |
| `modal` | `title`, `text`, optional `form` (fields, button text, success message, server form id) |
| `toggle` | `target_id` (another block), `start_hidden` |
| `scroll` | `target_id` (another block) |

`POST /v1/actions/suggest` lets the model pick and configure one action from words; it never writes code. **Try** mode in the editor runs actions with the editor's own code (generated code never runs). Forms: `POST /v1/forms` (owner) registers a form; `POST /v1/forms/{id}/submissions` is public (required fields, honeypot `_hp`, 5 per minute per client); `GET /v1/forms` and `GET /v1/forms/{id}/submissions` show requests to the owner.
