"""Write an HTML preview of math_parsed.pkl (for checking the parse by eye)."""
import html, os, pickle, sys
out = sys.argv[1]
res, assets = pickle.load(open('math_parsed.pkl', 'rb'))
for name, data in assets.items():
    os.makedirs(os.path.join(out, os.path.dirname(name)), exist_ok=True)
    open(os.path.join(out, name), 'wb').write(data)
def blk(b):
    if b['type'] == 'figure': return f'<img class="fig" src="{b["src"]}" style="width:{b["width"]/9:.2f}em">'
    if b['type'] == 'table':
        return '<table>' + ''.join('<tr>' + ''.join(f'<td{" class=h" if c.get("header") else ""}>{c["html"]}</td>' for c in r) + '</tr>' for r in b['rows']) + '</table>'
    return f'<p class="{"center" if b.get("center") else ""}">{b["html"]}</p>'
parts = []
for s, q, iss in res:
    if not q: parts.append(f'<section><h2>page {s+1} FAILED {iss}</h2></section>'); continue
    a = q.get('answers')
    ans = q['answer'] or (f"line={a['line']} | rat={a['rationale']} | ex={a['examples']}" if isinstance(a, dict) else ', '.join(a or []))
    parts.append(f'''<section><h2>p{s+1} · {q["id"]} · {html.escape(q["skill"])} · {q["difficulty"]} · {q["type"]} {iss}</h2>
    {''.join(blk(b) for b in q["stimulus"])}<p class=stem>{q["stem"]}</p>
    <ol type=A>{''.join(f"<li>{c['html']}</li>" for c in q["choices"])}</ol><p><b>Answer: {ans}</b></p>
    {''.join(f"<p class=r>{p}</p>" for p in q["rationale"]["paragraphs"])}</section>''')
open(os.path.join(out, 'index.html'), 'w').write('''<!doctype html><meta charset=utf-8><style>
body{font:18px/1.6 Lato,Helvetica,sans-serif;max-width:760px;margin:20px auto;color:#21242c}
section{border-bottom:3px solid #1865f2;padding:10px 0 20px}h2{font-size:13px;color:#888}
img.fig{display:block;max-width:100%;margin:10px auto}.center{text-align:center}.mblock{display:block;text-align:center;margin:6px 0}
table{border-collapse:collapse;margin:10px auto}td{border:1px solid #999;padding:4px 10px}td.h{font-weight:bold}.r{font-size:15px;color:#444}
.mtable{border-collapse:collapse;margin:8px auto}.mtable td{border:1px solid #999;padding:4px 10px}
</style>''' + ''.join(parts))
print('wrote', len(res))
