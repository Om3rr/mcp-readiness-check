import json
rs=[json.loads(l) for l in open('scan-results.jsonl')]
by={}
for r in rs: by[r['url'].rstrip('/')]=r
rs=list(by.values())
times=sorted(r['scannedAt'] for r in rs)
def slim(r):
    o={k:r.get(k) for k in ('url','registryName','title','description','websiteUrl','transport','legacy','ok','scannedAt')}
    if r.get('ok'):
        o.update({k:r.get(k) for k in ('score','authRequired','toolCount','contextTokens','protocolVersion')})
        o['server']={k:(r.get('server') or {}).get(k) for k in ('name','version')}
        o['issues']=r.get('issues') or []
    else: o['error']=r.get('error')
    if o.get('description'): o['description']=o['description'][:300]
    if not (r.get('ok') and not r.get('authRequired') and (r.get('toolCount') or 0)>0) and not r.get('legacy'):
        for k in ('title','description','websiteUrl','server','protocolVersion'): o.pop(k,None)
        if r.get('ok'): o['issues']=[i['id'] for i in (r.get('issues') or [])]
        if o.get('error'): o['error']=o['error'][:80]
    return {k:v for k,v in o.items() if v is not None}
c={'targets':len(rs),'open':sum(1 for r in rs if r.get('ok') and not r['authRequired'] and (r.get('toolCount') or 0)>0),
   'open0':sum(1 for r in rs if r.get('ok') and not r['authRequired'] and not (r.get('toolCount') or 0)),
   'auth':sum(1 for r in rs if r.get('ok') and r['authRequired']),'failed':sum(1 for r in rs if not r.get('ok'))}
import os
reg=len(json.load(open('registry-latest.json'))) if os.path.exists('registry-latest.json') else None
c['registryServers']=reg
out={'recorded':times[0],'recordedEnd':times[-1],
 'tool':'mcp-readiness-check src/probe.js (same probe as the hosted scanner), unauthenticated; initialize + tools/list, no tool called',
 'source':'https://registry.modelcontextprotocol.io/v0/servers?version=latest — active servers, https remotes without URL templates or required headers, deduplicated by remote URL; plus every server on the 20 Nov 2026 ranking',
 'counts':c,'servers':sorted([slim(r) for r in rs],key=lambda x:x['url'])}
json.dump(out,open('../repo/reports/registry-token-cost-2026-11-27.json','w'),separators=(',',':'),ensure_ascii=False)
print(c, out['recorded'], out['recordedEnd'])
