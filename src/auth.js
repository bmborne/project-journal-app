const SESSION_KEY = 'pj-github-pat-session-v3';
let current = null;

export function setAccessToken(token) {
  const clean = String(token || '').trim();
  if (!/^(github_pat_|ghu_|gho_)/.test(clean)) {
    throw new Error('GitHub sign-in did not return a usable access token. Sign in with GitHub again.');
  }
  const payload = JSON.stringify({ token: clean, createdAt: new Date().toISOString() });
  sessionStorage.setItem(SESSION_KEY, payload);
  current = { token: clean };
}

function load() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.token) { current = { token: parsed.token }; return current; }
  } catch { /* ignore corrupt session state */ }
  return null;
}

export async function getAccessToken() {
  return (current || load())?.token || null;
}

export function hasSavedAuth() { return Boolean(current || load()); }

export function signOut() {
  current = null;
  sessionStorage.removeItem(SESSION_KEY);
}
