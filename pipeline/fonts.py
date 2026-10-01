import fitz, re, collections, json, hashlib, pickle, os
d=fitz.open(os.environ.get('CBQB_PDF', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'questionbank-export.pdf')))
fonts={}; h={}
for i in range(d.page_count):
    for f in d[i].get_fonts():
        x=f[0]
        if x in fonts: continue
        cp=d.xref_get_key(x,'CharProcs')[1]
        gl=[]
        for g,px in re.findall(r'/(g[0-9A-Fa-f]+) (\d+) 0 R',cp):
            px=int(px)
            if px not in h:
                s=d.xref_stream(px) or b''
                h[px]=(hashlib.sha1(s).hexdigest()[:16],len(s))
            gl.append((g,)+h[px])
        fonts[x]=gl

parent={x:x for x in fonts}
def find(a):
    while parent[a]!=a: parent[a]=parent[parent[a]]; a=parent[a]
    return a
owner={}
for x,gl in fonts.items():
    for g,hh,n in gl:
        if n<80: continue
        k=(g,hh)
        if k in owner: parent[find(x)]=find(owner[k])
        else: owner[k]=x
cl=collections.defaultdict(list)
for x in fonts: cl[find(x)].append(x)
print('clusters',len(cl))
for r,m in sorted(cl.items(),key=lambda t:-len(t[1]))[:30]:
    gids=set(g for x in m for g,_,_ in fonts[x])
    print(r,len(m),'glyphs',len(gids), sorted(gids)[:6])
json.dump({str(x):find(x) for x in fonts},open('fontcluster.json','w'))
