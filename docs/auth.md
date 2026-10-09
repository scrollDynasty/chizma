# Sign-in setup (GitHub and Google)

Chizma has no passwords and stores no email addresses: people sign in with GitHub or Google. Only the public profile (id, login, name, avatar) is requested.

## Flow

1. The editor opens `API/v1/auth/{github|google}/login`.
2. The provider sends the user back to `API/v1/auth/{provider}/callback`.
3. The API redirects to `EDITOR/auth/callback?code=...` with a one-time code (valid 60 s).
4. The editor exchanges the code at `POST /v1/auth/exchange` for a JWT and sends it as `Authorization: Bearer`.

## GitHub OAuth app

GitHub > Settings > Developer settings > OAuth Apps > New OAuth App.

- Homepage URL: your editor, e.g. `https://<owner>.github.io/chizma/`
- Redirect URIs (one app can hold several):
  - `https://<api-host>/v1/auth/github/callback`
  - `http://localhost:8000/v1/auth/github/callback`

Set `CHIZMA_GITHUB_CLIENT_ID` and `CHIZMA_GITHUB_CLIENT_SECRET`.

## Google OAuth client

Google Cloud Console > Google Auth Platform.

- Audience: External, publishing status **Testing** (only listed test users can sign in).
- Clients > Web application, authorized redirect URIs:
  - `https://<api-host>/v1/auth/google/callback`
  - `http://localhost:8000/v1/auth/google/callback`

Set `CHIZMA_GOOGLE_CLIENT_ID` and `CHIZMA_GOOGLE_CLIENT_SECRET`.

## Other settings

| Variable | Purpose |
|---|---|
| `CHIZMA_JWT_SECRET` | Signs API tokens. In production it must be at least 32 characters, otherwise sign-in stays disabled. Generate: `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `CHIZMA_PUBLIC_API_URL` | Public URL of the API, used to build callback URLs |
| `CHIZMA_WEB_URL` | Editor URL, where users land after sign-in |
| `CHIZMA_ALLOWED_USERS` | Optional allow-list for a closed test: `github:<login>`, `github:<id>`, `google:<subject>` |

A provider appears on the sign-in page only when both its client id and secret are set.
