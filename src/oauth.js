// OAuth discovery checks for servers that answer 401 (MCP authorization spec 2025-06-18:
// RFC 9728 protected-resource metadata, RFC 8414 AS metadata, PKCE S256, optional DCR).
const j = async (u, fetchImpl) => { try { const r = await fetchImpl(u, { headers: { accept: 'application/json' } }); if (!r.ok) return null; return await r.json(); } catch { return null; } };

export function parseWwwAuth(h = '') {
  const out = { scheme: (h.match(/^\s*(\w+)/) || [])[1] || null };
  for (const m of h.matchAll(/(\w+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

export async function probeOAuth(url, res, fetchImpl = fetch) {
  const f = [];
  const add = (level, id, title, detail = '', fix = '') => f.push({ id, level, title, detail, fix });
  const u = new URL(url);
  const www = parseWwwAuth(res.headers.get('www-authenticate') || '');
  add('pass', 'auth.required', 'Unauthenticated requests are rejected with 401');
  if (!www.scheme) add('warn', 'auth.www_authenticate', '401 without a WWW-Authenticate header', 'Clients cannot discover how to authenticate.', 'Return WWW-Authenticate: Bearer resource_metadata="…".');
  else if (!/bearer/i.test(www.scheme)) add('info', 'auth.scheme', `WWW-Authenticate scheme is ${www.scheme}, not Bearer`);
  if (www.resource_metadata && !/^https?:\/\//i.test(www.resource_metadata)) {
    add('warn', 'auth.prm_relative', 'resource_metadata is a relative URL', `Got "${www.resource_metadata}". RFC 9728 requires an absolute URL; some clients will not resolve it.`, 'Send the full https:// URL.');
    try { www.resource_metadata = new URL(www.resource_metadata, u.origin).href; } catch {}
  }
  const candidates = [www.resource_metadata, `${u.origin}/.well-known/oauth-protected-resource${u.pathname === '/' ? '' : u.pathname}`, `${u.origin}/.well-known/oauth-protected-resource`].filter(Boolean);
  let prm = null, prmUrl = null;
  for (const c of candidates) { prm = await j(c, fetchImpl); if (prm) { prmUrl = c; break; } }
  if (www.resource_metadata && prmUrl !== www.resource_metadata) add('fail', 'auth.prm_broken', 'The 401 points at protected-resource metadata that does not load', `resource_metadata="${www.resource_metadata}" did not return JSON.`, 'Serve RFC 9728 JSON at that exact URL (resource, authorization_servers), or fix the pointer.');
  if (!www.resource_metadata) add('info', 'auth.resource_metadata_hint', 'WWW-Authenticate has no resource_metadata pointer', 'The 2025-06-18 spec has servers point clients at RFC 9728 metadata from the 401.', 'Add resource_metadata="https://…/.well-known/oauth-protected-resource".');
  let as;
  if (!prm) {
    const legacy = await j(`${u.origin}/.well-known/oauth-authorization-server`, fetchImpl);
    if (!legacy) { add('warn', 'auth.prm_missing', 'No OAuth protected-resource metadata (RFC 9728) found', `Tried ${candidates.length} well-known locations.`, 'Serve /.well-known/oauth-protected-resource with authorization_servers.'); return { findings: f, oauth: { www } }; }
    add('warn', 'auth.legacy_discovery', 'Uses the older 2025-03-26 discovery (AS metadata on the MCP host, no RFC 9728)', 'Clients built for the 2025-06-18 spec look for protected-resource metadata first.', 'Also publish /.well-known/oauth-protected-resource.');
    as = u.origin;
  } else {
    add('pass', 'auth.prm', 'Protected-resource metadata (RFC 9728) published', prmUrl);
    as = prm.authorization_servers?.[0];
  }
  if (!as) { add('warn', 'auth.prm_no_as', 'Protected-resource metadata lists no authorization_servers'); return { findings: f, oauth: { www, prm } }; }
  const asu = new URL(as);
  const asMeta = await j(`${asu.origin}/.well-known/oauth-authorization-server${asu.pathname === '/' ? '' : asu.pathname}`, fetchImpl)
    || await j(`${asu.origin}/.well-known/oauth-authorization-server`, fetchImpl)
    || await j(`${asu.origin}/.well-known/openid-configuration${asu.pathname === '/' ? '' : asu.pathname}`, fetchImpl);
  if (!asMeta) { add('warn', 'auth.as_meta', 'Authorization-server metadata (RFC 8414) not found', as); return { findings: f, oauth: { www, prm } }; }
  add('pass', 'auth.as_meta', 'Authorization-server metadata found', asMeta.issuer || as);
  const pkce = asMeta.code_challenge_methods_supported || [];
  if (!pkce.includes('S256')) add('warn', 'auth.pkce', 'Authorization server does not advertise PKCE S256', `code_challenge_methods_supported: ${JSON.stringify(pkce)}`, 'OAuth 2.1 / MCP require PKCE with S256.');
  else add('pass', 'auth.pkce', 'PKCE S256 advertised');
  if (!asMeta.registration_endpoint) add('info', 'auth.dcr', 'No dynamic client registration endpoint', 'Generic MCP clients then need a pre-registered client id.');
  else add('pass', 'auth.dcr', 'Dynamic client registration available');
  return { findings: f, oauth: { www, prm, as: asMeta.issuer || as } };
}
