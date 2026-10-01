import fitz, json, os
STY={'C9760':'','C9762':'','C9758':'B','C9795':'I','C10917':'BI','OpenSans-Regular':'F'}
def openpdf():
    d=fitz.open(os.environ.get('CBQB_PDF', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'questionbank-export.pdf')))
    fc=json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fontcluster.json')))
    for x,c in fc.items(): d.xref_set_key(int(x),'Name',f'/C{c}')
    return d
def dump(d,i):
    p=d[i]; out=[]
    for b in p.get_text('dict')['blocks']:
        if b['type']!=0: continue
        for l in b['lines']:
            t=''
            for s in l['spans']:
                st=STY.get(s['font'],'?')
                t+= f'<{st}>{s["text"]}</{st}>' if st else s['text']
            out.append((round(l['bbox'][1],1),round(l['bbox'][0],1),round(l['bbox'][2],1),t))
    out.sort()
    return out
