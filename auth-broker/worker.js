const json = (payload, status = 200, origin = '*') => new Response(JSON.stringify(payload), {
  status,
  headers: {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  }
});

const allowOrigin = (request, env) => {
  const origin = request.headers.get('Origin') || '';
  return env.ALLOWED_ORIGIN && origin === env.ALLOWED_ORIGIN ? origin : env.ALLOWED_ORIGIN || '*';
};

async function githubFormPost(url, form) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams(form)
  });
  return response.json();
}

export default {
  async fetch(request, env) {
    const origin = allowOrigin(request, env);
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400'
        }
      });
    }
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin);
    if (!env.GITHUB_CLIENT_ID) return json({ error: 'missing_client_id', message: 'GITHUB_CLIENT_ID is not configured.' }, 500, origin);

    const url = new URL(request.url);
    if (url.pathname === '/github/device/code') {
      const payload = await githubFormPost('https://github.com/login/device/code', {
        client_id: env.GITHUB_CLIENT_ID
      });
      return json(payload, payload.error ? 400 : 200, origin);
    }

    if (url.pathname === '/github/oauth/token') {
      const body = await request.json().catch(() => ({}));
      const form = {
        client_id: env.GITHUB_CLIENT_ID,
        device_code: body.device_code || '',
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      };
      if (env.GITHUB_REPOSITORY_ID) form.repository_id = env.GITHUB_REPOSITORY_ID;
      const payload = await githubFormPost('https://github.com/login/oauth/access_token', form);
      return json(payload, payload.error && !['authorization_pending', 'slow_down'].includes(payload.error) ? 400 : 200, origin);
    }

    return json({ error: 'not_found' }, 404, origin);
  }
};
