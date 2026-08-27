import { config } from './config.js';
import * as githubDefault from './github.js';
import * as cacheDefault from './cache.js';
import { nowIso, uuid } from './utils.js';
import { validateEntity } from './validation.js';

const UUID_RE = /^[0-9a-fA-F-]{36}$/;
const safeId = id => {
  const value = String(id || '');
  if (!UUID_RE.test(value)) throw new githubDefault.GitHubError(`Invalid record id: ${value}`, 422);
  return value;
};
const pathFor = (entity, id) => `data/${entity}/${safeId(id)}.json`;
const entityForPath = path => path.split('/')[1] || 'unknown';

export class JournalStore {
  constructor({ github = githubDefault, cache = cacheDefault } = {}) {
    this.github = github;
    this.cache = cache;
    this.owner = null;
    this.repo = config.dataRepoName;
    this.branch = 'main';
    this.records = new Map();
    this.user = null;
    this.lastSyncAt = null;
    this.offline = false;
  }

  async loadCache() {
    const rows = await this.cache.listCache();
    this.records = new Map(rows.map(r => [r.path, r]));
    return rows.length;
  }

  async connect() {
    this.user = await this.github.getCurrentUser();
    this.owner = this.user.login;
    let repoInfo;
    try { repoInfo = await this.github.getRepo(this.owner, this.repo); }
    catch (err) {
      if (err instanceof this.github.GitHubError && err.status === 404) throw new this.github.GitHubError(`Private repository "${this.repo}" was not found or this token does not have access to it.`, 404);
      throw err;
    }
    this.branch = repoInfo.default_branch || 'main';
    await this.sync();
    return { user: this.user, repo: repoInfo };
  }

  async sync() {
    const tree = await this.github.getDataTree(this.owner, this.repo, this.branch);
    const files = tree.filter(x => x.type === 'blob' && x.path.startsWith('data/') && x.path.endsWith('.json'));
    if (!files.some(x => x.path === 'data/meta.json')) {
      await this.initializeRepository();
      return this.sync();
    }
    const records = [];
    const batchSize = 8;
    for (let i = 0; i < files.length; i += batchSize) {
      const values = await Promise.all(files.slice(i, i + batchSize).map(async file => {
        const cached = this.records.get(file.path);
        if (cached?.sha === file.sha) return cached;
        const text = await this.github.getBlob(this.owner, this.repo, file.sha);
        let data;
        try { data = JSON.parse(text); }
        catch { throw new this.github.GitHubError(`Invalid JSON in ${file.path}. Restore a valid version from Git history.`, 422); }
        const entity = entityForPath(file.path);
        if (['projects','entries','people','tags'].includes(entity)) {
          const fileId = file.path.split('/').pop().replace(/\.json$/, '');
          if (!data.id || data.id !== fileId || !UUID_RE.test(data.id)) throw new this.github.GitHubError(`Record identity mismatch in ${file.path}. Restore a valid version from Git history.`, 422);
        }
        return { path: file.path, sha: file.sha, entity, data };
      }));
      records.push(...values);
    }
    const metaRecord = records.find(r => r.path === 'data/meta.json');
    const remoteSchema = Number(metaRecord?.data?.schemaVersion || 0);
    if (remoteSchema !== config.schemaVersion) {
      throw new this.github.GitHubError(`Unsupported data schema version ${remoteSchema || 'unknown'}; this app expects version ${config.schemaVersion}. Review the migration guide before continuing.`, 422);
    }
    this.records = new Map(records.map(r => [r.path, r]));
    await this.cache.replaceCache(records);
    this.lastSyncAt = nowIso();
    this.offline = false;
    return records;
  }

  async initializeRepository() {
    const meta = { schemaVersion: config.schemaVersion, app: config.appName, storage: 'github-json-indexeddb-v3', createdAt: nowIso(), updatedAt: nowIso() };
    await this.github.putJson(this.owner, this.repo, this.branch, 'data/meta.json', meta, null, 'Project Journal: initialize data store');
  }

