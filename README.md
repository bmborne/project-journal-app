# Project Journal v3

A personal, multi-project PWA for Actions, Issues, Risks, Decisions, Meetings and Notes. GitHub Pages serves the static app; a separate private GitHub repository stores one JSON file per record. IndexedDB is a local cache, not the source of truth.

## Design goals

- Zero recurring infrastructure cost under normal GitHub Free usage.
- Personal ownership independent of an employer Microsoft tenant.
- Multi-project portfolio dashboard and per-project scoping.
- Git-native history and SHA-based optimistic concurrency.
- No SQLite runtime, no cloud database, no npm runtime dependencies.
- Session-only fine-grained GitHub PAT.
- Offline read-only cache via IndexedDB.
- Full JSON and CSV export.
- PWA installation.
- Test-before-deploy GitHub Actions gate.

## Test commands

```bash
node --test tests/*.test.mjs
pytest -q
python audit/audit.py
```

Or:

```bash
npm run test:all
```

`package.json` contains scripts only; there are no npm dependencies to install.

See `DEPLOYMENT.md` for the end-to-end setup and `docs/` for architecture, security, data model, storyline tests and acceptance criteria.
