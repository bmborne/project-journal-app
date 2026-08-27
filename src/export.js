import { downloadBytes, todayIso } from './utils.js';

function clean(obj) {
  const copy = { ...obj };
  delete copy.__path;
  delete copy.__sha;
  return copy;
}

export function exportJson(store) {
  const payload = {
    exportedAt: new Date().toISOString(),
    schemaVersion: 3,
    projects: store.projects({ includeArchived: true }).map(clean),
    people: store.people().map(clean),
    tags: store.tags().map(clean),
    entries: store.entries({ includeArchived: true }).map(clean)
  };
  downloadBytes(JSON.stringify(payload, null, 2), `project-journal-${todayIso()}.json`, 'application/json');
}

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('\"','\"\"')}"` : text;
}

export function exportCsv(store) {
  const people = new Map(store.people().map(p => [p.id, p.name]));
  const tags = new Map(store.tags().map(t => [t.id, t.name]));
  const projects = new Map(store.projects({ includeArchived: true }).map(p => [p.id, p.name]));
  const header = ['id','project','type','status','eventDate','title','body','owner','dueDate','priority','severity','likelihood','impact','reviewDate','people','tags','createdAt','updatedAt'];
  const rows = store.entries({ includeArchived: true }).map(e => [
    e.id, projects.get(e.projectId)||'', e.type, e.status||'', e.eventDate||'', e.title||'', e.body||'',
    people.get(e.ownerPersonId)||'', e.dueDate||'', e.priority||'', e.severity||'', e.likelihood||'', e.impact||'', e.reviewDate||'',
    (e.peopleIds||[]).map(id=>people.get(id)||id).join('; '), (e.tagIds||[]).map(id=>tags.get(id)||id).join('; '), e.createdAt||'', e.updatedAt||''
  ]);
  const csv = [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\r\n') + '\r\n';
  downloadBytes(csv, `project-journal-entries-${todayIso()}.csv`, 'text/csv;charset=utf-8');
}
