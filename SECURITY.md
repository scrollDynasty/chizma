# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report privately via GitHub: **Security > Report a vulnerability** on this repository (private vulnerability reporting). Include steps to reproduce and the impact you expect.

We aim to acknowledge reports within 3 days and to ship a fix or mitigation as soon as possible. We credit reporters in the release notes unless they prefer otherwise.

## Scope

Especially interesting:

- escaping the preview sandbox (generated code reaching the editor, its storage or tokens);
- leaking API keys, OAuth secrets or user tokens;
- bypassing generation quotas or rate limits;
- authentication flaws in the GitHub/Google sign-in flow.

## Supported versions

Only the latest release on `main` receives security fixes during the test phase.
