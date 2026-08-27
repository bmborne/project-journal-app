# Security and Governance

## Security controls implemented

- Fine-grained GitHub PAT only; prefix checked before use.
- PAT is kept in `sessionStorage` only and is cleared on sign-out/session end.
- Recommended PAT access is one private repository only, `Contents: Read and write` only.
- No token is embedded in source, Actions variables or the data repository.
- CSP restricts scripts to same-origin and network connections to `api.github.com`.
- No `eval`, external JavaScript CDN, npm runtime packages, SQLite/WASM runtime or third-party analytics.
- PWA service worker caches only same-origin static assets and never GitHub API traffic.
- Git SHA optimistic concurrency prevents silent stale same-record overwrite.
- Referential integrity and field validation run before writes.
- GitHub writes complete before local cache mutation.
- Data repository is private and separate from the public Pages source.

## Residual risks

1. **PAT in a browser / GitHub Pages tradeoff**: GitHub documents that Pages is static hosting and should not be used for sensitive transactions. This architecture therefore treats token entry as its principal residual risk.  while the session is active, JavaScript in the same origin can access the token. Strict same-origin scripts/CSP and the absence of third-party scripts materially reduce this risk, but do not eliminate browser compromise or malicious extensions.
2. **Local cache confidentiality**: IndexedDB stores the last synchronized work records unencrypted so offline read-only mode can function. Anyone with access to the same browser profile may be able to inspect that cache. Use OS account/device encryption and clear the cache on devices that should no longer retain the journal.
3. **GitHub Pages headers**: Pages does not let this static project freely configure every HTTP security header. The app uses a meta CSP, but headers such as HSTS/frame restrictions are controlled by the hosting platform rather than this repository.
4. **Personal storage governance**: private GitHub is still personal external storage. Employer/client policy, contractual confidentiality, data protection and retention obligations take precedence over technical capability.
5. **Single-owner architecture**: this is not a multi-user collaborative transactional system. It uses optimistic conflict detection and is intended for one owner across devices.

## Recommended operating practices

- Use a separate token per device with an expiry date.
- Revoke the device token immediately when a device is lost or retired.
- Keep the data repository private.
- Never paste secrets, passwords, keys, access tokens, customer datasets, health/financial records, privileged legal material or employer source code into the journal.
- Export JSON periodically and/or clone/download the private data repository.
- Before leaving an employer, review what information you are permitted to retain and delete anything you are not entitled to keep.
