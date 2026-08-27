import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_storyline_catalog_is_complete():
    stories = json.loads((ROOT / 'fixtures/storylines.json').read_text())
    ids = {s['id'] for s in stories}
    assert ids == {'S01','S02','S03','S04','S05','S06','S07'}
    assert all(s['steps'] and s['expected'] for s in stories)


def test_cross_company_story_explicitly_scopes_by_project():
    stories = json.loads((ROOT / 'fixtures/storylines.json').read_text())
    s4 = next(s for s in stories if s['id'] == 'S04')
    assert 'scope dashboard to one project' in s4['steps']
    assert 'do not cross project boundaries' in s4['expected']


def test_conflict_story_requires_rejection_not_last_writer_wins():
    stories = json.loads((ROOT / 'fixtures/storylines.json').read_text())
    s5 = next(s for s in stories if s['id'] == 'S05')
    assert 'GitHub returns conflict' in s5['expected']
