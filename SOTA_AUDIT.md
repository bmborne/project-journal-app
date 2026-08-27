# SOTA-Level Engineering Audit

Audit date: 2026-08-27

## Outcome

The deployable design is intentionally small and conservative: native browser APIs, static ES modules, GitHub REST, IndexedDB, and GitHub Pages. No application runtime package manager or binary database is required.

Automated release gates at packaging time:

- JavaScript: 17/17 tests passed.
- Pytest: 13/13 tests passed.
- Static architecture/security audit: 21/21 controls passed.

## Strengths

- Separate public application and private data repositories.
- Least-privilege repository-scoped fine-grained PAT guidance.
- Session-only credential storage.
- No third-party runtime scripts or analytics.
- Strict script CSP and API origin allowlist.
- PWA same-origin static caching only.
- Incremental SHA sync and optimistic concurrency.
- Domain validation and referential integrity.
- Git write succeeds before local cache mutation.
- Schema-version guard.
- JSON/CSV portability.
- Automated tests gate deployment.

## Deliberate limitations

- One-owner design, not a shared team database.
- Offline mode is read-only.
- IndexedDB cache is not encrypted by the application.
- Personal GitHub storage may be disallowed for some employer/client information.
- GitHub API availability and rate limits remain external dependencies.
- Fine-grained PAT UX is less elegant than a server-backed OAuth flow but avoids introducing a paid/hosted backend and client-secret problem into a static site.

## Decision

For the stated requirements—single owner, multiple projects, several devices, personal GitHub ownership, no recurring infrastructure charge—this architecture is preferred over SQLite-in-Git, OneDrive-synchronized SQLite, or an externally hosted SQL database.
