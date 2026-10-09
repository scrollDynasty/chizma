# Chizma

**Draw a website. Get a real one.**

Chizma ("chizma" in Uzbek means *drawing, sketch*) is an open-source platform where anyone can build a real, working website by drawing it. Sketch a house, a sun, a few boxes, some scribbles, press **Generate**, and Chizma turns every drawn object into a real page element. Then point at any block, draw over it or describe it in words, assign it a purpose (open a form, go to a page, show or hide a section) and publish.

> **Status:** early testing (M0/M1). Payments and external integrations are intentionally out of scope for now.

<!-- TODO: demo GIF -->
<p align="center"><em>Demo GIF coming soon</em></p>

## Why Chizma

- **Free drawing is the input**, not a catalogue of blocks. There is no fixed list of allowed shapes.
- **Behaviour after generation**: draw, generate, then assign behaviour from a safe, audited action registry.
- **Real output**: fast, self-contained static pages you can export. No lock-in.
- **Local languages from day one**: Uzbek (Latin and Cyrillic), Russian, English.

## Architecture (test phase)

| Part | Where | Tech |
|---|---|---|
| Editor (`apps/web`) | GitHub Pages | React, Vite, TypeScript, Tailwind, Excalidraw |
| API (`apps/api`) | Azure App Service | Python, FastAPI, SQLite (PostgreSQL later) |
| AI | via the API only (keys never reach the browser) | OpenAI by default, pluggable providers |

Generated code always runs inside a sandboxed iframe. See [docs/architecture.md](docs/architecture.md).

## Quick start (local)

Requirements: Node 22+, pnpm 9+, Python 3.12+, [uv](https://docs.astral.sh/uv/).

```bash
cp .env.example .env
pnpm install
pnpm dev:web          # editor on http://localhost:5173/chizma/
pnpm dev:api          # API on http://localhost:8000
```

The default AI provider is `fake`, so you can try the whole flow without any API key.

## Self-hosting with Docker

```bash
cp .env.example .env
docker compose up --build
```

Editor: http://localhost:8080/chizma/ · API: http://localhost:8000/health

## Roadmap

- [x] **M0** Foundation: monorepo, CI, Docker, deploy to Pages and Azure
- [ ] **M1** Sign-in (GitHub, Google), canvas, generation, sandboxed preview
- [ ] **M2** Block editing: redraw or describe, regenerate one block, history, clarifying questions
- [ ] **M3** Purposes and safe actions (links, modals, show/hide, scroll, forms)
- [ ] **M4** Publishing, template gallery, landing page
- [ ] **M5** Pilot with real businesses

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md). Security issues: see [SECURITY.md](SECURITY.md).

## License

[AGPL-3.0](LICENSE). If you run a modified Chizma as a network service, you must share your changes.
