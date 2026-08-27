#!/usr/bin/env python3
from pathlib import Path
import json, re, sys

ROOT = Path(__file__).resolve().parents[1]
checks = []
def check(name, ok, detail=''):
    checks.append((name, bool(ok), detail))

def text(path): return (ROOT/path).read_text(errors='ignore')

check('Build-free static deployment', not (ROOT/'vite.config.js').exists() and not (ROOT/'node_modules').exists())
check('No runtime SQLite', 'sqlite' not in '\n'.join(p.read_text(errors='ignore').lower() for p in (ROOT/'src').glob('*.js')))
check('Session-only PAT', 'sessionStorage' in text('src/auth.js') and 'localStorage' not in text('src/auth.js'))
check('Fine-grained PAT prefix validation', 'github_pat_' in text('src/auth.js'))
check('CSP blocks inline/eval scripts', "script-src 'self'" in text('index.html') and "'unsafe-eval'" not in text('index.html'))
check('CSP limits inline allowance to style attributes', "style-src-attr 'unsafe-inline'" in text('index.html'))
check('CSP API allowlist', 'connect-src https://api.github.com' in text('index.html'))
check('PWA manifest', (ROOT/'manifest.webmanifest').exists())
check('Service worker same-origin cache only', "url.origin !== self.location.origin" in text('sw.js'))
check('Optimistic concurrency SHA', 'if (sha) body.sha = sha' in text('src/github.js'))
check('Conflict handling', 'res.status === 409' in text('src/github.js'))
check('Referential deletion guard', 'referencesTo(entity, id)' in text('src/store.js'))
check('Entity validation', "validateEntity(entity, payload, this)" in text('src/store.js'))
check('Schema version fail-closed guard', 'Unsupported data schema version' in text('src/store.js'))
check('Offline read-only path', 'openCachedOffline' in text('src/main.js'))
check('JSON backup', 'exportJson' in text('src/export.js'))
check('CSV backup', 'exportCsv' in text('src/export.js'))
check('Storyline catalog', (ROOT/'fixtures/storylines.json').exists())
check('Node CRUD tests', (ROOT/'tests/store.test.mjs').exists())
check('Pytest suite', (ROOT/'tests_py/test_node_suite.py').exists())

secret_re = re.compile(r'(github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{20,})')
secret_hits=[]
for p in ROOT.rglob('*'):
    if p.is_file() and p.suffix not in {'.png','.zip'} and '.git' not in p.parts:
        m=secret_re.search(p.read_text(errors='ignore'))
        if m: secret_hits.append(str(p.relative_to(ROOT)))
check('No committed GitHub token', not secret_hits, ', '.join(secret_hits))

failed=[c for c in checks if not c[1]]
print('# Project Journal SOTA Audit')
for name, ok, detail in checks:
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f' - {detail}' if detail else ''))
print(f'\n{len(checks)-len(failed)}/{len(checks)} controls passed.')
if failed: sys.exit(1)
