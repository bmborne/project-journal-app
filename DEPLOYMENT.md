# Project Journal v3 — GitHub Deployment Runbook

## 1. What you are deploying

Use one personal GitHub account and two repositories:

- `project-journal-app` — **Public**. Contains only the static application and tests. GitHub Pages serves this repository.
- `project-journal-data` — **Private**. Contains the user's journal records. Never enable Pages on this repository.

There is no OneDrive, SQLite server, cloud database, npm runtime dependency, or paid service.

## 2. Create the repositories

1. Sign in to the personal GitHub account that should own the journal long-term.
2. Create **public** repository `project-journal-app`.
3. Create **private** repository `project-journal-data`.
4. Keep the default branch as `main` in both repositories.

## 3. Upload the data repository template

From the package, open `project-journal-data/` and push its contents to the private `project-journal-data` repository. The important initial file is `data/meta.json`.

Example with Git:

```bash
git init
git branch -M main
git add .
git commit -m "Initialize Project Journal data"
git remote add origin https://github.com/YOUR-USERNAME/project-journal-data.git
git push -u origin main
```

## 4. Confirm the app repository name

The default app configuration is in `src/config.js`:

```js
dataRepoName: 'project-journal-data'
```

If you chose a different private repository name, edit that value before deployment.

## 5. Upload the app repository

Push the contents of `project-journal-app/` to the public `project-journal-app` repository.

```bash
git init
git branch -M main
git add .
git commit -m "Deploy Project Journal v3"
git remote add origin https://github.com/YOUR-USERNAME/project-journal-app.git
git push -u origin main
```

The included workflow runs the Node CRUD/API suite, pytest suite, and static audit before deployment. Pages deploys only when every gate passes.

## 6. Enable GitHub Pages

In `project-journal-app`:

1. **Settings** → **Pages**.
2. Under **Build and deployment**, choose **GitHub Actions**.
3. Open **Actions** and wait for `Test and deploy Project Journal` to complete successfully.
4. The site will be available at:

```text
https://YOUR-USERNAME.github.io/project-journal-app/
```

If the repository is named `YOUR-USERNAME.github.io`, its URL is the account root instead.

## 7. Create the fine-grained token

In GitHub account settings create a **fine-grained personal access token**:

- Resource owner: the user's personal account.
- Repository access: **Only select repositories** → `project-journal-data`.
- Repository permissions: **Contents → Read and write**.
- Do not grant Actions, Administration, Issues, Pull Requests, Secrets, or other permissions.
- Prefer an expiry such as 90 days and rotate it when required.

Never store this token in either Git repository or in GitHub Actions variables/secrets. It belongs only in the user's browser session.

## 8. First run

1. Open the Pages URL.
2. Paste the fine-grained token.
3. Select **Connect private repository**.
4. Rename the generated first project or create the first real project.
5. Add an Action, Issue and Risk and confirm the Dashboard updates.
6. Open the private data repo and verify that GitHub created JSON records beneath `data/`.

## 9. Install it like an app

In a Chromium-based browser, use the browser's **Install app** option when offered. Project Journal includes a web app manifest and service worker, so it can run in a standalone window and cache static assets.

The local IndexedDB cache can be opened read-only when GitHub is unavailable. Writes require a live GitHub connection.

## 10. Second-device test

1. Open the Pages URL on a second device.
2. Create a separate fine-grained token for that device, restricted to the same private data repository.
3. Connect and verify the same projects appear.
4. Update one record on device A, sync device B, and verify the update appears.
5. For a concurrency acceptance test, edit the same record on two devices before syncing. The stale write must be rejected rather than silently winning.

## 11. Backup and recovery

Inside **Data & Sync**:

- **Export JSON** is the full-fidelity portable backup.
- **Export CSV** is an analytics-friendly flat export.
- GitHub itself retains commit history for record recovery.

For a periodic offline backup, download a ZIP of the private `project-journal-data` repository or clone it locally.

## 12. Updating the application

Push application changes to `main` in the public app repository. The test gate runs automatically; Pages deploys only after the tests and audit pass.

Data and application releases are intentionally separated. Updating the public UI does not expose or redeploy the private journal records.

## 13. Troubleshooting

- **404 private repository**: token is for the wrong owner/repository or the configured repository name is wrong.
- **401/403**: token expired, was revoked, or lacks Contents read/write.
- **409 conflict**: another device changed the same record; sync first, review the newer record, then reapply the intended change.
- **Offline cache**: GitHub is unreachable or the user deliberately opened cached data. It is read-only.
- **Pages does not deploy**: open Actions and inspect the failing test/audit step; do not bypass the gate without understanding the failure.
