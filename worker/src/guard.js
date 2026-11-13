// Only public https MCP endpoints may be scanned by the hosted service.
const PRIVATE = [/^localhost$/i, /\.local$/i, /\.internal$/i, /^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^0\./, /^\[?::1\]?$/, /^\[?f[cd][0-9a-f]{2}:/i, /^\[?fe80:/i, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];
export function checkTarget(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { return { ok: false, error: 'invalid_url' }; }
  if (u.protocol !== 'https:') return { ok: false, error: 'https_only' };
  if (u.username || u.password) return { ok: false, error: 'no_credentials_in_url' };
  if (u.port && u.port !== '443') return { ok: false, error: 'port_443_only' };
  if (PRIVATE.some((re) => re.test(u.hostname))) return { ok: false, error: 'private_address' };
  if (/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)) return { ok: false, error: 'hostname_required' };
  u.hash = '';
  return { ok: true, url: u.href };
}
