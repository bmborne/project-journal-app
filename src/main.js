import { config, validateConfig } from './config.js';
import { setAccessToken, hasSavedAuth, signOut } from './auth.js';
import { isDeviceAuthConfigured, pollForToken, requestDeviceCode } from './device-auth.js?v=7';
import { JournalStore } from './store.js';
import { ConflictError, GitHubError } from './github.js';
import { clearCache } from './cache.js';
import { exportJson, exportCsv } from './export.js';
import { escapeHtml, formatDate, normalizeList, riskBand, riskScore, todayIso, uuid, daysUntil } from './utils.js';

const $ = id => document.getElementById(id);
const store = new JournalStore();
const trackedTypes = new Set(['action', 'issue', 'risk']);
const typeMeta = {
  action: { label: 'Action', color: '#246bfe', bg: '#eaf0ff', fg: '#245ac4' },
  issue: { label: 'Issue', color: '#c4573a', bg: '#fbece7', fg: '#99422d' },
  risk: { label: 'Risk', color: '#8d3b79', bg: '#f6e9f2', fg: '#793568' },
  decision: { label: 'Decision', color: '#5b54b7', bg: '#eeecfb', fg: '#504aa0' },
  meeting: { label: 'Meeting', color: '#158067', bg: '#e8f5f1', fg: '#28715f' },
  note: { label: 'Note', color: '#6e7d8a', bg: '#edf1f4', fg: '#596975' }
};

const state = {
  view: 'dashboard',
  scopeProjectId: 'all',
  editingEntryId: null,
  editingProjectId: null,
  connected: false,
  readOnly: false,
};

function setSync(status, mode = '') {
  $('sync-status').textContent = status;
  $('sync-chip').className = `sync-chip ${mode}`.trim();
}

function banner(message, kind = '') {
  const el = $('banner');
  if (!message) { el.classList.add('hidden'); return; }
  el.textContent = message;
  el.className = `banner ${kind}`.trim();
}

function showLogin() {
  $('login-view').classList.remove('hidden');
  $('app-view').classList.add('hidden');
}

function showApp() {
  $('login-view').classList.add('hidden');
  $('app-view').classList.remove('hidden');
}

function projectById(id) { return store.projects({ includeArchived: true }).find(p => p.id === id) || null; }
function personById(id) { return store.people().find(p => p.id === id) || null; }
function tagById(id) { return store.tags().find(t => t.id === id) || null; }
function personName(id) { return personById(id)?.name || ''; }
function tagName(id) { return tagById(id)?.name || ''; }

function scopeEntries(includeArchived = false) {
  let entries = store.entries({ includeArchived });
  if (state.scopeProjectId !== 'all') entries = entries.filter(e => e.projectId === state.scopeProjectId);
  return entries;
}

function activeProjectEntries(projectId) {
  return store.entries().filter(e => e.projectId === projectId);
}

