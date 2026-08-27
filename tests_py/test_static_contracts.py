from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]


def test_runtime_has_no_sqlite_or_node_dependency():
    text = '\n'.join(p.read_text(errors='ignore') for p in (ROOT/'src').glob('*.js'))
    assert 'sql.js' not in text
    assert 'sqlite' not in text.lower()
    assert not (ROOT/'vite.config.js').exists()


def test_csp_restricts_runtime():
    html = (ROOT/'index.html').read_text()
    assert "connect-src https://api.github.com" in html
    assert "script-src 'self'" in html
    assert "object-src 'none'" in html
    assert "base-uri 'none'" in html
    assert "'unsafe-eval'" not in html
    assert "script-src 'self'" in html
    assert "style-src-attr 'unsafe-inline'" in html


def test_token_is_session_only():
    auth = (ROOT/'src/auth.js').read_text()
    assert 'sessionStorage' in auth
    assert 'localStorage' not in auth
    assert 'github_pat_' in auth


def test_pwa_assets_exist_and_manifest_is_valid():
    manifest = json.loads((ROOT/'manifest.webmanifest').read_text())
    assert manifest['display'] == 'standalone'
    assert manifest['start_url'] == './'
    assert (ROOT/'sw.js').exists()
    for icon in manifest['icons']:
        assert (ROOT/icon['src'].removeprefix('./')).exists()


def test_service_worker_does_not_intercept_github_api():
    sw = (ROOT/'sw.js').read_text()
    assert "url.origin !== self.location.origin" in sw
    assert 'api.github.com' not in sw


def test_no_embedded_pat_or_common_secret_pattern():
    forbidden = [re.compile(r'github_pat_[A-Za-z0-9_]{20,}'), re.compile(r'ghp_[A-Za-z0-9]{20,}')]
    for p in ROOT.rglob('*'):
        if not p.is_file() or '.git' in p.parts or p.suffix in {'.png','.zip'}:
            continue
        text = p.read_text(errors='ignore')
        for pattern in forbidden:
            assert not pattern.search(text), f'possible secret in {p}'


def test_data_template_contains_only_metadata():
    data_root = ROOT.parent/'project-journal-data'/'data'
    files = [p.relative_to(data_root).as_posix() for p in data_root.rglob('*') if p.is_file()]
    assert files == ['meta.json']


def test_html_ids_are_unique():
    html = (ROOT/'index.html').read_text()
    ids = re.findall(r'\bid="([^"]+)"', html)
    assert len(ids) == len(set(ids)), 'duplicate HTML id found'


def test_service_worker_asset_manifest_matches_files():
    sw = (ROOT/'sw.js').read_text()
    assets = re.findall(r"'\./([^']+)'", sw)
    for asset in assets:
        if asset == '':
            continue
        assert (ROOT/asset).exists(), f'missing cached asset: {asset}'
