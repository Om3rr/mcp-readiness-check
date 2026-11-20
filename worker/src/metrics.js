/** Privacy-preserving traffic counters for the studio Workers (D1 `studio-metrics`). */
export const WORKER_TZ = "Asia/Jerusalem";
const BOT_RE = /bot|crawler|spider|crawling|slurp|bingpreview|facebookexternalhit|facebot|pingdom|uptimerobot|healthcheck|kube-probe|lighthouse|pagespeed|headlesschrome|whatsapp|telegram|discordbot|embedly|linkedinbot|twitterbot|applebot|yandex|duckduckbot|baiduspider|semrush|ahrefs|mj12bot|dotbot|gptbot|claudebot|chatgpt|amazonbot|bytespider|petalsearch|cf-health|cloudflare-traffic-manager|monitor|preview-block|statuscake|site24x7/i;
const SKIP_ROUTES = new Set(["/api/health", "/favicon.ico", "/robots.txt", "/stats", "/stats.html", "/stats.json"]);
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
export function isBot(request) {
    const ua = request.headers.get("user-agent") || "";
    if (!ua.trim())
        return false;
    return BOT_RE.test(ua);
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
export function referrerHost(request) {
    const raw = request.headers.get("referer") || request.headers.get("referrer") || "";
    if (!raw)
        return null;
    try {
        const host = new URL(raw).host.toLowerCase();
        if (!host)
            return null;
        const self = new URL(request.url).host.toLowerCase();
        if (host === self)
            return null;
        return host.slice(0, 180);
    }
    catch {
        return null;
    }
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
    if (isBot(request))
        return;
    const day = israelDay();
    const worker = opts.worker;
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
    const host = referrerHost(request);
    if (host) {
        await db
            .prepare("INSERT INTO referrers_daily (worker, day, host, count) VALUES (?, ?, ?, 1) ON CONFLICT(worker, day, host) DO UPDATE SET count = count + 1")
            .bind(worker, day, host)
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
    totals: { requests: 0, unique_visitors: 0, scans: { success: 0, fail: 0 }, badge_hits: 0 },
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
              IFNULL(b.count, 0) AS badge_hits
       FROM (SELECT day, SUM(count) AS requests FROM requests_daily WHERE worker = ? AND day >= ? GROUP BY day) r
       LEFT JOIN uniques_daily u ON u.worker = ? AND u.day = r.day
       LEFT JOIN scans_daily s ON s.worker = ? AND s.day = r.day
       LEFT JOIN badges_daily b ON b.worker = ? AND b.day = r.day
       ORDER BY r.day ASC`)
        .bind(worker, since, worker, worker, worker)
        .all();
    out.daily = (dailyRows.results || []).map((row) => ({
        day: String(row.day),
        requests: Number(row.requests) || 0,
        unique_visitors: Number(row.unique_visitors) || 0,
        scans_success: Number(row.scans_success) || 0,
        scans_fail: Number(row.scans_fail) || 0,
        badge_hits: Number(row.badge_hits) || 0,
    }));
    for (const row of out.daily) {
        out.totals.requests += row.requests;
        out.totals.unique_visitors += row.unique_visitors;
        out.totals.scans.success += row.scans_success;
        out.totals.scans.fail += row.scans_fail;
        out.totals.badge_hits += row.badge_hits;
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
function esc(s) {
    return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] || c);
}
export function statsHtmlResponse(data, title) {
    const dailyRows = data.daily
        .slice()
        .reverse()
        .map((d) => `<tr><td>${esc(d.day)}</td><td>${d.requests}</td><td>${d.unique_visitors}</td><td>${d.scans_success}</td><td>${d.scans_fail}</td><td>${d.badge_hits}</td></tr>`)
        .join("") || `<tr><td colspan="6">No traffic recorded in the last 30 days yet.</td></tr>`;
    const routeRows = data.routes.map((r) => `<tr><td><code>${esc(r.route)}</code></td><td>${r.count}</td></tr>`).join("") ||
        `<tr><td colspan="2">None yet.</td></tr>`;
    const refRows = data.top_referrers.map((r) => `<tr><td>${esc(r.host)}</td><td>${r.count}</td></tr>`).join("") ||
        `<tr><td colspan="2">None yet.</td></tr>`;
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${esc(title)} — traffic (last 30 days)</title>
  <style>
    :root { color-scheme: light; }
    body { font: 16px/1.5 ui-sans-serif, system-ui, sans-serif; max-width: 880px; margin: 40px auto; padding: 0 20px; color: #0f172a; }
    h1 { font-size: 1.5rem; margin: 0 0 8px; }
    p.meta { color: #475569; margin: 0 0 24px; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin: 0 0 28px; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; }
    .card .n { font-size: 1.6rem; font-weight: 700; }
    .card .l { color: #475569; font-size: 0.85rem; }
    table { width: 100%; border-collapse: collapse; margin: 0 0 28px; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
    th { font-size: 0.8rem; text-transform: uppercase; letter-spacing: .04em; color: #475569; }
    code { font-family: ui-monospace, SFMono-Regular, monospace; font-size: .9em; }
    a { color: #1d4ed8; }
  </style>
</head>
<body>
  <h1>${esc(title)}</h1>
  <p class="meta">Public, privacy-preserving totals for the last ${data.window_days} days.
    Timezone: Israel time (${esc(data.timezone)}). Generated ${esc(data.generated_at)}.
    No IP addresses or other personal data are stored on this page.
    JSON: <a href="/stats">/stats</a>.</p>
  <div class="cards">
    <div class="card"><div class="n">${data.totals.requests}</div><div class="l">Requests</div></div>
    <div class="card"><div class="n">${data.totals.unique_visitors}</div><div class="l">Unique visitors</div></div>
    <div class="card"><div class="n">${data.totals.scans.success}</div><div class="l">Scans succeeded</div></div>
    <div class="card"><div class="n">${data.totals.scans.fail}</div><div class="l">Scans failed</div></div>
    <div class="card"><div class="n">${data.totals.badge_hits}</div><div class="l">Badge hits</div></div>
  </div>
  <h2>Daily</h2>
  <table>
    <thead><tr><th>Day</th><th>Requests</th><th>Uniques</th><th>Scans ok</th><th>Scans fail</th><th>Badges</th></tr></thead>
    <tbody>${dailyRows}</tbody>
  </table>
  <h2>Routes</h2>
  <table>
    <thead><tr><th>Route</th><th>Requests</th></tr></thead>
    <tbody>${routeRows}</tbody>
  </table>
  <h2>Top referrers (host only)</h2>
  <table>
    <thead><tr><th>Host</th><th>Hits</th></tr></thead>
    <tbody>${refRows}</tbody>
  </table>
</body>
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