  all(entity) { return [...this.records.values()].filter(r => r.entity === entity).map(r => ({ ...r.data, __path: r.path, __sha: r.sha })); }
  projects({ includeArchived = false } = {}) { return this.all('projects').filter(p => includeArchived || p.status !== 'archived').sort((a,b) => a.name.localeCompare(b.name)); }
  entries({ includeArchived = false } = {}) { return this.all('entries').filter(e => includeArchived || !e.archivedAt).sort((a,b) => (b.eventDate || '').localeCompare(a.eventDate || '') || (b.updatedAt || '').localeCompare(a.updatedAt || '')); }
  people() { return this.all('people').sort((a,b) => a.name.localeCompare(b.name)); }
  tags() { return this.all('tags').sort((a,b) => a.name.localeCompare(b.name)); }
  getById(entity, id) { return this.records.get(pathFor(entity, id))?.data || null; }

  async saveEntity(entity, data, commitLabel = 'update') {
    if (!this.owner) throw new Error('The data repository is not connected.');
    const id = data.id || uuid();
    const path = pathFor(entity, id);
    const existing = this.records.get(path);
    const timestamp = nowIso();
    const payload = { ...data, id, createdAt: data.createdAt || timestamp, updatedAt: timestamp };
    validateEntity(entity, payload, this);
    const result = await this.github.putJson(this.owner, this.repo, this.branch, path, payload, existing?.sha || null, `Project Journal: ${commitLabel} ${{projects:'project',entries:'entry',people:'person',tags:'tag'}[entity] || entity} ${payload.name || payload.title || id}`);
    const record = { path, sha: result.content.sha, entity, data: payload };
    this.records.set(path, record);
    await this.cache.putCache(record);
    return payload;
  }

  referencesTo(entity, id) {
    const entries = this.entries({ includeArchived: true });
    if (entity === 'projects') return entries.filter(e => e.projectId === id);
    if (entity === 'people') return entries.filter(e => e.ownerPersonId === id || (e.peopleIds || []).includes(id));
    if (entity === 'tags') return entries.filter(e => (e.tagIds || []).includes(id));
    return [];
  }

  async deleteEntity(entity, id) {
    const path = pathFor(entity, id);
    const existing = this.records.get(path);
    if (!existing) return false;
    if (entity !== 'entries') {
      const refs = this.referencesTo(entity, id);
      if (refs.length) {
        const label = { projects: 'project', people: 'person', tags: 'tag' }[entity] || entity;
        throw new Error(`Cannot delete ${label} because ${refs.length} journal entr${refs.length === 1 ? 'y references' : 'ies reference'} it.`);
      }
    }
    await this.github.deletePath(this.owner, this.repo, this.branch, path, existing.sha, `Project Journal: delete ${entity.slice(0,-1)} ${id}`);
    this.records.delete(path);
    await this.cache.deleteCache(path);
    return true;
  }

  async ensurePeople(names) {
    const output = [];
    for (const raw of names) {
      const name = raw.trim(); if (!name) continue;
      let person = this.people().find(p => p.name.toLowerCase() === name.toLowerCase());
      if (!person) person = await this.saveEntity('people', { id: uuid(), name }, 'add');
      output.push(person.id);
    }
    return [...new Set(output)];
  }

  async ensureTags(names) {
    const output = [];
    for (const raw of names) {
      const name = raw.trim(); if (!name) continue;
      let tag = this.tags().find(t => t.name.toLowerCase() === name.toLowerCase());
      if (!tag) tag = await this.saveEntity('tags', { id: uuid(), name }, 'add');
      output.push(tag.id);
    }
    return [...new Set(output)];
  }

  async seedDemoProjectIfEmpty() {
    if (this.projects({ includeArchived: true }).length) return null;
    return this.saveEntity('projects', { id: uuid(), name:'My first project', code:'PRJ-001', organisation:'', status:'active', startDate:new Date().toISOString().slice(0,10), endDate:'', description:'Rename or edit this project to get started.', objective:'' }, 'create');
  }
}
