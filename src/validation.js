const UUID_RE = /^[0-9a-fA-F-]{36}$/;
const TYPES = new Set(['action','issue','risk','decision','meeting','note']);
const STATUSES = new Set(['open','in-progress','blocked','closed','active','on-hold','completed','archived']);

export function assertUuid(value, label = 'id') {
  if (!UUID_RE.test(String(value || ''))) throw new Error(`${label} must be a UUID.`);
}

function requiredText(value, label, max = 500) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${label} is required.`);
  if (text.length > max) throw new Error(`${label} is too long.`);
  return text;
}

export function validateEntity(entity, data, store = null) {
  if (!['projects','entries','people','tags'].includes(entity)) throw new Error(`Unsupported entity: ${entity}`);
  if (data.id) assertUuid(data.id);
  if (entity === 'projects') {
    requiredText(data.name, 'Project name', 200);
    if (data.status && !STATUSES.has(data.status)) throw new Error('Invalid project status.');
    if (data.startDate && data.endDate && data.endDate < data.startDate) throw new Error('Project end date cannot be before start date.');
  }
  if (entity === 'people' || entity === 'tags') requiredText(data.name, entity === 'people' ? 'Person name' : 'Tag name', 200);
  if (entity === 'entries') {
    requiredText(data.title, 'Entry title', 300);
    assertUuid(data.projectId, 'projectId');
    if (!TYPES.has(data.type)) throw new Error('Invalid entry type.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.eventDate || ''))) throw new Error('eventDate must use YYYY-MM-DD.');
    if (store && !store.getById('projects', data.projectId)) throw new Error('Entry project does not exist.');
    if (data.ownerPersonId && store && !store.getById('people', data.ownerPersonId)) throw new Error('Entry owner does not exist.');
    for (const id of data.peopleIds || []) if (store && !store.getById('people', id)) throw new Error(`Referenced person does not exist: ${id}`);
    for (const id of data.tagIds || []) if (store && !store.getById('tags', id)) throw new Error(`Referenced tag does not exist: ${id}`);
    if (data.type === 'action' && data.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(data.dueDate)) throw new Error('Action due date is invalid.');
    if (data.type === 'risk' && data.reviewDate && !/^\d{4}-\d{2}-\d{2}$/.test(data.reviewDate)) throw new Error('Risk review date is invalid.');
  }
  return true;
}
