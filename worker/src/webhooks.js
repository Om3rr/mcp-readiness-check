// Payment webhooks: Stripe Checkout (Payment Links) and Lemon Squeezy.
// Nothing here talks to the payment provider's API; it only verifies signed events
// and issues or updates license keys. All secrets come from env vars.
import { issueLicense, linkRef, setStatusByRef } from './license.js';

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function hmacHex(secret, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
function safeEq(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const parseMap = (s) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };

export async function verifyStripe(body, header, secret, now = Date.now(), toleranceSec = 300) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')).map(([k, ...v]) => [k.trim(), v.join('=')]));
  const sigs = header.split(',').filter((p) => p.trim().startsWith('v1=')).map((p) => p.trim().slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length || Math.abs(now / 1000 - t) > toleranceSec) return false;
  const expected = await hmacHex(secret, `${t}.${body}`);
  return sigs.some((s) => safeEq(s, expected));
}

export async function verifyLemon(body, header, secret) {
  if (!header || !secret) return false;
  return safeEq(header, await hmacHex(secret, body));
}

// STRIPE_PLAN_BY_LINK = {"plink_1":"pro","plink_2":"team","plink_3":"verified","plink_4":"pack","plink_5":"credits"}
export async function handleStripe(req, env) {
  if (!env.STRIPE_WEBHOOK_SECRET) return json({ error: 'stripe_not_configured' }, 501);
  const body = await req.text();
  if (!(await verifyStripe(body, req.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET))) return json({ error: 'bad_signature' }, 400);
  const ev = JSON.parse(body);
  const o = ev.data?.object || {};
  if (await env.LICENSES.get(`evt:${ev.id}`)) return json({ ok: true, duplicate: true });
  const res = await stripeEvent(ev, o, env);
  if (res.status < 300) await env.LICENSES.put(`evt:${ev.id}`, '1', { expirationTtl: 60 * 60 * 24 * 7 });
  return res;
}

async function stripeEvent(ev, o, env) {
  switch (ev.type) {
    case 'checkout.session.completed': {
      const plan = o.metadata?.plan || parseMap(env.STRIPE_PLAN_BY_LINK)[o.payment_link];
      if (!plan) return json({ ok: true, ignored: 'no_plan_mapping' });
      const ref = o.subscription || o.id;
      const key = await issueLicense(env, { plan, source: 'stripe', ref, email: o.customer_details?.email });
      await linkRef(env, ref, key);
      await env.LICENSES.put(`claim:${o.id}`, key, { expirationTtl: 60 * 60 * 24 }); // shown once on /thanks
      return json({ ok: true, issued: plan });
    }
    case 'invoice.paid':
      if (o.subscription && o.billing_reason === 'subscription_cycle') await setStatusByRef(env, o.subscription, 'active', { resetUsage: true });
      return json({ ok: true });
    case 'customer.subscription.deleted':
      await setStatusByRef(env, o.id, 'cancelled');
      return json({ ok: true });
    case 'invoice.payment_failed':
      if (o.subscription) await setStatusByRef(env, o.subscription, 'past_due');
      return json({ ok: true });
    default:
      return json({ ok: true, ignored: ev.type });
  }
}

// LEMON_PLAN_BY_VARIANT = {"12345":"pro","12346":"team","12347":"verified","12348":"pack","12349":"credits"}
export async function handleLemon(req, env) {
  if (!env.LEMON_WEBHOOK_SECRET) return json({ error: 'lemonsqueezy_not_configured' }, 501);
  const body = await req.text();
  if (!(await verifyLemon(body, req.headers.get('x-signature'), env.LEMON_WEBHOOK_SECRET))) return json({ error: 'bad_signature' }, 400);
  const ev = JSON.parse(body);
  const name = ev.meta?.event_name;
  const a = ev.data?.attributes || {};
  const id = String(ev.data?.id || '');
  const map = parseMap(env.LEMON_PLAN_BY_VARIANT);
  switch (name) {
    case 'order_created': {
      const variant = String(a.first_order_item?.variant_id ?? '');
      const plan = ev.meta?.custom_data?.plan || map[variant];
      if (!plan || ['org', 'pro', 'team'].includes(plan)) return json({ ok: true, ignored: 'subscription_order_or_unmapped' });
      if (await env.LICENSES.get(`ref:ls_order_${id}`)) return json({ ok: true, duplicate: true });
      const key = await issueLicense(env, { plan, source: 'lemonsqueezy', ref: `ls_order_${id}`, email: a.user_email });
      await linkRef(env, `ls_order_${id}`, key);
      await env.LICENSES.put(`claim:ls_${a.identifier || id}`, key, { expirationTtl: 60 * 60 * 24 });
      return json({ ok: true, issued: plan });
    }
    case 'subscription_created': {
      const plan = ev.meta?.custom_data?.plan || map[String(a.variant_id)];
      if (!plan) return json({ ok: true, ignored: 'no_plan_mapping' });
      if (await env.LICENSES.get(`ref:ls_sub_${id}`)) return json({ ok: true, duplicate: true });
      const key = await issueLicense(env, { plan, source: 'lemonsqueezy', ref: `ls_sub_${id}`, email: a.user_email });
      await linkRef(env, `ls_sub_${id}`, key);
      await env.LICENSES.put(`claim:ls_${a.order_id}`, key, { expirationTtl: 60 * 60 * 24 });
      return json({ ok: true, issued: plan });
    }
    case 'subscription_payment_success':
      await setStatusByRef(env, `ls_sub_${a.subscription_id}`, 'active', { resetUsage: true });
      return json({ ok: true });
    case 'subscription_cancelled': case 'subscription_expired':
      await setStatusByRef(env, `ls_sub_${id}`, name === 'subscription_expired' ? 'expired' : 'cancelled');
      return json({ ok: true });
    default:
      return json({ ok: true, ignored: name });
  }
}
