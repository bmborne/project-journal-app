# Project Journal Auth Broker

GitHub Pages cannot call GitHub's device-flow OAuth endpoints directly from browser JavaScript because those endpoints are not CORS-enabled for this use. This Worker is a minimal CORS bridge.

Recommended setup:

1. Create a GitHub App owned by `bmborne`.
2. Enable device flow in the app settings.
3. Give the app repository permission `Contents: Read and write`.
4. Install the app on only `project-journal-data`.
5. Deploy this Worker with:
   - `GITHUB_CLIENT_ID`: the GitHub App client ID.
   - `GITHUB_REPOSITORY_ID`: optional repository ID for `project-journal-data`.
   - `ALLOWED_ORIGIN`: `https://bmborne.github.io`.
6. Set `authBrokerUrl` in `src/config.js` to the Worker URL and redeploy `project-journal-app`.

The Worker does not store tokens. The browser stores the returned GitHub access token only in `sessionStorage`.

If you use a custom Worker domain instead of `workers.dev`, add that HTTPS origin to the `connect-src` Content Security Policy in `index.html`.
