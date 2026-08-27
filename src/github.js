import { config } from './config.js';
import { getAccessToken } from './auth.js';

export class GitHubError extends Error {
  constructor(message, status, details = null) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
    this.details = details;
  }
}

export class ConflictError extends GitHubError {
  constructor(message = 'This record changed in GitHub after you loaded it. Sync and retry.') {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

async function api(path, options = {}) {
  const token = await getAccessToken();
  if (!token) throw new GitHubError('You are not signed in to GitHub.', 401);
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': config.apiVersion,
    ...(options.headers || {})
  };
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const res = await fetch(`https://api.github.com${path}`, { ...options, headers });
  if (res.status === 204) return null;
  const text = await res.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!res.ok) {
    if (res.status === 409) throw new ConflictError(payload?.message || 'GitHub rejected the update because the record changed.');
    if (res.status === 422) throw new GitHubError(payload?.message || 'GitHub rejected the request as invalid.', 422, payload);
    throw new GitHubError(payload?.message || `GitHub API request failed (${res.status}).`, res.status, payload);
  }
  return payload;
}

export const getCurrentUser = () => api('/user');
export const getRepo = (owner, repo) => api(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);

export async function findInstalledRepo(repoName) {
  const payload = await api('/user/installations');
  for (const installation of payload?.installations || []) {
    const repos = await api(`/user/installations/${installation.id}/repositories?per_page=100`);
    const match = (repos?.repositories || []).find(row => row.name === repoName);
    if (match) return match;
  }
  return null;
}

export async function getDataTree(owner, repo, branch) {
  const tree = await api(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  if (tree.truncated) throw new GitHubError('The data repository is too large to load safely with the current sync method.', 413);
  return tree.tree || [];
}

export async function getBlob(owner, repo, sha) {
  const blob = await api(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${sha}`);
  if (blob.encoding !== 'base64') throw new GitHubError('Unexpected GitHub blob encoding.', 500);
  return decodeBase64Utf8(blob.content.replaceAll('\n', ''));
}

function encodeBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const size = 0x8000;
  for (let i = 0; i < bytes.length; i += size) binary += String.fromCharCode(...bytes.subarray(i, i + size));
  return btoa(binary);
}

function decodeBase64Utf8(value) {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export async function putJson(owner, repo, branch, path, data, sha = null, message = null) {
  const body = {
    message: message || `Project Journal: update ${path}`,
    content: encodeBase64Utf8(`${JSON.stringify(data, null, 2)}\n`),
    branch
  };
  if (sha) body.sha = sha;
  return api(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'PUT',
    body: JSON.stringify(body)
  });
}

export async function deletePath(owner, repo, branch, path, sha, message = null) {
  return api(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'DELETE',
    body: JSON.stringify({ message: message || `Project Journal: delete ${path}`, sha, branch })
  });
}
