# Test and Acceptance Plan

## Automated layers

### Node built-in test suite

Runs without npm dependencies and covers:

- Project create/read/update/delete.
- Create/read/update/delete for Action, Issue, Risk, Decision, Meeting and Note.
- Person/tag case-insensitive de-duplication.
- Referential deletion guards.
- Orphan/type/date validation.
- Same-record conflict handling with no local mutation after rejected write.
- SHA-based incremental synchronization.
- Record/file identity corruption detection.
- GitHub API headers, SHA update payload, delete payload, 409 conflict and 422 validation handling.
- Utility escaping/risk calculations.

### Pytest suite

Covers:

- Seven end-to-end business story contracts.
- Cross-company project scoping expectation.
- Last-writer-wins rejection expectation.
- No SQLite/Vite runtime.
- CSP contract.
- Session-only token contract.
- PWA/service-worker contract.
- Secret scanning.
- Private data template contents.
- Executes the complete JavaScript CRUD/API suite as a pytest gate.

### Static audit

`python audit/audit.py` independently checks architecture/security controls before deployment.

## Manual acceptance storyline

1. Deploy both repositories.
2. Connect using a fine-grained token.
3. Create Project A for Employer/Client A.
4. Add an owner and tags; create Action, Issue, Risk, Decision, Meeting and Note.
5. Update each record and close/reopen tracked items.
6. Confirm dashboard metrics and per-project scoping.
7. Create Project B with another organisation and confirm project scoping does not mix records.
8. Export JSON and CSV and inspect both.
9. Disconnect network and open cached data read-only.
10. Reconnect and sync.
11. Use a second device to verify cross-device records.
12. Attempt a stale same-record update from two devices; verify the stale writer receives a conflict and does not silently overwrite the newer record.
13. Attempt to delete a referenced project/person/tag; verify deletion is blocked.
14. Delete an unreferenced entry and verify it disappears from the active journal but remains recoverable through Git history.

## Release gate

A release is deployable only when Node tests, pytest and the audit all return exit code 0. GitHub Actions enforces this by making the Pages deployment job depend on the test job.
