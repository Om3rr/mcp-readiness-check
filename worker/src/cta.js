// First-party CTA measurement (see MEASUREMENT.md). Free tier only.
// POST /api/event: allow-listed browser events. No cookies, IPs or emails.
// POST /api/waitlist: free Pro waitlist in the LICENSES KV (waitlist:pro:<email>). No payment.
// logEvent(): server-side funnel events. Writes to Analytics Engine (EVENTS, optional) and Workers Logs.
// Complements studio route/visitor metrics; it never blocks or fails a request.

export const CLIENT_EVENTS = new Set([
  'page_view', 'scan_started', 'badge_copied', 'action_install_click', 'cli_copy',
  'waitlist_view', 'waitlist_submit', 'score_page_view', 'outbound_repo_click', 'report_view',
]);
export const SERVER_EVENTS = new Set(['scan_completed', 'scan_failed', 'badge_served', 'action_run', 'server_page_view', 'waitlist_signup']);

const clip = (v, n = 80) => (typeof v === 'string' ? v.slice(0, n) : '');
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export function logEvent(env, e) {
  const row = {
    event: clip(e.event, 40), product: 'mcp-readiness', path: clip(e.path, 120), ref: clip(e.ref, 80),
    utm_source: clip(e.utm_source), utm_medium: clip(e.utm_medium), utm_campaign: clip(e.utm_campaign), utm_content: clip(e.utm_content),
    label: clip(e.label, 120), country: clip(e.country, 4),
    value: typeof e.value === 'number' && Number.isFinite(e.value) ? e.value : 0, origin: e.server ? 'server' : 'client',
  };
  console.log('cta_event', JSON.stringify(row));
  try {
    env?.EVENTS?.writeDataPoint({
      indexes: [row.event],
      blobs: [row.event, row.product, row.path, row.ref, row.utm_source, row.utm_medium, row.utm_campaign, row.utm_content, row.label, row.country, row.origin],
      doubles: [row.value],
    });
  } catch { /* analytics must never break a request */ }
}

export const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ''; } };

export async function handleEvent(req, env) {
  const text = await req.text().catch(() => '');
  if (text.length > 4000) return json({ ok: false, error: 'too_large' }, 413);
  let body; try { body = JSON.parse(text); } catch { return json({ ok: false, error: 'invalid_json' }, 400); }
  if (!CLIENT_EVENTS.has(String(body?.event))) return json({ ok: false, error: 'unknown_event' }, 400);
  logEvent(env, { ...body, country: req.cf?.country, server: false });
  return new Response(null, { status: 204 });
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
export async function handleWaitlist(req, env, rateOk) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return json({ ok: false, error: 'invalid_email' }, 400);
  if (!env.LICENSES) return json({ ok: false, error: 'waitlist_not_open' }, 503);
  if (rateOk && !(await rateOk())) return json({ ok: false, error: 'rate_limited' }, 429);
  const key = `waitlist:pro:${email}`;
  const existing = await env.LICENSES.get(key);
  if (!existing) {
    await env.LICENSES.put(key, JSON.stringify({ at: new Date().toISOString(), plan: clip(body.plan, 20) || 'pro', utm_source: clip(body.utm_source), utm_medium: clip(body.utm_medium), utm_campaign: clip(body.utm_campaign) }));
    logEvent(env, { event: 'waitlist_signup', path: '/api/waitlist', label: clip(body.plan, 20) || 'pro', utm_source: body.utm_source, utm_medium: body.utm_medium, utm_campaign: body.utm_campaign, server: true });
  }
  return json({ ok: true, already: Boolean(existing) });
}
