// Only public https MCP endpoints may be scanned by the hosted service.
// Hostname checks are sync (checkTarget). DNS resolution of A/AAAA, when
// feasible, is applied by resolvePublicTarget before the worker fetches the URL.

const PRIVATE_HOST = [
  /^localhost$/i,
  /\.localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /\.localdomain$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^198\.18\./,
  /^198\.51\.100\./,
  /^203\.0\.113\./,
  /^192\.0\.2\./,
  /^192\.0\.0\./,
  /^255\./,
  /^\[?::1\]?$/i,
  /^\[?::\]?$/,
  /^\[?f[cd][0-9a-f]{2}:/i,
  /^\[?fe80:/i,
  /^\[?::ffff:/i,
];

const BLOCKED_HOSTNAMES = new Set([
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
  'kubernetes',
  'kubernetes.default',
  'kubernetes.default.svc',
  'kubernetes.default.svc.cluster.local',
]);

const DOH = 'https://cloudflare-dns.com/dns-query';
const DOH_TIMEOUT_MS = 3000;

function stripBrackets(host) {
  return String(host || '').replace(/^\[|\]$/g, '');
}

function ipv4FromDecimal(n) {
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) return null;
  return [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');
}

export function isIpv4(ip) {
  const m = String(ip || '').match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  return m.slice(1).every((o) => Number(o) <= 255);
}

export function isIpv6(ip) {
  const s = stripBrackets(ip);
  if (!s || !s.includes(':')) return false;
  // Unbracketed hostnames must not be treated as IPv6 just for having a colon
  // in a port; callers pass hostname only.
  if (s.includes('.')) {
    // IPv4-mapped IPv6, e.g. ::ffff:127.0.0.1
    const mapped = s.match(/:ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (mapped) return isIpv4(mapped[1]);
  }
  return /^[0-9a-f:]+$/i.test(s);
}

export function isIpLiteral(hostname) {
  const h = stripBrackets(hostname);
  if (isIpv4(h) || isIpv6(h)) return true;
  if (/^\d+$/.test(h) && ipv4FromDecimal(Number(h))) return true;
  return false;
}

export function isPrivateOrMetadataIp(ip) {
  const raw = stripBrackets(ip).toLowerCase();
  if (!raw) return true;
  const mapped = raw.match(/:ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateOrMetadataIp(mapped[1]);
  if (/^\d+$/.test(raw)) {
    const v4 = ipv4FromDecimal(Number(raw));
    return v4 ? isPrivateOrMetadataIp(v4) : true;
  }
  if (isIpv4(raw)) return PRIVATE_HOST.some((re) => re.test(raw));
  if (raw === '::1' || raw === '::' || raw.startsWith('fe80:') || /^f[cd][0-9a-f]{2}:/.test(raw)) return true;
  return false;
}

export function checkTarget(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { return { ok: false, error: 'invalid_url' }; }
  if (u.protocol !== 'https:') return { ok: false, error: 'https_only' };
  if (u.username || u.password) return { ok: false, error: 'no_credentials_in_url' };
  if (u.port && u.port !== '443') return { ok: false, error: 'port_443_only' };
  const host = u.hostname;
  if (!host) return { ok: false, error: 'invalid_url' };
  if (isIpLiteral(host)) return { ok: false, error: 'hostname_required' };
  const lower = host.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(lower) || PRIVATE_HOST.some((re) => re.test(host) || re.test(lower))) {
    return { ok: false, error: 'private_address' };
  }
  u.hash = '';
  return { ok: true, url: u.href };
}

async function dohLookup(hostname, type, fetchImpl) {
  const url = `${DOH}?name=${encodeURIComponent(hostname)}&type=${type}`;
  const r = await fetchImpl(url, {
    headers: { accept: 'application/dns-json' },
    signal: AbortSignal.timeout(DOH_TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`doh_${r.status}`);
  const body = await r.json();
  const answers = Array.isArray(body?.Answer) ? body.Answer : [];
  const recType = type === 'AAAA' ? 28 : 1;
  return answers.filter((a) => a && (a.type === recType || a.type === type)).map((a) => String(a.data || '').replace(/\.$/, ''));
}

export async function resolvePublicTarget(raw, { fetchImpl = globalThis.fetch } = {}) {
  const t = checkTarget(raw);
  if (!t.ok) return t;
  const hostname = new URL(t.url).hostname;
  try {
    const [a, aaaa] = await Promise.all([
      dohLookup(hostname, 'A', fetchImpl),
      dohLookup(hostname, 'AAAA', fetchImpl),
    ]);
    const addrs = [...a, ...aaaa].filter(Boolean);
    if (!addrs.length) return { ok: false, error: 'dns_resolution_failed' };
    if (addrs.some((ip) => isPrivateOrMetadataIp(ip))) return { ok: false, error: 'private_address' };
    return t;
  } catch {
    return { ok: false, error: 'dns_resolution_failed' };
  }
}
