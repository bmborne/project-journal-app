# Storyline Acceptance Matrix

| ID | Story | Expected result |
|---|---|---|
| S01 | New consultant creates first project, owner, tag and action | All records are linked; dashboard counts the action; close/reopen works. |
| S02 | Issue lifecycle | Severity/root cause/resolution persist and Git history versions the record. |
| S03 | Risk governance | Likelihood/impact/review/mitigation persist and risk remains project-scoped. |
| S04 | Work across different companies/projects | Portfolio view may aggregate, but selecting one project shows only that project's records. |
| S05 | Two devices edit the same stale record | Second stale write is rejected with a conflict; no silent last-writer-wins overwrite. |
| S06 | GitHub/network unavailable | Last synchronized IndexedDB cache opens read-only; writes are disabled. |
| S07 | Owner wants portability | JSON full backup and CSV analytical export contain data but never contain the GitHub token. |

The machine-readable forms of these stories are in `fixtures/storylines.json` and are checked by pytest.
