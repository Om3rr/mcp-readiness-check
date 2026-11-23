/** Privacy-preserving traffic counters for the studio Workers (D1 `studio-metrics`). */
import { escapeHtml } from "./escape.js";
export const WORKER_TZ = "Asia/Jerusalem";
const BOT_RE = /bot|crawler|spider|crawling|slurp|bingpreview|facebookexternalhit|facebot|pingdom|uptimerobot|healthcheck|kube-probe|lighthouse|pagespeed|headlesschrome|whatsapp|telegram|discordbot|embedly|linkedinbot|twitterbot|applebot|yandex|duckduckbot|baiduspider|semrush|ahrefs|mj12bot|dotbot|gptbot|claudebot|chatgpt|amazonbot|bytespider|petalsearch|cf-health|cloudflare-traffic-manager|monitor|preview-block|statuscake|site24x7/i;
const SKIP_ROUTES = new Set(["/api/health", "/favicon.ico", "/favicon.svg", "/t.js", "/robots.txt", "/stats", "/stats.html", "/stats.json"]);
export function israelDay(now = new Date()) {
    return now.toLocaleDateString("en-CA", { timeZone: WORKER_TZ });
}
export function israelNowIso(now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: WORKER_TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    }).formatToParts(now);
    const g = (t) => parts.find((p) => p.type === t)?.value || "";
    const offsetMin = tzOffsetMinutes(now, WORKER_TZ);
    const sign = offsetMin >= 0 ? "+" : "-";
    const abs = Math.abs(offsetMin);
    const oh = String(Math.floor(abs / 60)).padStart(2, "0");
    const om = String(abs % 60).padStart(2, "0");
    return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}:${g("second")}${sign}${oh}:${om}`;
}
function tzOffsetMinutes(now, tz) {
    const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        timeZoneName: "shortOffset",
        hour: "2-digit",
    });
    const name = fmt.formatToParts(now).find((p) => p.type === "timeZoneName")?.value || "GMT+0";
    const m = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!m)
        return 0;
    const minutes = Number(m[2]) * 60 + Number(m[3] || 0);
    return m[1] === "-" ? -minutes : minutes;
}
export const AI_CRAWLERS = [
    { name: "GPTBot", re: /gptbot/i },
    { name: "ClaudeBot", re: /claudebot/i },
    { name: "PerplexityBot", re: /perplexitybot/i },
    { name: "OAI-SearchBot", re: /oai-searchbot/i },
    { name: "Google-Extended", re: /google-extended/i },
    { name: "CCBot", re: /\bccbot\b/i },
];
export function aiCrawlerName(ua) {
    for (const c of AI_CRAWLERS)
        if (c.re.test(ua))
            return c.name;
    return null;
}
export function isInternalRequest(request) {
    if ((request.headers.get("x-studio-internal") || "").trim() === "1")
        return true;
    const ua = request.headers.get("user-agent") || "";
    if (/studio-agent/i.test(ua))
        return true;
    if (/github-actions|actions\/runner|github.com\/actions|dependabot/i.test(ua))
        return true;
    if (/\bcurl\/|\bwget\/|\bhttpie\//i.test(ua))
        return true;
    if (/^node(\/|\b)|node-fetch|\bundici\b|^Node\.js/i.test(ua))
        return true;
    return false;
}
export function classifyTraffic(request) {
    if (isInternalRequest(request))
        return { class: "internal" };
    const ua = request.headers.get("user-agent") || "";
    const crawler = aiCrawlerName(ua);
    if (crawler)
        return { class: "ai_crawler", crawler };
    if (ua.trim() && BOT_RE.test(ua))
        return { class: "bot" };
    return { class: "human" };
}
export function isBot(request) {
    const kind = classifyTraffic(request).class;
    return kind === "bot" || kind === "ai_crawler";
}
export function bucketRoute(pathname) {
    let p = pathname.replace(/\/+$/, "") || "/";
    if (p === "/stats.json")
        return "/stats";
    if (p.startsWith("/badge"))
        return "/badge";
    if (p.startsWith("/s/"))
        return "/s/*";
    if (p.startsWith("/webhooks/")) {
        const parts = p.split("/").filter(Boolean);
        return "/" + parts.slice(0, 2).join("/");
    }
    if (p.length > 80)
        return p.slice(0, 80);
    return p;
}
export function shouldSkipRoute(route) {
    return SKIP_ROUTES.has(route);
}
/** Store utm:source/medium/campaign as-is; otherwise keep only the referrer host. */
export function normalizeRef(raw) {
    if (!raw)
        return null;
    const s = raw.trim();
    if (!s)
        return null;
    if (s.toLowerCase().startsWith("utm:"))
        return s.slice(0, 180);
    try {
        const host = new URL(s).host.toLowerCase();
        return host ? host.slice(0, 180) : null;
    }
    catch {
        return null;
    }
}
export function referrerHost(request, override) {
    const fromOverride = normalizeRef(override);
    if (fromOverride)
        return fromOverride;
    const raw = request.headers.get("referer") || request.headers.get("referrer") || "";
    const normalized = normalizeRef(raw);
    if (!normalized)
        return null;
    if (normalized.toLowerCase().startsWith("utm:"))
        return normalized;
    try {
        const self = new URL(request.url).host.toLowerCase();
        if (normalized === self)
            return null;
    }
    catch {
        /* ignore */
    }
    return normalized;
}
export async function visitorHash(salt, ip, ua) {
    const data = new TextEncoder().encode(`${salt}\n${ip}\n${ua}`);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function connectingIp(request) {
    return request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
}
async function dailySalt(db, day) {
    const existing = await db.prepare("SELECT salt FROM daily_salts WHERE day = ?").bind(day).first();
    if (existing?.salt)
        return existing.salt;
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const salt = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    await db.prepare("INSERT OR IGNORE INTO daily_salts (day, salt) VALUES (?, ?)").bind(day, salt).run();
    const row = await db.prepare("SELECT salt FROM daily_salts WHERE day = ?").bind(day).first();
    return row?.salt || salt;
}
export const ALLOWED_EVENTS = [
    "landing_view",
    "scan_started",
    "scan_completed",
    "scan_failed",
    "badge_copied",
    "action_install_click",
    "pro_waitlist_signup",
    "price_click",
];
const ALLOWED_EVENT_SET = new Set(ALLOWED_EVENTS);
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const EVENT_RATE_LIMIT = 60;
const WAITLIST_RATE_LIMIT = 8;
const OUTSIDE_PEPPER = "studio-outside-v1";
/** SHA-256(pepper || box egress IP). Raw IPs are never stored in the repo. */
const BOX_IP_HASHES = new Set([
    "d8a0842ef240b7217b611f08e975be7d096d6583b974958f0401064c06381ab7",
    "c8c6916000c7f13fc44c50f95a8f7b41e9d5ed6bcb3b6cde57e57893498578e9",
    "190e71a7d1fb5d42d88b94ccce5eb5dc64ac101d2de063ba4950baeb77ba6f97",
]);
const TEST_TARGET_HOSTS = new Set([
    "mcp-readiness.omer20sh.workers.dev",
    "mcp.pacerai.fit",
    "agent-ready-score.omer20sh.workers.dev",
    "mcp.context7.com",
    "petstore.swagger.io",
    "petstore3.swagger.io",
    "example.com",
    "www.example.com",
    "example.org",
    "example.net",
    "localhost",
    "127.0.0.1",
    "widgets.example",
    "api.widgets.example",
    "w.test",
    "score.example",
]);
const TEST_REF_HOSTS = new Set(["landing-probe.example", "score.example", "w.test"]);
export async function pepperedIpHash(ip) {
    const data = new TextEncoder().encode(`${OUTSIDE_PEPPER}\n${ip}`);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export function targetHostOf(url) {
    if (!url)
        return null;
    try {
        return new URL(url).host.toLowerCase();
    }
    catch {
        return null;
    }
}
export async function isOutsideScan(request, targetUrl) {
    if (!targetUrl)
        return false;
    const host = targetHostOf(targetUrl);
    if (!host || TEST_TARGET_HOSTS.has(host))
        return false;
    const ref = referrerHost(request);
    if (ref && TEST_REF_HOSTS.has(ref))
        return false;
    const ip = connectingIp(request);
    if (ip && BOX_IP_HASHES.has(await pepperedIpHash(ip)))
        return false;
    return true;
}
async function bumpEvent(db, worker, day, event) {
    await db
        .prepare("INSERT INTO events_daily (worker, day, event, count) VALUES (?, ?, ?, 1) ON CONFLICT(worker, day, event) DO UPDATE SET count = count + 1")
        .bind(worker, day, event)
        .run();
}
async function rateLimitVisitor(db, worker, day, hash, limit) {
    const row = await db.prepare("SELECT count FROM event_rate WHERE worker = ? AND day = ? AND hash = ?").bind(worker, day, hash).first();
    const n = Number(row?.count || 0);
    if (n >= limit)
        return false;
    await db
        .prepare("INSERT INTO event_rate (worker, day, hash, count) VALUES (?, ?, ?, 1) ON CONFLICT(worker, day, hash) DO UPDATE SET count = count + 1")
        .bind(worker, day, hash)
        .run();
    return true;
}
/** Record one request. Fail-open: throws are swallowed by scheduleTrack. Never stores raw IPs. */
export async function recordVisit(env, request, opts) {
    const db = env.METRICS;
    if (!db || opts.skip)
        return;
    if (request.method === "OPTIONS")
        return;
    const route = bucketRoute(opts.route);
    if (shouldSkipRoute(route))
        return;
    const day = israelDay();
    const worker = opts.worker;
    const kind = classifyTraffic(request);
    if (kind.class === "internal") {
        await db
            .prepare("INSERT INTO internal_daily (worker, day, count) VALUES (?, ?, 1) ON CONFLICT(worker, day) DO UPDATE SET count = count + 1")
            .bind(worker, day)
            .run();
        return;
    }
    if (kind.class === "ai_crawler" && kind.crawler) {
        await db
            .prepare("INSERT INTO crawlers_daily (worker, day, crawler, count) VALUES (?, ?, ?, 1) ON CONFLICT(worker, day, crawler) DO UPDATE SET count = count + 1")
            .bind(worker, day, kind.crawler)
            .run();
        return;
    }
    if (kind.class === "bot")
        return;
    const salt = await dailySalt(db, day);
    const hash = await visitorHash(salt, connectingIp(request), request.headers.get("user-agent") || "");
    await db
        .prepare("INSERT INTO requests_daily (worker, day, route, count) VALUES (?, ?, ?, 1) ON CONFLICT(worker, day, route) DO UPDATE SET count = count + 1")
        .bind(worker, day, route)
        .run();
    const inserted = await db
        .prepare("INSERT OR IGNORE INTO visitor_hashes (worker, day, hash) VALUES (?, ?, ?)")
        .bind(worker, day, hash)
        .run();
    if (inserted?.meta?.changes === 1) {
        await db
            .prepare("INSERT INTO uniques_daily (worker, day, count) VALUES (?, ?, 1) ON CONFLICT(worker, day) DO UPDATE SET count = count + 1")
            .bind(worker, day)
            .run();
    }
    if (opts.scan === "success" || opts.scan === "fail") {
        const col = opts.scan === "success" ? "success" : "fail";
        await db
            .prepare(`INSERT INTO scans_daily (worker, day, success, fail) VALUES (?, ?, ?, ?) ON CONFLICT(worker, day) DO UPDATE SET ${col} = ${col} + 1`)
            .bind(worker, day, opts.scan === "success" ? 1 : 0, opts.scan === "fail" ? 1 : 0)
            .run();
    }
    if (opts.badge) {
        await db
            .prepare("INSERT INTO badges_daily (worker, day, count) VALUES (?, ?, 1) ON CONFLICT(worker, day) DO UPDATE SET count = count + 1")
            .bind(worker, day)
            .run();
    }
    const host = referrerHost(request, opts.ref);
    if (host) {
        await db
            .prepare("INSERT INTO referrers_daily (worker, day, host, count) VALUES (?, ?, ?, 1) ON CONFLICT(worker, day, host) DO UPDATE SET count = count + 1")
            .bind(worker, day, host)
            .run();
    }
    const evs = [...(opts.events || [])];
    if (opts.scan === "success")
        evs.push("scan_completed");
    else if (opts.scan === "fail")
        evs.push("scan_failed");
    for (const ev of evs) {
        if (ALLOWED_EVENT_SET.has(ev))
            await bumpEvent(db, worker, day, ev);
    }
    if ((opts.scan === "success" || opts.scan === "fail") && (await isOutsideScan(request, opts.targetUrl))) {
        await db
            .prepare("INSERT INTO outside_scans_daily (worker, day, count) VALUES (?, ?, 1) ON CONFLICT(worker, day) DO UPDATE SET count = count + 1")
            .bind(worker, day)
            .run();
    }
}
export function scheduleTrack(ctx, env, request, opts) {
    const task = recordVisit(env, request, opts).catch(() => { });
    if (ctx?.waitUntil)
        ctx.waitUntil(task);
}
const emptyStats = (worker) => ({
    ok: true,
    worker,
    timezone: WORKER_TZ,
    generated_at: israelNowIso(),
    window_days: 30,
    totals: { requests: 0, unique_visitors: 0, scans: { success: 0, fail: 0 }, badge_hits: 0, waitlist_signups: 0, outside_scans: 0, events: {}, internal_hits: 0, ai_crawlers: {}, price_click_tiers: {} },
    daily: [],
    routes: [],
    top_referrers: [],
});
function daysAgo(n) {
    const ms = Date.now() - n * 86400000;
    return israelDay(new Date(ms));
}
export async function readStats(env, worker) {
    const out = emptyStats(worker);
    const db = env.METRICS;
    if (!db)
        return out;
    const since = daysAgo(29);
    const dailyRows = await db
        .prepare(`SELECT r.day AS day,
              IFNULL(r.requests, 0) AS requests,
              IFNULL(u.count, 0) AS unique_visitors,
              IFNULL(s.success, 0) AS scans_success,
              IFNULL(s.fail, 0) AS scans_fail,
              IFNULL(b.count, 0) AS badge_hits,
              IFNULL(o.count, 0) AS outside_scans
       FROM (SELECT day, SUM(count) AS requests FROM requests_daily WHERE worker = ? AND day >= ? GROUP BY day) r
       LEFT JOIN uniques_daily u ON u.worker = ? AND u.day = r.day
       LEFT JOIN scans_daily s ON s.worker = ? AND s.day = r.day
       LEFT JOIN badges_daily b ON b.worker = ? AND b.day = r.day
       LEFT JOIN outside_scans_daily o ON o.worker = ? AND o.day = r.day
       ORDER BY r.day ASC`)
        .bind(worker, since, worker, worker, worker, worker)
        .all();
    out.daily = (dailyRows.results || []).map((row) => ({
        day: String(row.day),
        requests: Number(row.requests) || 0,
        unique_visitors: Number(row.unique_visitors) || 0,
        scans_success: Number(row.scans_success) || 0,
        scans_fail: Number(row.scans_fail) || 0,
        badge_hits: Number(row.badge_hits) || 0,
        outside_scans: Number(row.outside_scans) || 0,
    }));
    for (const row of out.daily) {
        out.totals.requests += row.requests;
        out.totals.unique_visitors += row.unique_visitors;
        out.totals.scans.success += row.scans_success;
        out.totals.scans.fail += row.scans_fail;
        out.totals.badge_hits += row.badge_hits;
        out.totals.outside_scans += row.outside_scans;
    }
    const routes = await db
        .prepare("SELECT route, SUM(count) AS count FROM requests_daily WHERE worker = ? AND day >= ? GROUP BY route ORDER BY count DESC, route ASC LIMIT 30")
        .bind(worker, since)
        .all();
    out.routes = (routes.results || []).map((row) => ({ route: String(row.route), count: Number(row.count) || 0 }));
    const refs = await db
        .prepare("SELECT host, SUM(count) AS count FROM referrers_daily WHERE worker = ? AND day >= ? GROUP BY host ORDER BY count DESC, host ASC LIMIT 20")
        .bind(worker, since)
        .all();
    out.top_referrers = (refs.results || []).map((row) => ({ host: String(row.host), count: Number(row.count) || 0 }));
    const evs = await db
        .prepare("SELECT event, SUM(count) AS count FROM events_daily WHERE worker = ? AND day >= ? GROUP BY event ORDER BY count DESC, event ASC")
        .bind(worker, since)
        .all();
    for (const row of evs.results || []) {
        const name = String(row.event);
        if (!ALLOWED_EVENT_SET.has(name))
            continue;
        out.totals.events[name] = Number(row.count) || 0;
    }
    const wl = await db
        .prepare("SELECT COUNT(*) AS count FROM waitlist WHERE product = ? AND created_at >= ?")
        .bind(worker, `${since}T00:00:00+02:00`)
        .first();
    // Also count rows whose created_at is a date-only or ISO in the window; fallback to all-time for this product if the comparison is too strict.
    const wlAll = await db.prepare("SELECT COUNT(*) AS count FROM waitlist WHERE product = ?").bind(worker).first();
    out.totals.waitlist_signups = Number(wlAll?.count || wl?.count || 0);
    const internal = await db
        .prepare("SELECT IFNULL(SUM(count), 0) AS count FROM internal_daily WHERE worker = ? AND day >= ?")
        .bind(worker, since)
        .first();
    out.totals.internal_hits = Number(internal?.count || 0);
    const crawlers = await db
        .prepare("SELECT crawler, SUM(count) AS count FROM crawlers_daily WHERE worker = ? AND day >= ? GROUP BY crawler ORDER BY count DESC, crawler ASC")
        .bind(worker, since)
        .all();
    for (const row of crawlers.results || []) {
        out.totals.ai_crawlers[String(row.crawler)] = Number(row.count) || 0;
    }
    const tiers = await db
        .prepare("SELECT value, SUM(count) AS count FROM event_props_daily WHERE worker = ? AND day >= ? AND event = 'price_click' AND prop = 'tier' GROUP BY value ORDER BY count DESC, value ASC")
        .bind(worker, since)
        .all();
    for (const row of tiers.results || []) {
        out.totals.price_click_tiers[String(row.value)] = Number(row.count) || 0;
    }
    return out;
}
export function statsJsonResponse(data) {
    return new Response(JSON.stringify(data, null, 2), {
        headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "public, max-age=60",
            "access-control-allow-origin": "*",
        },
    });
}
const esc = escapeHtml;
export function statsHtmlResponse(data, title) {
    const totals = data.totals || {};
    const events = totals.events || {};
    const aiCrawlers = totals.ai_crawlers || {};
    const priceTiers = totals.price_click_tiers || {};
    const internalHits = Number(totals.internal_hits || 0);
    const dailyRows = data.daily
        .slice()
        .reverse()
        .map((d) => `<tr><td>${esc(d.day)}</td><td>${d.requests}</td><td>${d.unique_visitors}</td><td>${d.scans_success}</td><td>${d.scans_fail}</td><td>${d.outside_scans}</td><td>${d.badge_hits}</td></tr>`)
        .join("") || `<tr><td colspan="7">No traffic recorded in the last 30 days yet.</td></tr>`;
    const routeRows = data.routes.map((r) => `<tr><td><code>${esc(r.route)}</code></td><td>${r.count}</td></tr>`).join("") ||
        `<tr><td colspan="2">None yet.</td></tr>`;
    const refRows = data.top_referrers.map((r) => `<tr><td>${esc(r.host)}</td><td>${r.count}</td></tr>`).join("") ||
        `<tr><td colspan="2">None yet.</td></tr>`;
    const eventRows = Object.entries(events)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([name, count]) => `<tr><td><code>${esc(name)}</code></td><td>${count}</td></tr>`)
        .join("") || `<tr><td colspan="2">None yet.</td></tr>`;
    const crawlerRows = Object.entries(aiCrawlers)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([name, count]) => `<tr><td>${esc(name)}</td><td>${count}</td></tr>`)
        .join("") || `<tr><td colspan="2">None yet.</td></tr>`;
    const tierRows = Object.entries(priceTiers)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([name, count]) => `<tr><td><code>${esc(name)}</code></td><td>${count}</td></tr>`)
        .join("") || `<tr><td colspan="2">None yet.</td></tr>`;
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <title>${esc(title)} — traffic (last 30 days)</title>
  <style>
    :root { color-scheme: dark; --bg:#0b1020; --card:#121a33; --ink:#e6e9f5; --mut:#a7b0cc; --acc:#7c9cff; --line:#24305a; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .wrap { max-width: 960px; margin: 0 auto; padding: 0 20px 48px; }
    nav { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 18px 0; flex-wrap: wrap; }
    nav .brand { display: flex; align-items: center; gap: 10px; color: var(--ink); text-decoration: none; font-weight: 700; font-size: 18px; white-space: nowrap; }
    nav .brand .mark { width: 24px; height: 24px; border-radius: 7px; border: 2px solid var(--acc); display: inline-block; background: linear-gradient(135deg, transparent 45%, var(--acc) 45%, var(--acc) 58%, transparent 58%); }
    nav .links a { color: var(--mut); text-decoration: none; margin-left: 16px; white-space: nowrap; }
    h1 { font-size: 1.6rem; margin: 8px 0 8px; }
    h2 { font-size: 1.1rem; margin: 28px 0 10px; }
    p.meta { color: var(--mut); margin: 0 0 24px; font-size: .95rem; }
    .nw { white-space: nowrap; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 0 0 8px; }
    .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; min-width: 0; }
    .card .n { font-size: 1.6rem; font-weight: 700; }
    .card .l { color: var(--mut); font-size: 0.85rem; }
    .card.ex { opacity: .9; border-style: dashed; }
    .tablewrap { overflow-x: auto; -webkit-overflow-scrolling: touch; background: var(--card); border: 1px solid var(--line); border-radius: 12px; margin: 0 0 8px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--line); white-space: nowrap; }
    tr:last-child td { border-bottom: 0; }
    th { font-size: 0.78rem; text-transform: uppercase; letter-spacing: .04em; color: var(--mut); }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; }
    a { color: var(--acc); }
    @media (max-width: 640px) { nav .links a { margin: 0 16px 0 0; } h1 { font-size: 1.35rem; } }
  </style>
</head>
<body><div class="wrap">
  <nav aria-label="Main"><a class="brand" href="/"><span class="mark" aria-hidden="true"></span>${esc(title)}</a><div class="links"><a href="/">Home</a><a href="/stats">JSON</a></div></nav>
  <h1>Public traffic, last ${data.window_days} days</h1>
  <p class="meta">Privacy-preserving totals. Timezone: Israel time (${esc(data.timezone)}). Generated <span class="nw">${esc(data.generated_at)}</span>.
    No IP addresses, emails, or other personal data are shown here. Waitlist emails are stored privately and never appear on this page.
    JSON: <a href="/stats">/stats</a>.</p>
  <div class="cards">
    <div class="card"><div class="n">${totals.requests || 0}</div><div class="l">Requests</div></div>
    <div class="card"><div class="n">${totals.unique_visitors || 0}</div><div class="l">Unique visitors</div></div>
    <div class="card"><div class="n">${totals.scans?.success || 0}</div><div class="l">Scans succeeded</div></div>
    <div class="card"><div class="n">${totals.scans?.fail || 0}</div><div class="l">Scans failed</div></div>
    <div class="card"><div class="n">${totals.badge_hits || 0}</div><div class="l">Badge hits</div></div>
    <div class="card"><div class="n">${totals.outside_scans || 0}</div><div class="l">Outside scans</div></div>
    <div class="card"><div class="n">${totals.waitlist_signups || 0}</div><div class="l">Pro waitlist</div></div>
    <div class="card ex"><div class="n">${internalHits}</div><div class="l">Internal hits (excluded)</div></div>
    <div class="card ex"><div class="n">${Object.values(aiCrawlers).reduce((a, b) => a + b, 0)}</div><div class="l">AI crawlers (excluded)</div></div>
  </div>
  <h2>Daily</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>Day</th><th>Requests</th><th>Uniques</th><th>Scans ok</th><th>Scans fail</th><th>Outside</th><th>Badges</th></tr></thead>
    <tbody>${dailyRows}</tbody>
  </table></div>
  <h2>Routes</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>Route</th><th>Requests</th></tr></thead>
    <tbody>${routeRows}</tbody>
  </table></div>
  <h2>Events</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>Event</th><th>Count</th></tr></thead>
    <tbody>${eventRows}</tbody>
  </table></div>
  <h2>Price clicks by tier</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>Tier</th><th>Clicks</th></tr></thead>
    <tbody>${tierRows}</tbody>
  </table></div>
  <h2>Top referrers</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>Referrer</th><th>Hits</th></tr></thead>
    <tbody>${refRows}</tbody>
  </table></div>
  <h2>Excluded: AI crawlers</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>Crawler</th><th>Hits</th></tr></thead>
    <tbody>${crawlerRows}</tbody>
  </table></div>
  <h2>Excluded: internal hits</h2>
  <p class="meta">GitHub Actions/CI, curl/node, <code>x-studio-internal: 1</code>, and user-agents containing <code>studio-agent</code>. These are not included in visitor or scan counts.</p>
  <p>Internal hits: <strong>${internalHits}</strong></p>
</div></body>
</html>`;
    return new Response(html, {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
    });
}
export async function handleStats(env, worker, path, title) {
    let data;
    try {
        data = await readStats(env, worker);
    }
    catch {
        data = emptyStats(worker);
    }
    if (path === "/stats.html")
        return statsHtmlResponse(data, title);
    return statsJsonResponse(data);
}
function corsJson(data, status = 200) {
    return new Response(status === 204 ? null : JSON.stringify(data), {
        status,
        headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "content-type",
        },
    });
}
async function parseJsonBody(request) {
    const text = await request.text();
    if (!text)
        return {};
    if (text.length > 4000)
        return null;
    try {
        return JSON.parse(text);
    }
    catch {
        return null;
    }
}
/** POST /api/event — for navigator.sendBeacon and small CTA pings. Rejects unknown events. */
export async function handleEvent(request, env, worker) {
    if (request.method === "OPTIONS")
        return corsJson(null, 204);
    if (request.method !== "POST")
        return corsJson({ ok: false, error: "method_not_allowed" }, 405);
    const body = await parseJsonBody(request);
    if (!body)
        return corsJson({ ok: false, error: "invalid_json" }, 400);
    const event = String(body.event || "");
    if (!ALLOWED_EVENT_SET.has(event))
        return corsJson({ ok: false, error: "unknown_event" }, 400);
    // Waitlist signups must go through /api/waitlist so we can validate the email.
    if (event === "pro_waitlist_signup")
        return corsJson({ ok: false, error: "use_waitlist_endpoint" }, 400);
    const db = env.METRICS;
    if (!db)
        return corsJson({ ok: true, recorded: false }, 202);
    const kind = classifyTraffic(request);
    if (kind.class !== "human") {
        // Still record the request as excluded, but do not inflate visitor/event funnels.
        try {
            await recordVisit(env, request, { worker, route: "/api/event", skip: false });
        }
        catch { /* fail open */ }
        return corsJson({ ok: true, recorded: false }, 202);
    }
    try {
        const day = israelDay();
        const salt = await dailySalt(db, day);
        const hash = await visitorHash(salt, connectingIp(request), request.headers.get("user-agent") || "");
        if (!(await rateLimitVisitor(db, worker, day, hash, EVENT_RATE_LIMIT))) {
            return corsJson({ ok: false, error: "rate_limited" }, 429);
        }
        await bumpEvent(db, worker, day, event);
        const ref = normalizeRef(body.ref == null ? null : String(body.ref));
        if (ref) {
            await db
                .prepare("INSERT INTO referrers_daily (worker, day, host, count) VALUES (?, ?, ?, 1) ON CONFLICT(worker, day, host) DO UPDATE SET count = count + 1")
                .bind(worker, day, ref)
                .run();
        }
        if (event === "price_click") {
            const props = (body.props && typeof body.props === "object") ? body.props : {};
            const tier = String(props.tier ?? body.tier ?? "").trim().slice(0, 40);
            if (tier) {
                await db
                    .prepare("INSERT INTO event_props_daily (worker, day, event, prop, value, count) VALUES (?, ?, ?, 'tier', ?, 1) ON CONFLICT(worker, day, event, prop, value) DO UPDATE SET count = count + 1")
                    .bind(worker, day, event, tier)
                    .run();
            }
        }
        return corsJson({ ok: true }, 204);
    }
    catch {
        return corsJson({ ok: true, recorded: false }, 202);
    }
}
/** POST /api/waitlist — private email capture. Emails never appear in /stats. */
export async function handleWaitlist(request, env, worker) {
    if (request.method === "OPTIONS")
        return corsJson(null, 204);
    if (request.method !== "POST")
        return corsJson({ ok: false, error: "method_not_allowed" }, 405);
    const body = await parseJsonBody(request);
    if (!body)
        return corsJson({ ok: false, error: "invalid_json" }, 400);
    const honeypot = String(body.website || body.company || body.hp || "").trim();
    if (honeypot)
        return corsJson({ ok: true }); // pretend success
    const email = String(body.email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(email))
        return corsJson({ ok: false, error: "Enter a valid email." }, 400);
    const db = env.METRICS;
    if (!db)
        return corsJson({ ok: false, error: "Waitlist is not open yet." }, 503);
    try {
        const day = israelDay();
        const salt = await dailySalt(db, day);
        const hash = await visitorHash(salt, connectingIp(request), request.headers.get("user-agent") || "");
        if (!(await rateLimitVisitor(db, worker, day, hash, WAITLIST_RATE_LIMIT))) {
            return corsJson({ ok: false, error: "rate_limited" }, 429);
        }
        const ref = referrerHost(request, body.ref == null ? null : String(body.ref));
        const inserted = await db
            .prepare("INSERT OR IGNORE INTO waitlist (email, product, created_at, ref_host) VALUES (?, ?, ?, ?)")
            .bind(email, worker, israelNowIso(), ref)
            .run();
        const isNew = inserted?.meta?.changes === 1;
        if (isNew)
            await bumpEvent(db, worker, day, "pro_waitlist_signup");
        return corsJson({ ok: true, already: !isNew });
    }
    catch {
        return corsJson({ ok: false, error: "Could not save that just now." }, 500);
    }
}
