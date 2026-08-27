import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_javascript_crud_and_api_suite():
    result = subprocess.run(['node','--test','tests/store.test.mjs','tests/github.test.mjs','tests/utils.test.mjs'], cwd=ROOT, text=True, capture_output=True)
    assert result.returncode == 0, result.stdout + '\n' + result.stderr