function renderProjectScope() {
  const projects = store.projects();
  if (state.scopeProjectId !== 'all' && !projects.some(p => p.id === state.scopeProjectId)) state.scopeProjectId = 'all';
  $('project-scope').innerHTML = `<option value="all">All projects</option>${projects.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}${p.code ? ` - ${escapeHtml(p.code)}` : ''}</option>`).join('')}`;
  $('project-scope').value = state.scopeProjectId;
  $('e-project').innerHTML = projects.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('');
  if (!$('e-project').value && projects[0]) $('e-project').value = projects[0].id;
}

function renderPeopleDatalist() {
  $('people-list').innerHTML = store.people().map(p => `<option value="${escapeHtml(p.name)}"></option>`).join('');
}

function setView(view) {
  state.view = view;
  document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
  $(`${view}-view`).classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
  const titles = {
    dashboard: ['Portfolio overview', 'Dashboard'],
    journal: ['Searchable work history', 'Journal'],
    projects: ['Portfolio catalogue', 'Projects'],
    data: ['GitHub-backed storage', 'Data & Sync']
  };
  $('view-eyebrow').textContent = titles[view][0];
  $('view-title').textContent = titles[view][1];
  if (view === 'dashboard') renderDashboard();
  if (view === 'journal') renderJournal();
  if (view === 'projects') renderProjects();
  if (view === 'data') renderDataView();
}

function dashboardMetrics(entries) {
  const openActions = entries.filter(e => e.type === 'action' && e.status !== 'closed');
  const overdue = openActions.filter(e => e.dueDate && e.dueDate < todayIso());
  const openIssues = entries.filter(e => e.type === 'issue' && e.status !== 'closed');
  const openRisks = entries.filter(e => e.type === 'risk' && e.status !== 'closed');
  const highRisks = openRisks.filter(e => riskScore(e.likelihood, e.impact) >= 9);
  const sevenDaysAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const recent = entries.filter(e => e.eventDate >= sevenDaysAgo);
  return { openActions, overdue, openIssues, openRisks, highRisks, recent };
}

function renderMetric(value, label, sub = '', cls = '') {
  return `<div class="metric-card ${cls}"><div class="value">${value}</div><div class="label">${escapeHtml(label)}</div><div class="sub">${escapeHtml(sub)}</div></div>`;
}

function renderBarList(rows, colorMap = {}) {
  const max = Math.max(1, ...rows.map(r => r.value));
  if (!rows.some(r => r.value)) return `<div class="empty-state"><strong>No activity yet</strong>Add journal entries to populate this visual.</div>`;
  return `<div class="bar-list">${rows.map(r => {
    const p = Math.round((r.value / max) * 100);
    return `<div class="bar-row"><div class="bar-label" title="${escapeHtml(r.label)}">${escapeHtml(r.label)}</div><div class="bar-track"><div class="bar-fill" style="--p:${p};--bar:${colorMap[r.key] || '#246bfe'}"></div></div><div class="bar-num">${r.value}</div></div>`;
  }).join('')}</div>`;
}

function projectHealthRows() {
  return store.projects().map(p => {
    const entries = activeProjectEntries(p.id);
    const m = dashboardMetrics(entries);
    return { p, entries, m };
  });
}

function renderRiskMatrix(entries) {
  const likelihoods = ['rare', 'unlikely', 'possible', 'likely', 'almost-certain'];
  const impacts = ['critical', 'high', 'medium', 'low'];
  const labelL = ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost certain'];
  const risks = entries.filter(e => e.type === 'risk' && e.status !== 'closed');
  let html = `<div class="risk-matrix"><div></div>${labelL.map(x => `<div class="risk-head">${x}</div>`).join('')}`;
  for (const impact of impacts) {
    html += `<div class="risk-side">${impact[0].toUpperCase() + impact.slice(1)}</div>`;
    for (const likelihood of likelihoods) {
      const count = risks.filter(r => r.likelihood === likelihood && r.impact === impact).length;
      const band = riskBand(riskScore(likelihood, impact));
      html += `<div class="risk-cell ${band} ${count ? '' : 'empty-cell'}">${count || 0}</div>`;
    }
  }
  html += '</div>';
  return html;
}

function renderRecent(entries) {
  const rows = [...entries].sort((a,b) => (b.eventDate || '').localeCompare(a.eventDate || '') || (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 8);
  if (!rows.length) return `<div class="empty-state"><strong>No journal history yet</strong>Your most recent project records will appear here.</div>`;
  return `<div class="recent-list">${rows.map(e => {
    const t = typeMeta[e.type] || typeMeta.note;
    const project = projectById(e.projectId);
    return `<div class="recent-item"><div class="recent-date">${escapeHtml(formatDate(e.eventDate))}</div><div><div class="recent-title">${escapeHtml(e.title)}</div><div class="recent-meta">${escapeHtml(project?.name || 'Unknown project')}${e.status ? ` · ${escapeHtml(e.status)}` : ''}</div></div><span class="type-badge" style="--type-bg:${t.bg};--type-fg:${t.fg}">${t.label}</span></div>`;
  }).join('')}</div>`;
}

function renderDashboard() {
  const entries = state.scopeProjectId === 'all'
    ? store.entries().filter(e => projectById(e.projectId)?.status !== 'archived')
    : scopeEntries();
  const projects = store.projects();
  const m = dashboardMetrics(entries);
  const scopeProject = state.scopeProjectId === 'all' ? null : projectById(state.scopeProjectId);
  const typeRows = Object.keys(typeMeta).map(key => ({ key, label: typeMeta[key].label, value: entries.filter(e => e.type === key).length }));
  const openProjectRows = projects.map(p => ({ key: p.id, label: p.name, value: activeProjectEntries(p.id).filter(e => trackedTypes.has(e.type) && e.status !== 'closed').length })).sort((a,b) => b.value - a.value).slice(0,8);
  const health = projectHealthRows();

  $('dashboard-view').innerHTML = `
    <div class="section-head">
      <div><div class="eyebrow">${scopeProject ? escapeHtml(scopeProject.organisation || 'Selected project') : 'Across your portfolio'}</div><h2>${scopeProject ? escapeHtml(scopeProject.name) : 'Project overview'}</h2></div>
      <button class="btn primary" data-action="new-entry">+ New entry</button>
    </div>
    ${scopeProject && (scopeProject.description || scopeProject.objective) ? `<section class="panel"><div class="form-grid cols-2"><div><div class="eyebrow">Project context</div><p class="entry-body">${escapeHtml(scopeProject.description || 'No description')}</p></div><div><div class="eyebrow">Objective</div><p class="entry-body">${escapeHtml(scopeProject.objective || 'No objective recorded')}</p></div></div></section>` : ''}
    <div class="metric-grid">
      ${renderMetric(state.scopeProjectId === 'all' ? projects.filter(p => p.status === 'active').length : 1, state.scopeProjectId === 'all' ? 'Active projects' : 'Project selected', state.scopeProjectId === 'all' ? `${projects.length} visible projects` : (scopeProject?.code || ''))}
      ${renderMetric(m.openActions.length, 'Open actions', `${m.overdue.length} overdue`, m.overdue.length ? 'alert' : '')}
      ${renderMetric(m.overdue.length, 'Overdue actions', 'Past due and still open', m.overdue.length ? 'alert' : 'good')}
      ${renderMetric(m.openIssues.length, 'Open issues', 'Requires resolution', m.openIssues.length ? 'warn' : 'good')}
      ${renderMetric(m.highRisks.length, 'High risks', `${m.openRisks.length} open risks`, m.highRisks.length ? 'alert' : 'good')}
      ${renderMetric(m.recent.length, '7-day activity', `${entries.length} total records`)}
    </div>
    <div class="dashboard-grid">
      <section class="chart-card"><div class="eyebrow">Work mix</div><h3>Records by type</h3><div class="chart-sub">Distribution of captured project knowledge in the current view.</div>${renderBarList(typeRows, Object.fromEntries(Object.entries(typeMeta).map(([k,v]) => [k,v.color])))}</section>
      <section class="chart-card"><div class="eyebrow">Workload</div><h3>Open work by project</h3><div class="chart-sub">Open actions, issues and risks.</div>${renderBarList(openProjectRows)}</section>
    </div>
    <div class="dashboard-grid equal">
      <section class="chart-card"><div class="eyebrow">Portfolio health</div><h3>Project control overview</h3><div class="chart-sub">Current open control items per project.</div>
        ${health.length ? `<div style="overflow:auto"><table class="project-health-table"><thead><tr><th>Project</th><th>Status</th><th>Actions</th><th>Overdue</th><th>Issues</th><th>High risks</th></tr></thead><tbody>${health.map(({p,m}) => `<tr><td class="health-project">${escapeHtml(p.name)}</td><td><span class="mini-status ${p.status}">${escapeHtml(p.status)}</span></td><td>${m.openActions.length}</td><td>${m.overdue.length}</td><td>${m.openIssues.length}</td><td>${m.highRisks.length}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty-state"><strong>No projects</strong>Create a project to start.</div>`}
      </section>
      <section class="chart-card"><div class="eyebrow">Risk exposure</div><h3>Risk matrix</h3><div class="chart-sub">Open risks by likelihood and impact.</div>${renderRiskMatrix(entries)}</section>
    </div>
    <section class="chart-card"><div class="eyebrow">Timeline</div><h3>Recent activity</h3><div class="chart-sub">Latest records in the current project scope.</div>${renderRecent(entries)}</section>
  `;
}

function entrySearchText(e) {
  return [e.title,e.body,e.rootCause,e.resolution,e.mitigation,e.decision,personName(e.ownerPersonId),...(e.peopleIds||[]).map(personName),...(e.tagIds||[]).map(tagName),projectById(e.projectId)?.name].join(' ').toLowerCase();
}

function filteredJournalEntries() {
  let entries = scopeEntries();
  const q = $('filter-search')?.value.trim().toLowerCase() || '';
  const type = $('filter-type')?.value || 'all';
  const status = $('filter-status')?.value || 'all';
  const from = $('filter-from')?.value || '';
  const to = $('filter-to')?.value || '';
  if (q) entries = entries.filter(e => entrySearchText(e).includes(q));
  if (type !== 'all') entries = entries.filter(e => e.type === type);
  if (status !== 'all') entries = entries.filter(e => e.status === status);
  if (from) entries = entries.filter(e => e.eventDate >= from);
  if (to) entries = entries.filter(e => e.eventDate <= to);
  return entries;
}

function entryDetailPills(e) {
  const rows = [];
  if (e.ownerPersonId) rows.push(`Owner: ${personName(e.ownerPersonId)}`);
  if (e.dueDate) rows.push(`Due: ${formatDate(e.dueDate)}${e.status !== 'closed' && daysUntil(e.dueDate) < 0 ? ' (overdue)' : ''}`);
  if (e.priority) rows.push(`Priority: ${e.priority}`);
  if (e.severity) rows.push(`Severity: ${e.severity}`);
  if (e.likelihood) rows.push(`Likelihood: ${e.likelihood}`);
  if (e.impact) rows.push(`Impact: ${e.impact}`);
  if (e.reviewDate) rows.push(`Review: ${formatDate(e.reviewDate)}`);
  if (e.rootCause) rows.push(`Root cause: ${e.rootCause}`);
  if (e.resolution) rows.push(`Resolution: ${e.resolution}`);
  if (e.mitigation) rows.push(`Mitigation: ${e.mitigation}`);
  if (e.decision) rows.push(`Decision: ${e.decision}`);
  return rows.map(x => `<span class="entry-detail">${escapeHtml(x)}</span>`).join('');
}

function renderEntryCard(e) {
  const t = typeMeta[e.type] || typeMeta.note;
  const project = projectById(e.projectId);
  const people = (e.peopleIds || []).map(personName).filter(Boolean);
  const tags = (e.tagIds || []).map(tagName).filter(Boolean);
  return `<article class="entry-card" style="--entry-color:${t.color}">
    <div class="entry-top"><div class="entry-meta"><span class="type-badge" style="--type-bg:${t.bg};--type-fg:${t.fg}">${t.label}</span><span class="entry-project">${escapeHtml(project?.name || 'Unknown project')}</span>${e.status ? `<span class="entry-status ${e.status}">${escapeHtml(e.status)}</span>` : ''}<span class="data-pill">${escapeHtml(formatDate(e.eventDate))}</span></div>
    <div class="entry-actions"><button class="btn secondary" data-action="edit-entry" data-id="${escapeHtml(e.id)}">Edit</button>${trackedTypes.has(e.type) ? `<button class="btn secondary" data-action="toggle-entry" data-id="${escapeHtml(e.id)}">${e.status === 'closed' ? 'Reopen' : 'Close'}</button>` : ''}<button class="btn danger" data-action="delete-entry" data-id="${escapeHtml(e.id)}">Delete</button></div></div>
    <h3>${escapeHtml(e.title)}</h3>${e.body ? `<p class="entry-body">${escapeHtml(e.body)}</p>` : ''}
    ${entryDetailPills(e) ? `<div class="entry-details">${entryDetailPills(e)}</div>` : ''}
    ${(people.length || tags.length) ? `<div class="tag-row">${people.map(x => `<span class="tag-chip person">${escapeHtml(x)}</span>`).join('')}${tags.map(x => `<span class="tag-chip">#${escapeHtml(x)}</span>`).join('')}</div>` : ''}
  </article>`;
}

function renderJournal() {
  renderProjectScope();
  renderPeopleDatalist();
  const entries = filteredJournalEntries();
  $('journal-results').innerHTML = entries.length ? `<div class="section-head"><div><div class="eyebrow">Results</div><h2>${entries.length} ${entries.length === 1 ? 'record' : 'records'}</h2></div></div><div class="entry-list">${entries.map(renderEntryCard).join('')}</div>` : `<div class="empty-state"><strong>No matching records</strong>Adjust the filters or add a new journal entry.</div>`;
}

function openEntryEditor(id = null) {
  if (state.readOnly) { banner('The app is in offline read-only mode. Reconnect to GitHub before editing.', 'error'); return; }
  state.editingEntryId = id;
  const entry = id ? store.getById('entries', id) : null;
  $('entry-form-title').textContent = entry ? 'Edit entry' : 'New entry';
  $('e-project').value = entry?.projectId || (state.scopeProjectId !== 'all' ? state.scopeProjectId : store.projects()[0]?.id || '');
  $('e-date').value = entry?.eventDate || todayIso();
  $('e-type').value = entry?.type || 'action';
  $('e-status').value = entry?.status || 'open';
  $('e-title').value = entry?.title || '';
  $('e-body').value = entry?.body || '';
  $('e-owner').value = entry?.type === 'action' ? personName(entry.ownerPersonId) : '';
  $('e-due').value = entry?.dueDate || '';
  $('e-priority').value = entry?.priority || '';
  $('e-issue-owner').value = entry?.type === 'issue' ? personName(entry.ownerPersonId) : '';
  $('e-severity').value = entry?.severity || '';
  $('e-root-cause').value = entry?.rootCause || '';
  $('e-resolution').value = entry?.resolution || '';
  $('e-risk-owner').value = entry?.type === 'risk' ? personName(entry.ownerPersonId) : '';
  $('e-likelihood').value = entry?.likelihood || '';
  $('e-impact').value = entry?.impact || '';
  $('e-review-date').value = entry?.reviewDate || '';
  $('e-mitigation').value = entry?.mitigation || '';
  $('e-decision').value = entry?.decision || '';
  $('e-people').value = (entry?.peopleIds || []).map(personName).filter(Boolean).join(', ');
  $('e-tags').value = (entry?.tagIds || []).map(tagName).filter(Boolean).join(', ');
  $('entry-form-error').textContent = '';
  updateTypedFields();
  $('entry-editor').classList.remove('hidden');
  $('entry-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeEntryEditor() {
  state.editingEntryId = null;
  $('entry-editor').classList.add('hidden');
}

function updateTypedFields() {
  const type = $('e-type').value;
  ['action','issue','risk','decision'].forEach(x => $(`${x}-fields`).classList.toggle('hidden', type !== x));
  $('status-field').classList.toggle('hidden', !trackedTypes.has(type));
}

async function saveEntry() {
  if (state.readOnly) return;
  $('entry-form-error').textContent = '';
  const projectId = $('e-project').value;
  const eventDate = $('e-date').value;
  const type = $('e-type').value;
  const title = $('e-title').value.trim();
  if (!projectId || !projectById(projectId)) { $('entry-form-error').textContent = 'Choose a project.'; return; }
  if (!eventDate) { $('entry-form-error').textContent = 'Date is required.'; return; }
  if (!title) { $('entry-form-error').textContent = 'Title is required.'; return; }

  const existing = state.editingEntryId ? store.getById('entries', state.editingEntryId) : null;
  const ownerName = type === 'action' ? $('e-owner').value.trim() : type === 'issue' ? $('e-issue-owner').value.trim() : type === 'risk' ? $('e-risk-owner').value.trim() : '';
  try {
    setSync('Saving', 'busy');
    const peopleNames = normalizeList($('e-people').value);
    if (ownerName && !peopleNames.some(x => x.toLowerCase() === ownerName.toLowerCase())) peopleNames.push(ownerName);
    const peopleIds = await store.ensurePeople(peopleNames);
    const ownerPersonId = ownerName ? store.people().find(p => p.name.toLowerCase() === ownerName.toLowerCase())?.id || null : null;
    const tagIds = await store.ensureTags(normalizeList($('e-tags').value));
    const payload = {
      ...(existing || {}),
      id: existing?.id || uuid(),
      projectId,
      eventDate,
      type,
      status: trackedTypes.has(type) ? $('e-status').value : '',
      title,
      body: $('e-body').value.trim(),
      ownerPersonId,
      peopleIds,
      tagIds,
      dueDate: type === 'action' ? $('e-due').value : '',
      priority: type === 'action' ? $('e-priority').value : '',
      severity: type === 'issue' ? $('e-severity').value : '',
      rootCause: type === 'issue' ? $('e-root-cause').value.trim() : '',
      resolution: type === 'issue' ? $('e-resolution').value.trim() : '',
      likelihood: type === 'risk' ? $('e-likelihood').value : '',
      impact: type === 'risk' ? $('e-impact').value : '',
      reviewDate: type === 'risk' ? $('e-review-date').value : '',
      mitigation: type === 'risk' ? $('e-mitigation').value.trim() : '',
      decision: type === 'decision' ? $('e-decision').value.trim() : '',
      archivedAt: existing?.archivedAt || ''
    };
    await store.saveEntity('entries', payload, existing ? 'update' : 'add');
    setSync('Saved', 'good');
    banner('Entry saved to the private GitHub data repository.', 'good');
    closeEntryEditor();
    renderAll();
  } catch (err) {
    handleWriteError(err, { kind: 'entry', editingId: state.editingEntryId, title, projectId, eventDate, type, body: $('e-body').value });
  }
}

function renderProjects() {
  const projects = store.projects({ includeArchived: true });
  $('projects-grid').innerHTML = projects.length ? projects.map(p => {
    const m = dashboardMetrics(activeProjectEntries(p.id));
    return `<article class="project-card ${p.status === 'archived' ? 'archived' : ''}"><div class="project-card-top"><div><div class="project-code">${escapeHtml(p.code || 'No code')}</div><h3>${escapeHtml(p.name)}</h3><div class="project-org">${escapeHtml(p.organisation || 'Personal / not specified')}</div></div><span class="mini-status ${p.status}">${escapeHtml(p.status)}</span></div><p class="project-desc">${escapeHtml(p.description || p.objective || 'No description recorded.')}</p><div class="project-stats"><div class="project-stat"><strong>${m.openActions.length}</strong><span>Actions</span></div><div class="project-stat"><strong>${m.overdue.length}</strong><span>Overdue</span></div><div class="project-stat"><strong>${m.openIssues.length}</strong><span>Issues</span></div><div class="project-stat"><strong>${m.highRisks.length}</strong><span>High risk</span></div></div><div class="project-actions"><button class="btn primary" data-action="open-project" data-id="${escapeHtml(p.id)}">Open</button><button class="btn secondary" data-action="edit-project" data-id="${escapeHtml(p.id)}">Edit</button>${p.status !== 'archived' ? `<button class="btn secondary" data-action="archive-project" data-id="${escapeHtml(p.id)}">Archive</button>` : ''}</div></article>`;
  }).join('') : `<div class="empty-state"><strong>No projects yet</strong>Create a project and start building your work history.</div>`;
}

function openProjectDialog(id = null) {
  if (state.readOnly) { banner('The app is in offline read-only mode. Reconnect to GitHub before editing.', 'error'); return; }
  state.editingProjectId = id;
  const p = id ? store.getById('projects', id) : null;
  $('project-dialog-title').textContent = p ? 'Edit project' : 'New project';
  $('p-name').value = p?.name || '';
  $('p-code').value = p?.code || '';
  $('p-organisation').value = p?.organisation || '';
  $('p-status').value = p?.status || 'active';
  $('p-start').value = p?.startDate || todayIso();
  $('p-end').value = p?.endDate || '';
  $('p-description').value = p?.description || '';
  $('p-objective').value = p?.objective || '';
  $('project-form-error').textContent = '';
  $('project-dialog').showModal();
}

async function saveProject(event) {
  event.preventDefault();
  $('project-form-error').textContent = '';
  const name = $('p-name').value.trim();
  if (!name) { $('project-form-error').textContent = 'Project name is required.'; return; }
  const existing = state.editingProjectId ? store.getById('projects', state.editingProjectId) : null;
  const payload = {
    ...(existing || {}),
    id: existing?.id || uuid(),
    name,
    code: $('p-code').value.trim(),
    organisation: $('p-organisation').value.trim(),
    status: $('p-status').value,
    startDate: $('p-start').value,
    endDate: $('p-end').value,
    description: $('p-description').value.trim(),
    objective: $('p-objective').value.trim()
  };
  try {
    setSync('Saving', 'busy');
    await store.saveEntity('projects', payload, existing ? 'update' : 'create');
    $('project-dialog').close();
    state.editingProjectId = null;
    setSync('Saved', 'good');
    renderAll();
  } catch (err) {
    handleWriteError(err, { kind: 'project', ...payload });
  }
}

async function archiveProject(id) {
  const p = store.getById('projects', id);
  if (!p || state.readOnly) return;
  if (!confirm(`Archive "${p.name}"? Its journal history will remain available in the repository and exports.`)) return;
  try {
    setSync('Saving', 'busy');
    await store.saveEntity('projects', { ...p, status: 'archived' }, 'archive');
    if (state.scopeProjectId === id) state.scopeProjectId = 'all';
    setSync('Saved', 'good');
    renderAll();
  } catch (err) { handleWriteError(err, { kind: 'project', id }); }
}

function renderDataView() {
  const allProjects = store.projects({ includeArchived: true });
  const allEntries = store.entries({ includeArchived: true });
  const repoUrl = store.owner ? `https://github.com/${encodeURIComponent(store.owner)}/${encodeURIComponent(store.repo)}` : '#';
  $('data-view').innerHTML = `
    <div class="section-head"><div><div class="eyebrow">Storage and portability</div><h2>Data & Sync</h2></div><button class="btn primary" data-action="sync">Sync now</button></div>
    <div class="data-grid">
      <section class="data-card"><div class="eyebrow">Source of truth</div><h3>Private GitHub repository</h3><div class="repo-path">${escapeHtml(store.owner || '?')}/${escapeHtml(store.repo)}</div><p>Each project, person, tag and journal entry is stored as a small JSON record. Git history provides record-level version history without repeatedly committing one large binary database.</p><a class="btn secondary" href="${repoUrl}" target="_blank" rel="noopener">Open repository</a></section>
      <section class="data-card"><div class="eyebrow">Current dataset</div><h3>${allProjects.length} projects · ${allEntries.length} records</h3><p>${store.people().length} people and ${store.tags().length} reusable tags are linked across project entries. Local IndexedDB is only a browser cache; GitHub remains the durable copy.</p><div class="data-pill">Last sync: ${escapeHtml(store.lastSyncAt ? new Date(store.lastSyncAt).toLocaleString() : 'not synced')}</div></section>
      <section class="data-card"><div class="eyebrow">Portable backup</div><h3>Export your complete journal</h3><p>JSON is the lossless full backup. CSV provides a flat analytics-friendly export of all journal entries for Excel, Power BI, Python or migration into another system.</p><div class="data-actions"><button class="btn secondary" data-action="export-json">Export JSON</button><button class="btn secondary" data-action="export-csv">Export CSV</button></div></section>
    </div>
    <section class="panel"><div class="eyebrow">Sync model</div><h3>Git-native records + IndexedDB cache</h3><p class="entry-body">GitHub is the durable, versioned source of truth. The browser keeps an IndexedDB cache for fast reads. Each record is a small JSON file, and updates include the current Git blob SHA so stale same-record writes are rejected rather than silently overwritten.</p><div class="data-actions"><button class="btn secondary" data-action="clear-cache">Clear local cache</button></div></section>
    <div class="governance-box"><strong>Work-data boundary:</strong> a private personal GitHub repository is still personal external storage. Before entering employer or client information, confirm that their security, confidentiality, intellectual-property and records-retention policies allow this. Keep passwords, API keys, regulated personal data, source-code secrets and restricted client information out of the journal.</div>
  `;
}

function renderAll() {
  renderProjectScope();
  renderPeopleDatalist();
  if (state.view === 'dashboard') renderDashboard();
  if (state.view === 'journal') renderJournal();
  if (state.view === 'projects') renderProjects();
  if (state.view === 'data') renderDataView();
}

function handleWriteError(err, draft = null) {
  setSync('Save failed', 'bad');
  if (draft) sessionStorage.setItem('pj-last-unsaved-draft', JSON.stringify({ savedAt: new Date().toISOString(), draft }));
  if (err instanceof ConflictError) {
    banner('A newer version of this record exists in GitHub. Your attempted change was not overwritten; an unsaved draft was kept in this browser session. Sync, review the latest record, then apply your change again.', 'error');
  } else {
    banner(err.message || 'The save failed. Your unsaved draft was kept in this browser session.', 'error');
  }
}

async function syncNow() {
  if (!state.connected) return;
  try {
    setSync('Syncing', 'busy');
    await store.sync();
    state.readOnly = false;
    setSync('Up to date', 'good');
    banner('Synced with the private GitHub repository.', 'good');
    renderAll();
  } catch (err) {
    setSync('Sync failed', 'bad');
    banner(err.message || 'Could not sync with GitHub.', 'error');
  }
}

async function connectUsingSavedAuth() {
  const cached = await store.loadCache();
  try {
    setSync('Connecting', 'busy');
    const info = await store.connect();
    await store.seedDemoProjectIfEmpty();
    state.connected = true;
    state.readOnly = false;
    $('sidebar-user').innerHTML = `<strong>@${escapeHtml(info.user.login)}</strong><span>${escapeHtml(store.repo)}</span>`;
    setSync('Up to date', 'good');
    showApp();
    renderAll();
  } catch (err) {
    if (cached && !(err instanceof GitHubError && [401,403,404].includes(err.status))) {
      state.connected = true;
      state.readOnly = true;
      $('sidebar-user').innerHTML = `<strong>Offline cache</strong><span>${escapeHtml(store.repo)}</span>`;
      setSync('Offline cache', 'bad');
      showApp();
      banner('GitHub is currently unreachable. Cached data is available read-only; edits are disabled until sync succeeds.', 'error');
      renderAll();
      return;
    }
    signOut();
    showLogin();
    $('login-error').textContent = err.message || 'Could not connect to GitHub.';
  }
}


async function openCachedOffline() {
  const cached = await store.loadCache();
  if (!cached) {
    $('login-error').textContent = 'No cached journal data exists on this device yet. Connect to GitHub at least once first.';
    return;
  }
  state.connected = true;
  state.readOnly = true;
  $('sidebar-user').innerHTML = `<strong>Offline cache</strong><span>${escapeHtml(store.repo)}</span>`;
  setSync('Offline cache', 'bad');
  showApp();
  banner('Showing the last synchronized local cache. Editing is disabled until you reconnect to GitHub.', 'error');
  renderAll();
}

async function deviceSignInFlow() {
  $('login-error').textContent = '';
  if (!isDeviceAuthConfigured()) {
    $('login-error').textContent = 'GitHub sign-in is not configured yet.';
    return;
  }
  try {
    $('github-device-btn').disabled = true;
    $('device-auth-panel').classList.remove('hidden');
    $('device-status').textContent = 'Requesting GitHub device code...';
    const device = await requestDeviceCode();
    $('device-code').textContent = device.user_code;
    $('device-link').href = device.verification_uri || 'https://github.com/login/device';
    $('device-status').textContent = 'Enter this code on GitHub, then return here while the app connects.';
    window.open($('device-link').href, '_blank', 'noopener');
    const token = await pollForToken(device.device_code, {
      interval: device.interval,
      expiresIn: device.expires_in,
      onStatus: text => { $('device-status').textContent = text; }
    });
    setAccessToken(token.access_token);
    await connectUsingSavedAuth();
  } catch (err) {
    signOut();
    showLogin();
    $('login-error').textContent = err.message || 'GitHub sign-in failed.';
  } finally {
    $('github-device-btn').disabled = false;
  }
}

async function doSignOut() {
  signOut();
  state.connected = false;
  state.readOnly = false;
  state.scopeProjectId = 'all';
  showLogin();
}

async function deleteEntry(id) {
  if (state.readOnly) return;
  const e = store.getById('entries', id);
  if (!e) return;
  if (!confirm(`Delete "${e.title}"? Git history may allow recovery, but it will disappear from the active journal.`)) return;
  try {
    setSync('Deleting', 'busy');
    await store.deleteEntity('entries', id);
    setSync('Saved', 'good');
    renderAll();
  } catch (err) { handleWriteError(err, { kind: 'delete-entry', id }); }
}

async function toggleEntry(id) {
  if (state.readOnly) return;
  const e = store.getById('entries', id);
  if (!e || !trackedTypes.has(e.type)) return;
  try {
    setSync('Saving', 'busy');
    await store.saveEntity('entries', { ...e, status: e.status === 'closed' ? 'open' : 'closed' }, e.status === 'closed' ? 'reopen' : 'close');
    setSync('Saved', 'good');
    renderAll();
  } catch (err) { handleWriteError(err, { kind: 'toggle-entry', id }); }
}

function wireEvents() {
  $('github-device-btn').addEventListener('click', deviceSignInFlow);
  $('offline-btn').addEventListener('click', openCachedOffline);
  $('sign-out-btn').addEventListener('click', doSignOut);
  $('sync-btn').addEventListener('click', syncNow);
  $('project-scope').addEventListener('change', e => { state.scopeProjectId = e.target.value; renderAll(); });
  $('new-entry-btn').addEventListener('click', () => openEntryEditor());
  $('close-entry-editor').addEventListener('click', closeEntryEditor);
  $('cancel-entry-btn').addEventListener('click', closeEntryEditor);
  $('save-entry-btn').addEventListener('click', saveEntry);
  $('e-type').addEventListener('change', updateTypedFields);
  $('new-project-btn').addEventListener('click', () => openProjectDialog());
  $('project-form').addEventListener('submit', saveProject);
  $('close-project-dialog').addEventListener('click', () => $('project-dialog').close());
  $('cancel-project').addEventListener('click', () => $('project-dialog').close());
  ['filter-search','filter-type','filter-status','filter-from','filter-to'].forEach(id => $(id).addEventListener(id === 'filter-search' ? 'input' : 'change', renderJournal));
  document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));

  document.addEventListener('click', async event => {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (action === 'new-entry') { setView('journal'); openEntryEditor(); }
    if (action === 'edit-entry') { setView('journal'); openEntryEditor(id); }
    if (action === 'toggle-entry') await toggleEntry(id);
    if (action === 'delete-entry') await deleteEntry(id);
    if (action === 'open-project') { state.scopeProjectId = id; renderProjectScope(); setView('dashboard'); }
    if (action === 'edit-project') openProjectDialog(id);
    if (action === 'archive-project') await archiveProject(id);
    if (action === 'sync') await syncNow();
    if (action === 'export-json') exportJson(store);
    if (action === 'export-csv') {
      try { exportCsv(store); } catch (err) { banner(`CSV export failed: ${err.message}`, 'error'); }
    }
    if (action === 'clear-cache') {
      if (confirm('Clear the browser cache? The private GitHub repository will not be changed.')) {
        await clearCache();
        banner('Local cache cleared. Sync to download the GitHub records again.', 'good');
      }
    }
  });
}

async function bootstrap() {
  wireEvents();
  $('device-auth-unavailable').classList.toggle('hidden', isDeviceAuthConfigured());
  $('github-device-btn').disabled = !isDeviceAuthConfigured();
  const configErrors = validateConfig();
  if (configErrors.length) {
    $('fatal').textContent = `Configuration required: ${configErrors.join(' ')}`;
    $('fatal').classList.remove('hidden');
    return;
  }
  if (hasSavedAuth()) await connectUsingSavedAuth();
  else showLogin();
}

bootstrap().catch(err => {
  $('fatal').textContent = `Project Journal could not start: ${err.message}`;
  $('fatal').classList.remove('hidden');
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
