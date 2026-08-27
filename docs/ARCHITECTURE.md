# Architecture

## Runtime

```text
GitHub Pages (public app repo)
        |
        v
Static ES-module PWA
        |
        +---- IndexedDB -------- last synchronized local cache
        |
        +---- GitHub REST API -- authenticated with session-only fine-grained PAT
                    |
                    v
          private data repository
          data/projects/*.json
          data/entries/*.json
          data/people/*.json
          data/tags/*.json
```

GitHub is the durable source of truth. IndexedDB is a cache and offline read model. There is no live SQLite file and no backend server.

## Write transaction

1. UI validates the form.
2. `JournalStore` validates domain and referential rules.
3. The existing record's Git blob SHA is included in the GitHub Contents API update.
4. GitHub accepts the update and returns a new SHA, or rejects a stale same-record write with a conflict.
5. Only after GitHub accepts the write does the app replace its in-memory and IndexedDB version.

This ordering prevents a failed/conflicting cloud write from being presented locally as saved.

## Read/sync transaction

1. IndexedDB is loaded immediately when a connection attempt starts.
2. The app requests the data repository Git tree.
3. Unchanged paths whose SHA matches the IndexedDB/in-memory cache are reused.
4. Only new/changed blobs are downloaded and parsed.
5. Record ID must match its filename UUID.
6. Repository schema version must match the application schema.
7. The validated set replaces IndexedDB atomically at cache level.

## Offline mode

The PWA service worker caches only same-origin static application assets. It never caches GitHub API responses. IndexedDB contains the last synchronized data. The user can deliberately open cached data read-only without a token; writes are disabled until GitHub reconnects.

## Deployment

There is no build tool. GitHub Actions runs tests/audit, stages only the deployable static files, and passes that directory to GitHub Pages. This reduces dependency and supply-chain surface.
