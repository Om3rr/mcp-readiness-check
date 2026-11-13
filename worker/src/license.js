// License keys, plans and metering on Workers KV (binding: LICENSES).
// Keys are shown to the buyer once; KV stores only their SHA-256 hash.
export const PLANS = {
  free: { label: 'Free', quota: 0, monthly: false },
  pro: { label: 'Pro ($19/mo)', quota: 2000, monthly: true }, // Action full mode + hosted API + 3 monitors
  team: { label: 'Team ($99/mo)', quota: 20000, monthly: true }, // org-wide CI + API + 25 monitors
  verified: { label: 'Verified re-audit ($79 one-off)', quota: 3, monthly: false }, // fresh audit + badge only if it passes
  pack: { label: 'Report pack ($9 one-off)', quota: 5, monthly: false },
  credits: { label: 'Pay-per-scan credits (250 x $0.04)', quota: 250, monthly: false },
  org: { label: 'Org ($29/mo, later)', quota: 5000, monthly: true }, // reserved; not sold at launch
};
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
export const newKey = () => `mrc_live_${hex(crypto.getRandomValues(new Uint8Array(20)))}`;
const period = (d = new Date()) => d.toISOString().slice(0, 7);

export async function issueLicense(env, { plan, source, ref, email }) {
  if (!PLANS[plan] || plan === 'free') throw new Error(`unknown plan ${plan}`);
  const key = newKey();
  const lic = { plan, status: 'active', used: 0, quota: PLANS[plan].quota, period: period(), source, ref, email: email || null, created: new Date().toISOString() };
  await env.LICENSES.put(`lic:${await sha256(key)}`, JSON.stringify(lic));
  return key;
}

export async function getLicense(env, key) {
  if (!key || !/^mrc_(live|test)_[0-9a-f]{40}$/.test(key)) return null;
  const h = await sha256(key);
  const raw = await env.LICENSES.get(`lic:${h}`);
  if (!raw) return null;
  const lic = JSON.parse(raw);
  if (PLANS[lic.plan]?.monthly && lic.period !== period()) { lic.period = period(); lic.used = 0; await env.LICENSES.put(`lic:${h}`, JSON.stringify(lic)); }
  return { ...lic, hash: h, remaining: Math.max(0, lic.quota - lic.used) };
}

// Returns { ok, lic, error }. Consumes one unit when ok.
export async function consume(env, key) {
  const lic = await getLicense(env, key);
  if (!lic) return { ok: false, error: 'invalid_license' };
  if (lic.status !== 'active') return { ok: false, error: `license_${lic.status}`, lic };
  if (lic.remaining <= 0) return { ok: false, error: 'quota_exhausted', lic };
  const { hash, remaining, ...store } = lic;
  store.used += 1;
  await env.LICENSES.put(`lic:${hash}`, JSON.stringify(store));
  return { ok: true, lic: { ...store, remaining: remaining - 1 } };
}

export async function setStatusByRef(env, ref, status, { resetUsage = false } = {}) {
  const h = await env.LICENSES.get(`ref:${ref}`);
  if (!h) return false;
  const raw = await env.LICENSES.get(`lic:${h}`);
  if (!raw) return false;
  const lic = JSON.parse(raw);
  lic.status = status;
  if (resetUsage) { lic.used = 0; lic.period = period(); }
  await env.LICENSES.put(`lic:${h}`, JSON.stringify(lic));
  return true;
}

export async function linkRef(env, ref, key) { await env.LICENSES.put(`ref:${ref}`, await sha256(key)); }
