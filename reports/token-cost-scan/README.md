# Token-cost re-scan (27 Nov 2026)

Run from a working directory next to the repo checkout (`../repo`):

1. `python3 fetch_latest.py` — every server in the official MCP Registry (`/v0/servers?version=latest`).
2. `python3 targets.py` — active servers with https remotes, no URL templates, no required headers; dedupe by remote URL; add the servers from the 20 Nov ranking.
3. `node scan.mjs targets.json scan-results.jsonl` — unauthenticated `initialize` + `tools/list` with `src/probe.js` (no tool is called), 64 at a time.
4. `python3 assemble.py && gzip -9 ../repo/reports/registry-token-cost-2026-11-27.json` — writes `reports/registry-token-cost-2026-11-27.json.gz` (every scanned endpoint; about 28 MB unzipped).
5. `node reports/build-token-cost-pages.mjs` (in the repo) — pages, hubs, sitemap paths, llms.txt.

`legacy.mjs` produced `reports/token-cost-2026-11-20.json` (the numbers behind the pages before this re-scan, used for the "changed since last scan" delta).
