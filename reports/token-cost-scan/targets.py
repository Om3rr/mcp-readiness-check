import json
d=json.load(open('registry-latest.json'))
lat=[s for s in d if (s.get('_meta',{}).get('io.modelcontextprotocol.registry/official',{}) or {}).get('isLatest')]
urls={}
for s in lat:
    m=s['_meta']['io.modelcontextprotocol.registry/official']
    if m.get('status')!='active': continue
    for r in s['server'].get('remotes') or []:
        u=r.get('url','').strip()
        if '{' in u or not u.startswith('https://'): continue
        if any(h.get('isRequired') for h in r.get('headers') or []): continue
        k=u.rstrip('/')
        if k in urls: continue
        sv=s['server']
        urls[k]={'url':u,'registryName':sv['name'],'title':sv.get('title'),'description':sv.get('description'),'websiteUrl':sv.get('websiteUrl'),'transport':r.get('type'),'repository':(sv.get('repository') or {}).get('url')}
old=json.load(open('../repo/reports/popular-remote-servers-2026-11-20.json'))
exp=json.load(open('../repo/data/mcp-servers.json'))
for x in old['results']+old.get('failed',[])+exp:
    k=x['url'].rstrip('/')
    urls.setdefault(k,{'url':x['url'],'registryName':None,'title':x['name'],'transport':None})
    urls[k]['legacy']=True
json.dump(list(urls.values()),open('targets.json','w'))
print(len(urls))
