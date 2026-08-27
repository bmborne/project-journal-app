import test from 'node:test';
import assert from 'node:assert/strict';
import { JournalStore } from '../src/store.js';
import { GitHubError, ConflictError } from '../src/github.js';

class MemoryCache {
  constructor(){ this.rows = new Map(); }
  async listCache(){ return [...this.rows.values()]; }
  async replaceCache(rows){ this.rows = new Map(rows.map(r => [r.path, structuredClone(r)])); }
  async putCache(r){ this.rows.set(r.path, structuredClone(r)); }
  async deleteCache(p){ this.rows.delete(p); }
}

class FakeGitHub {
  constructor(){ this.GitHubError=GitHubError; this.ConflictError=ConflictError; this.files=new Map(); this.counter=1; this.blobReads=0; this.failConflict=false; }
  async getCurrentUser(){ return { login:'alice' }; }
  async getRepo(owner,repo){ return { name:repo, private:true, default_branch:'main' }; }
  sha(){ return `sha${this.counter++}`; }
  async getDataTree(){ return [...this.files.entries()].map(([path,v]) => ({ path, type:'blob', sha:v.sha })); }
  async getBlob(owner,repo,sha){ this.blobReads++; for (const v of this.files.values()) if (v.sha===sha) return JSON.stringify(v.data); throw new Error('blob missing'); }
  async putJson(owner,repo,branch,path,data,sha){
    if (this.failConflict) { this.failConflict=false; throw new ConflictError(); }
    const old=this.files.get(path);
    if (old && sha !== old.sha) throw new ConflictError();
    if (!old && sha) throw new ConflictError();
    const next={sha:this.sha(),data:structuredClone(data)}; this.files.set(path,next); return {content:{sha:next.sha}};
  }
  async deletePath(owner,repo,branch,path,sha){ const old=this.files.get(path); if (!old || old.sha!==sha) throw new ConflictError(); this.files.delete(path); return {}; }
}

async function connectedStore(){
  const github=new FakeGitHub(); const cache=new MemoryCache(); const store=new JournalStore({github,cache});
  await store.connect();
  return {store,github,cache};
}

const projectPayload = (id) => ({id,name:'ERP Migration',code:'ERP-01',organisation:'Example Co',status:'active',startDate:'2026-08-01',endDate:'',description:'Migration',objective:'Go live'});
const entryPayload = (projectId, type='action') => ({projectId,type,status:'open',eventDate:'2026-08-27',title:`Test ${type}`,body:'Body'});

test('connect initializes an empty repository and syncs meta', async () => {
  const {store,github}=await connectedStore();
  assert.equal(store.owner,'alice'); assert.ok(github.files.has('data/meta.json'));
  assert.equal(store.projects().length,0);
});

test('connect uses a GitHub App installation when the named repo is not visible at owner/login', async () => {
  class AppGitHub extends FakeGitHub {
    async getRepo(){ throw new GitHubError('Not Found', 404); }
    async findInstalledRepo(name){ return { name, private:true, default_branch:'main', owner:{ login:'bmborne' } }; }
  }
  const github=new AppGitHub();
  const store=new JournalStore({github, cache:new MemoryCache()});
  await store.connect();
  assert.equal(store.owner,'bmborne');
  assert.ok(github.files.has('data/meta.json'));
});

test('project CRUD works and preserves createdAt', async () => {
  const {store}=await connectedStore();
  const id=crypto.randomUUID();
  const created=await store.saveEntity('projects', projectPayload(id), 'create');
  assert.equal(store.getById('projects',id).name,'ERP Migration');
  const createdAt=created.createdAt;
  await store.saveEntity('projects',{...created,name:'ERP Programme'},'update');
  assert.equal(store.getById('projects',id).name,'ERP Programme');
  assert.equal(store.getById('projects',id).createdAt,createdAt);
  await store.deleteEntity('projects',id);
  assert.equal(store.getById('projects',id),null);
});

test('all supported journal entry types can be created, read, updated and deleted', async () => {
  const {store}=await connectedStore();
  const p=await store.saveEntity('projects', projectPayload(crypto.randomUUID()), 'create');
  for (const type of ['action','issue','risk','decision','meeting','note']) {
    const extra = type==='action' ? {dueDate:'2026-09-01',priority:'high'} : type==='risk' ? {likelihood:'likely',impact:'high',reviewDate:'2026-09-05'} : {};
    const row=await store.saveEntity('entries',{...entryPayload(p.id,type),...extra},'add');
    assert.equal(store.getById('entries',row.id).type,type);
    await store.saveEntity('entries',{...row,title:`Updated ${type}`},'update');
    assert.equal(store.getById('entries',row.id).title,`Updated ${type}`);
    assert.equal(await store.deleteEntity('entries',row.id),true);
    assert.equal(store.getById('entries',row.id),null);
  }
});

