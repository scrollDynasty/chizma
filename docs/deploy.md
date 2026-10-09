# Deployment (test phase)

| Part | Target | Workflow |
|---|---|---|
| Editor | GitHub Pages: `https://<owner>.github.io/chizma/` | `.github/workflows/deploy-pages.yml` |
| API | Azure App Service F1 (free): `https://<app>.azurewebsites.net` | `.github/workflows/deploy-api.yml` |
| Docker images | `ghcr.io/<owner>/chizma-web`, `chizma-api` | `.github/workflows/release.yml` |

## One-time setup

1. **GitHub Pages**: Settings > Pages > Source: *GitHub Actions*.
2. **Azure**: `az login`, then `./infra/azure/setup.sh`. It creates a free F1 Linux plan and the web app, an OIDC identity for GitHub Actions, and sets repository variables (`AZURE_*`, `CHIZMA_API_URL`).
3. **Budget alerts**: Azure portal > Cost Management > Budgets, monthly budget with alerts at $5 and $20.
4. **Releases**: Settings > Actions > General > allow GitHub Actions to create pull requests (needed by release-please).

## Releasing

release-please keeps a release PR open (`chore(main): release x.y.z`). Because it is opened by GitHub Actions, its CI run waits for approval: open the PR, click **Approve workflows to run** (or `gh api -X POST repos/<owner>/chizma/actions/runs/<run-id>/approve`), wait for green checks, then merge. Merging creates the tag, the GitHub Release and the Docker images in GHCR.

## Secrets

Secrets are set **only** in the Azure portal (Web app > Settings > Environment variables), never in the repository:
`OPENAI_API_KEY`, `CHIZMA_JWT_SECRET`, `CHIZMA_GITHUB_CLIENT_ID`, `CHIZMA_GITHUB_CLIENT_SECRET`, `CHIZMA_GOOGLE_CLIENT_ID`, `CHIZMA_GOOGLE_CLIENT_SECRET`.

## Limits of the free tier

F1 sleeps when idle (first request after a pause takes 10–30 s) and has 60 CPU minutes per day. Fine for testing; for demos consider B1 (paid from credits).

## Before the pilot (M5)

GitHub Pages does not allow hosting commercial customer sites. Published customer sites will need another host (for example Cloudflare Workers + R2) and a custom domain.
