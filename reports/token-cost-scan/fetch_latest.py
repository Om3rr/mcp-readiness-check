import json, urllib.request, urllib.parse, time
out=[]; cursor=None; pages=0
while True:
    q={'limit':'100','version':'latest'}
    if cursor: q['cursor']=cursor
    url='https://registry.modelcontextprotocol.io/v0/servers?'+urllib.parse.urlencode(q)
    for a in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'mcp-readiness-check'}),timeout=60) as r:
                d=json.load(r); break
        except Exception as e:
            print('retry',a,e,flush=True); time.sleep(3)
    else: raise SystemExit('failed')
    out+=d.get('servers',[]); pages+=1
    cursor=(d.get('metadata') or {}).get('nextCursor')
    if pages%10==0: print(pages,len(out),flush=True)
    if not cursor: break
json.dump(out,open('registry-latest.json','w'))
print('done',len(out), pages)
