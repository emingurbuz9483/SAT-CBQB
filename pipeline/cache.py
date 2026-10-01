import sys, pickle
from common import openpdf
from multiprocessing import Pool
def work(rng):
    d=openpdf(); out={}
    for i in range(*rng):
        p=d[i]
        raw=p.get_text('rawdict')
        lines=[]
        for b in raw['blocks']:
            if b['type']!=0: continue
            for l in b['lines']:
                lines.append({'bbox':l['bbox'],'spans':[{'font':s['font'],'size':s['size'],'origin':s['origin'],'chars':[(c['c'],c['bbox'],c['origin']) for c in s['chars']]} for s in l['spans']]})
        dr=[(x['type'],tuple(x['rect']),x.get('fill'),x.get('color'),x.get('width'),len(x['items']),[it[0] for it in x['items']][:6]) for x in p.get_drawings()]
        imgs=p.get_images()
        out[i]={'lines':lines,'draw':dr,'imgs':len(imgs),'size':(p.rect.width,p.rect.height)}
    pickle.dump(out,open(f'cache/{rng[0]:05d}.pkl','wb'))
    return rng
if __name__=='__main__':
    import fitz
    import os; os.makedirs('cache', exist_ok=True)
    n=fitz.open(os.environ.get('CBQB_PDF', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'questionbank-export.pdf'))).page_count
    rngs=[(a,min(a+50,n)) for a in range(0,n,50)]
    with Pool(8) as P:
        for r in P.imap_unordered(work,rngs): print('done',r,flush=True)
