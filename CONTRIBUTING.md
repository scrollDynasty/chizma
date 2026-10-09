# Contributing to Chizma

Thanks for helping! This guide gets you from clone to pull request.

## Setup

See the quick start in [README.md](README.md) and [docs/contributing-quickstart.md](docs/contributing-quickstart.md).

## Workflow

1. Open or pick an issue (look for `good first issue` and `help wanted`).
2. Create a branch from `main`: `feat/short-name`, `fix/short-name`.
3. Keep changes small: one logical change per commit, one topic per PR.
4. Add tests for every feature or fix.
5. Run checks locally before pushing:
   ```bash
   pnpm check                     # biome, typecheck, tests for JS packages
   pnpm check:api                 # ruff, mypy, pytest for the API
   ```
6. Open a PR. CI must be green before merge. `main` is protected.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/): release notes and versions are generated from them.

```
feat(web): add generate button
fix(api): reject images larger than 2 MB
docs: explain how to add an AI provider
```

PRs are squash-merged, so the **PR title** must follow the same format.

## Rules that matter

- **Never commit secrets.** All keys come from environment variables; `.env.example` holds fake placeholders only.
- **AI-generated code runs only inside the sandbox.** Never render model output in the editor's own DOM.
- **Behaviour comes from the action registry.** The model selects and configures actions; it never writes payment or auth logic.
- **No hardcoded shape lists for recognition.** Recognition is done by a vision model returning a structured scene.

## Code style

- TypeScript: Biome (`pnpm lint`, `pnpm format`).
- Python: ruff and mypy (strict).
- Identifiers, comments and commits in English.