test('people and tags deduplicate case-insensitively', async () => {
  const {store}=await connectedStore();
  const people=await store.ensurePeople(['Sarah',' sarah ','Bob']);
  const tags=await store.ensureTags(['Migration','migration','Critical']);
  assert.equal(people.length,2); assert.equal(store.people().length,2);
  assert.equal(tags.length,2); assert.equal(store.tags().length,2);
});

test('referential integrity blocks deletion of referenced project/person/tag', async () => {
  const {store}=await connectedStore();
  const p=await store.saveEntity('projects',projectPayload(crypto.randomUUID()),'create');
  const [personId]=await store.ensurePeople(['Sarah']); const [tagId]=await store.ensureTags(['Migration']);
  const e=await store.saveEntity('entries',{...entryPayload(p.id),ownerPersonId:personId,peopleIds:[personId],tagIds:[tagId]},'add');
  await assert.rejects(()=>store.deleteEntity('projects',p.id),/Cannot delete project/);
  await assert.rejects(()=>store.deleteEntity('people',personId),/Cannot delete person/);
  await assert.rejects(()=>store.deleteEntity('tags',tagId),/Cannot delete tag/);
  await store.deleteEntity('entries',e.id);
  assert.equal(await store.deleteEntity('projects',p.id),true);
});

test('validation rejects orphan entries and malformed dates/types', async () => {
  const {store}=await connectedStore();
  await assert.rejects(()=>store.saveEntity('entries',{...entryPayload(crypto.randomUUID())}),/Entry project does not exist/);
  const p=await store.saveEntity('projects',projectPayload(crypto.randomUUID()),'create');
  await assert.rejects(()=>store.saveEntity('entries',{...entryPayload(p.id),type:'unknown'}),/Invalid entry type/);
  await assert.rejects(()=>store.saveEntity('entries',{...entryPayload(p.id),eventDate:'27-08-2026'}),/YYYY-MM-DD/);
});

test('conflict does not mutate local records or cache', async () => {
  const {store,github,cache}=await connectedStore();
  const p=await store.saveEntity('projects',projectPayload(crypto.randomUUID()),'create');
  const before=structuredClone(store.getById('projects',p.id));
  const cachedBefore=structuredClone(cache.rows.get(`data/projects/${p.id}.json`));
  github.failConflict=true;
  await assert.rejects(()=>store.saveEntity('projects',{...p,name:'Stale edit'},'update'),ConflictError);
  assert.deepEqual(store.getById('projects',p.id),before);
  assert.deepEqual(cache.rows.get(`data/projects/${p.id}.json`),cachedBefore);
});

test('incremental sync reuses cached records with unchanged SHA', async () => {
  const {store,github}=await connectedStore();
  const p=await store.saveEntity('projects',projectPayload(crypto.randomUUID()),'create');
  await store.sync(); const reads=github.blobReads;
  await store.sync(); assert.equal(github.blobReads,reads);
  const path=`data/projects/${p.id}.json`; const old=github.files.get(path);
  github.files.set(path,{sha:github.sha(),data:{...old.data,name:'Remote update'}});
  await store.sync(); assert.equal(github.blobReads,reads+1); assert.equal(store.getById('projects',p.id).name,'Remote update');
});

test('sync rejects record/file identity mismatch', async () => {
  const {store,github}=await connectedStore();
  const fileId=crypto.randomUUID(); github.files.set(`data/projects/${fileId}.json`,{sha:github.sha(),data:projectPayload(crypto.randomUUID())});
  await assert.rejects(()=>store.sync(),/Record identity mismatch/);
});

test('schema mismatch fails closed before replacing the local cache', async () => {
  const {store,github,cache}=await connectedStore();
  const oldCacheSize=cache.rows.size;
  const meta=github.files.get('data/meta.json');
  github.files.set('data/meta.json',{sha:github.sha(),data:{...meta.data,schemaVersion:999}});
  await assert.rejects(()=>store.sync(),/Unsupported data schema version 999/);
  assert.equal(cache.rows.size,oldCacheSize);
});
