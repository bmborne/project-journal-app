import test from 'node:test';
import assert from 'node:assert/strict';

function mockStorage(){ const m=new Map(); return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}; }
globalThis.sessionStorage=mockStorage(); globalThis.localStorage=mockStorage();
const auth=await import('../src/auth.js');
const gh=await import('../src/github.js');

auth.setAccessToken('github_pat_'+'x'.repeat(40));

test('putJson sends content write with branch and current SHA', async () => {
  let call;
  globalThis.fetch=async (url,opts)=>{ call={url,opts}; return new Response(JSON.stringify({content:{sha:'newsha'}}),{status:200,headers:{'content-type':'application/json'}}); };
  await gh.putJson('alice','project-journal-data','main','data/projects/a.json',{hello:'world'},'oldsha','update');
  const body=JSON.parse(call.opts.body);
  assert.equal(call.opts.method,'PUT'); assert.equal(body.sha,'oldsha'); assert.equal(body.branch,'main');
  assert.match(call.opts.headers.Authorization,/^Bearer github_pat_/); assert.equal(call.opts.headers['X-GitHub-Api-Version'],'2026-03-10');
});

test('409 is surfaced as ConflictError', async () => {
  globalThis.fetch=async ()=>new Response(JSON.stringify({message:'Conflict'}),{status:409});
  await assert.rejects(()=>gh.putJson('a','b','main','x',{},'sha'),gh.ConflictError);
});

test('422 stays validation error rather than being mislabeled as concurrency conflict', async () => {
  globalThis.fetch=async ()=>new Response(JSON.stringify({message:'Validation Failed'}),{status:422});
  await assert.rejects(()=>gh.putJson('a','b','main','x',{},null),err=>err instanceof gh.GitHubError && !(err instanceof gh.ConflictError) && err.status===422);
});

test('delete sends the exact SHA', async () => {
  let body; globalThis.fetch=async (url,opts)=>{ body=JSON.parse(opts.body); return new Response(null,{status:204}); };
  await gh.deletePath('a','b','main','data/entries/x.json','sha-delete','delete');
  assert.equal(body.sha,'sha-delete'); assert.equal(body.branch,'main');
});
