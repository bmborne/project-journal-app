export const nowIso = () => new Date().toISOString();
export const todayIso = () => new Date().toISOString().slice(0, 10);
export const uuid = () => crypto.randomUUID();

export function normalizeList(value) {
  return [...new Set(String(value || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean))];
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function downloadBytes(bytes, filename, mime = 'application/octet-stream') {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatDate(value) {
  if (!value) return '';
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
}

export function daysUntil(value) {
  if (!value) return null;
  const target = new Date(`${value}T23:59:59`);
  return Math.ceil((target - new Date()) / 86400000);
}

export function riskScore(likelihood, impact) {
  const l = { rare: 1, unlikely: 2, possible: 3, likely: 4, 'almost-certain': 5 }[likelihood] || 0;
  const i = { low: 1, medium: 2, high: 3, critical: 4 }[impact] || 0;
  return l * i;
}

export function riskBand(score) {
  if (score >= 15) return 'critical';
  if (score >= 9) return 'high';
  if (score >= 4) return 'medium';
  if (score > 0) return 'low';
  return 'unset';
}
