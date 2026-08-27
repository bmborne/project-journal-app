import { config } from './config.js';

const broker = path => `${config.authBrokerUrl.replace(/\/+$/, '')}${path}`;
const deviceGrant = 'urn:ietf:params:oauth:grant-type:device_code';

export function isDeviceAuthConfigured() {
  return Boolean(config.authBrokerUrl);
}

async function brokerPost(path, body) {
  if (!isDeviceAuthConfigured()) {
    throw new Error('GitHub sign-in is not configured yet. Use the token fallback or deploy the auth broker first.');
  }
  const response = await fetch(broker(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    throw new Error(payload.error_description || payload.message || payload.error || `Auth broker failed (${response.status}).`);
  }
  return payload;
}

export function requestDeviceCode() {
  return brokerPost('/github/device/code');
}

export async function pollForToken(deviceCode, { interval = 5, expiresIn = 900, onStatus = () => {} } = {}) {
  const started = Date.now();
  let delay = Math.max(1, Number(interval || 5));
  while ((Date.now() - started) / 1000 < expiresIn) {
    await new Promise(resolve => setTimeout(resolve, delay * 1000));
    const response = await fetch(broker('/github/oauth/token'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_code: deviceCode,
        grant_type: deviceGrant
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (payload.access_token) return payload;
    if (payload.error === 'authorization_pending') {
      onStatus('Waiting for GitHub authorization...');
      continue;
    }
    if (payload.error === 'slow_down') {
      delay += 5;
      onStatus('GitHub asked us to slow down. Still waiting...');
      continue;
    }
    if (payload.error === 'expired_token') throw new Error('The GitHub sign-in code expired. Start sign-in again.');
    if (payload.error === 'access_denied') throw new Error('GitHub sign-in was cancelled.');
    throw new Error(payload.error_description || payload.message || payload.error || `GitHub sign-in failed (${response.status}).`);
  }
  throw new Error('The GitHub sign-in code expired. Start sign-in again.');
}
