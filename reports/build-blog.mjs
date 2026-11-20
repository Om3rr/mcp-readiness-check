#!/usr/bin/env node
// Builds /blog/ and /blog/<slug>/ from content/blog/*.md (frontmatter: title, description, date, slug; plain markdown, no HTML).
// Safe rendering: every piece of text is HTML-escaped; links allow only http(s), mailto, relative and #anchors. Empty-safe.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { PAGE_CSS, PAGE_NAV, PAGE_FOOT, ogTags } from '../worker/src/pages.js';

const SITE = process.env.SITE_URL || 'https://mcp-readiness.omer20sh.workers.dev';
const DIR = 'content/blog';
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeHref = (u) => (/^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(u) ? u : '#');

export function inline(text) {
  // Pull out code spans first so nothing inside them is formatted.
  const codes = [];
  let s = String(text).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  const links = [];
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => `\u0001${links.push([label, href]) - 1}\u0001`);
  s = esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/\u0001(\d+)\u0001/g, (_, i) => { const [label, href] = links[i]; return `<a href="${esc(safeHref(href))}">${inline(label)}</a>`; });
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[i])}</code>`);
}

export function slugify(t) { return String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

export function renderMarkdown(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = []; let i = 0; let h1 = null;
  const isBlockStart = (l) => /^(#{1,6} |```|> |[-*] |\d+\. |\|)/.test(l) || l.trim() === '';
  while (i < lines.length) {
    const l = lines[i];
    if (l.trim() === '') { i++; continue; }
    if (l.startsWith('```')) {
      const lang = l.slice(3).trim(); const buf = []; i++;
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
      i++;
      out.push(`<pre${lang ? ` data-lang="${esc(lang)}"` : ''}><code>${esc(buf.join('\n'))}</code></pre>`); continue;
    }
    const h = l.match(/^(#{1,6}) (.*)$/);
    if (h) {
      const lvl = h[1].length; const txt = h[2].trim();
      if (lvl === 1) { if (h1 === null) h1 = txt; else out.push(`<h2 id="${slugify(txt)}">${inline(txt)}</h2>`); }
      else out.push(`<h${lvl} id="${slugify(txt)}">${inline(txt)}</h${lvl}>`);
      i++; continue;
    }
    if (l.startsWith('> ') || l === '>') {
      const buf = []; while (i < lines.length && (lines[i].startsWith('> ') || lines[i] === '>')) buf.push(lines[i++].replace(/^> ?/, ''));
      out.push(`<blockquote>${renderMarkdown(buf.join('\n')).html}</blockquote>`); continue;
    }
    if (/^\|/.test(l)) {
      const rows = []; while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(rows[0]); const body = rows.slice(/^\|[\s:|-]+\|?$/.test(rows[1] || '') ? 2 : 1).map(cells);
      out.push(`<div class="tablewrap"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`); continue;
    }
    const ul = /^[-*] /; const ol = /^\d+\. /;
    if (ul.test(l) || ol.test(l)) {
      const re = ul.test(l) ? ul : ol; const tag = re === ul ? 'ul' : 'ol'; const items = [];
      while (i < lines.length && (re.test(lines[i]) || (/^ {2,}\S/.test(lines[i]) && items.length))) {
        if (re.test(lines[i])) items.push(lines[i].replace(re, '')); else items[items.length - 1] += ' ' + lines[i].trim();
        i++;
      }
      out.push(`<${tag}>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</${tag}>`); continue;
    }
    const buf = []; while (i < lines.length && !isBlockStart(lines[i])) buf.push(lines[i++]);
    if (!buf.length) buf.push(lines[i++]);
    out.push(`<p>${buf.map(inline).join('<br>')}</p>`);
  }
  return { html: out.join('\n'), h1 };
}

export function parseFront(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/);
  const meta = {};
  if (m) for (const line of m[1].split('\n')) { const k = line.match(/^([a-z_]+):\s*(.*)$/i); if (k) meta[k[1]] = k[2].replace(/^"(.*)"$/, '$1').replace(/\\"/g, '"'); }
  return { meta, body: m ? src.slice(m[0].length) : src };
}

// FAQ section: "## FAQ" followed by "**Question?**" lines, each answered by the following lines.
export function extractFaq(body) {
  const m = body.match(/^## FAQ[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
  if (!m) return [];
  const qa = []; let cur = null;
  for (const line of m[1].split('\n')) {
    const q = line.match(/^\*\*(.+?)\*\*\s*$/);
    if (q) { cur = { q: q[1].trim(), a: [] }; qa.push(cur); }
    else if (cur && line.trim()) cur.a.push(line.trim());
  }
  const plain = (s) => s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[`*]/g, '');
  return qa.filter((x) => x.a.length).map((x) => ({ q: plain(x.q), a: plain(x.a.join(' ')) }));
}

export function loadPosts(dir = DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => {
    const { meta, body } = parseFront(readFileSync(`${dir}/${f}`, 'utf8'));
    const slug = slugify(meta.slug || f.replace(/\.md$/, ''));
    return { slug, title: meta.title || slug, description: meta.description || '', date: /^\d{4}-\d{2}-\d{2}$/.test(meta.date || '') ? meta.date : '', body };
  }).filter((p) => p.slug).sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.slug.localeCompare(b.slug));
}

const CSS = `${PAGE_CSS}article{max-width:760px}article p,article li{font-size:17px;line-height:1.65}article h2{margin-top:30px}article h3{margin-top:22px}blockquote{margin:16px 0;padding:10px 16px;border-left:3px solid var(--acc);background:var(--card);border-radius:8px}blockquote p{margin:6px 0}article pre{margin:12px 0}article table{min-width:560px}.post{padding:4px 0 14px;border-bottom:1px solid var(--line)}.post h2{font-size:20px;margin:12px 0 4px}`;
const head = (title, desc, url, ld) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${esc(url)}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
${ogTags(title, desc, url)}
${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : ''}
<style>${CSS}</style></head><body><div class="wrap">${PAGE_NAV}<main>`;
const foot = `</main>${PAGE_FOOT}</div><script src="/t.js" defer></script></body></html>\n`;
const dateLabel = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '');

export function build() {
  const posts = loadPosts();
  rmSync('worker/public/blog', { recursive: true, force: true });
  mkdirSync('worker/public/blog', { recursive: true });
  for (const p of posts) {
    const url = `${SITE}/blog/${p.slug}/`;
    const { html, h1 } = renderMarkdown(p.body);
    const faq = extractFaq(p.body);
    const graph = [{ '@type': 'Article', headline: p.title, description: p.description, url, mainEntityOfPage: url, ...(p.date ? { datePublished: p.date, dateModified: p.date } : {}), author: { '@type': 'Person', name: 'Omer Shacham' }, publisher: { '@type': 'Organization', name: 'MCP Readiness', url: SITE }, image: `${SITE}/og.png` }];
    graph.push({ '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'MCP Readiness', item: `${SITE}/` }, { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE}/blog/` }, { '@type': 'ListItem', position: 3, name: p.title, item: url }] });
    if (faq.length) graph.push({ '@type': 'FAQPage', mainEntity: faq.map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })) });
    mkdirSync(`worker/public/blog/${p.slug}`, { recursive: true });
    writeFileSync(`worker/public/blog/${p.slug}/index.html`, `${head(`${p.title} | MCP Readiness`, p.description, url, { '@context': 'https://schema.org', '@graph': graph })}
<p class="small"><a href="/blog/">Blog</a>${p.date ? ` · <time datetime="${esc(p.date)}">${esc(dateLabel(p.date))}</time>` : ''}</p>
<article><h1>${inline(h1 || p.title)}</h1>
${html}</article>
<div class="card"><h2>Check your own server</h2><p class="small">Free live scan, no sign-up: a score, the token cost of your tool list and the top readiness notes. Then gate every PR with the free GitHub Action.</p><div class="actions"><a class="btn" href="/?utm_source=mcp-readiness&amp;utm_medium=blog&amp;utm_campaign=${esc(p.slug)}">Scan my MCP server</a><a class="btn ghost" href="/docs/ci/">CI setup guide</a></div></div>
${foot}`);
  }
  const url = `${SITE}/blog/`;
  const desc = 'Practical guides for shipping MCP servers: OAuth discovery, testing before release, production readiness and tool-list token cost.';
  const ld = { '@context': 'https://schema.org', '@type': 'Blog', name: 'MCP Readiness blog', url, description: desc, ...(posts.length ? { blogPost: posts.map((p) => ({ '@type': 'BlogPosting', headline: p.title, url: `${SITE}/blog/${p.slug}/`, ...(p.date ? { datePublished: p.date } : {}) })) } : {}) };
  writeFileSync('worker/public/blog/index.html', `${head('MCP Readiness blog: guides for shipping MCP servers', desc, url, ld)}
<h1>Blog</h1><p class="small">${esc(desc)}</p>
${posts.length ? posts.map((p) => `<div class="post"><h2><a href="/blog/${p.slug}/">${esc(p.title)}</a></h2>${p.date ? `<p class="small"><time datetime="${esc(p.date)}">${esc(dateLabel(p.date))}</time></p>` : ''}<p class="small">${esc(p.description)}</p></div>`).join('\n') : '<p>No articles yet. Meanwhile, read the <a href="/docs/ci/">CI setup guide</a> or the <a href="/state-of-mcp-2026-11.html">State of MCP report</a>.</p>'}
${foot}`);
  writeFileSync('worker/src/blog-paths.js', `// Generated by reports/build-blog.mjs. Blog pages for the sitemap and llms.txt.\nexport const BLOG_PATHS = ${JSON.stringify(['/blog/', ...posts.map((p) => `/blog/${p.slug}/`)])};\nexport const BLOG_POSTS = ${JSON.stringify(posts.map((p) => ({ path: `/blog/${p.slug}/`, title: p.title, description: p.description })))};\n`);
  return posts;
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(`wrote ${build().length} blog posts`);
