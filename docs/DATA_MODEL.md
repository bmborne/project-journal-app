# Data Model

## Project

Required: `id`, `name`. Typical fields: `code`, `organisation`, `status`, `startDate`, `endDate`, `description`, `objective`, timestamps.

## Entry

Every journal record has `id`, `projectId`, `type`, `eventDate`, `title` and timestamps. Supported types:

- `action`: status, owner, due date, priority.
- `issue`: status, owner, severity, root cause, resolution.
- `risk`: status, owner, likelihood, impact, review date, mitigation.
- `decision`: decision text/context.
- `meeting`: meeting notes/context.
- `note`: general project note.

Optional shared relationships are `peopleIds` and `tagIds`.

## Person

`id`, `name`, timestamps. A person may be an entry owner and/or participant.

## Tag

`id`, `name`, timestamps.

## Referential rules

- An entry cannot be created for a non-existent project.
- An owner/participant/tag reference must exist.
- A project, person or tag cannot be physically deleted while an entry references it.
- Projects are normally archived rather than deleted.
- Entry JSON ID must equal its filename UUID.

## Physical Git layout

```text
data/meta.json
data/projects/<uuid>.json
data/entries/<uuid>.json
data/people/<uuid>.json
data/tags/<uuid>.json
```

Small independently versioned records provide useful Git history and reduce cross-device collision compared with a single binary database file.
