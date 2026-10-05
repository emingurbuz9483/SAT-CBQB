"""math_all.pkl (from math_parse.py) -> data/math/ (questions.json, index.json, sprites/, figures/).

Each question's inline math is packed into one grayscale sprite (data/math/sprites/<id>.png) and
written as <span class="m"> elements sized in em, so a question costs one image request.
"""
import collections, io, json, os, pickle, re, shutil
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'data', 'math')
PX_PER_EM = 4 * 9.0          # math_parse renders at 4 px/pt; body text is 9 pt

ORDER = [
    ('Algebra', ['Linear equations in one variable', 'Linear functions', 'Linear equations in two variables',
                 'Systems of two linear equations in two variables', 'Linear inequalities in one or two variables']),
    ('Advanced Math', ['Nonlinear functions', 'Nonlinear equations in one variable and systems of equations in two variables',
                       'Equivalent expressions']),
    ('Problem-Solving and Data Analysis', ['Ratios, rates, proportional relationships, and units', 'Percentages',
                                           'One-variable data: Distributions and measures of center and spread',
                                           'Two-variable data: Models and scatterplots', 'Probability and conditional probability',
                                           'Inference from sample statistics and margin of error',
                                           'Evaluating statistical claims: Observational studies and experiments']),
    ('Geometry and Trigonometry', ['Area and volume', 'Lines, angles, and triangles', 'Right triangles and trigonometry', 'Circles']),
]
DIFF = ['Easy', 'Medium', 'Hard']

# The source PDF's rationale names the wrong letter for these two (the "Correct Answer" line and the math agree).
FIXES = {
    'bf5f80c6': [('Choice D is correct', 'Choice A is correct'), ('Choices A, B, and C are incorrect', 'Choices B, C, and D are incorrect')],
    '1e11190a': [('Choice C is correct', 'Choice B is correct'), ('Choices A and B are incorrect', 'Choices A and C are incorrect')],
}
LEAD = r'Choices? ([A-D](?:,? (?:and |or )?[A-D])*),? (?:is|are) '
NUM = re.compile(r'^-?(\d+(\.\d*)?|\.\d+)(/\d+)?$')
IMG = re.compile(r'<img class="m" src="([^"]+)" alt="" style="width:[^;]+;height:[^;]+;vertical-align:([^"]+)">')

def by_choice(pars):
    by = {}
    for p in pars:
        for seg in re.split(r'(?=' + LEAD.replace('(', '(?:', 1) + r')', p):
            m = re.match(LEAD, seg)
            if m:
                for L in re.findall(r'[A-D]', m.group(1)): by[L] = (by.get(L, '') + ' ' + seg.strip()).strip()
    return by

def answer_list(a):
    srcs = [a.get('line'), a.get('examples')]
    if not any(s and '<' not in s for s in srcs): srcs.append(a.get('rationale'))
    out = []
    for s in srcs:
        if not s or '<' in s: continue
        for t in re.split(r',|\bor\b|\band\b|\beither\b', s):
            t = t.strip().rstrip('.').replace('−', '-').replace(' ', '')
            if t and NUM.match(t) and t not in out: out.append(t)
    return out

def all_html(q):
    yield q['stem']
    for b in q['stimulus']:
        if 'html' in b: yield b['html']
        for r in b.get('rows', []):
            for c in r: yield c['html']
    for c in q['choices']: yield c['html']
    yield from q['rationale']['paragraphs']
    yield from q['rationale']['byChoice'].values()

def main():
    res, assets = pickle.load(open(os.path.join(HERE, 'math_all.pkl'), 'rb'))
    if os.path.isdir(OUT): shutil.rmtree(OUT)
    for d in ('sprites', 'figures'): os.makedirs(os.path.join(OUT, d))
    rank = {(dom, sk): (i, j) for i, (dom, sks) in enumerate(ORDER) for j, sk in enumerate(sks)}
    qs = [q for _, q, _ in res]
    unknown = {(q['domain'], q['skill']) for q in qs} - set(rank)
    assert not unknown, unknown
    qs.sort(key=lambda q: (rank[(q['domain'], q['skill'])], DIFF.index(q['difficulty'])))
    figs_used = set(); total = 0
    for q in qs:
        if q['id'] in FIXES:
            for old, new in FIXES[q['id']]:
                assert any(old in p for p in q['rationale']['paragraphs']), (q['id'], old)
                q['rationale']['paragraphs'] = [p.replace(old, new) for p in q['rationale']['paragraphs']]
            q['rationale']['byChoice'] = by_choice(q['rationale']['paragraphs'])
            q['notes'] = ['The source rationale named the wrong choice as correct; it was corrected to match the answer key.']
        if 'Math output error' in json.dumps(q):
            q.setdefault('notes', []).append('Some math is missing from this question in the College Board source (shown as “Math output error”).')
        if q['type'] == 'spr':
            q['answers'] = answer_list(q['answers'])
            assert q['answers'], q['id']
        else:
            q.pop('answers', None)
            assert q['answer'] and q['answer'] in 'ABCD', q['id']
        for b in q['stimulus']:
            b.pop('_bb', None)
            if b['type'] == 'figure':
                figs_used.add(b['src']); b['src'] = 'math/' + b['src']
        # ---- one sprite per question
        srcs = []
        for h in all_html(q):
            for m in IMG.finditer(h):
                if m.group(1) not in srcs: srcs.append(m.group(1))
        place = {}; sw = 0
        if srcs:
            ims = [Image.open(io.BytesIO(assets[s])).convert('L') for s in srcs]
            W = max(i.width for i in ims); H = sum(i.height + 2 for i in ims)
            sheet = Image.new('L', (W, H), 255); y = 0
            for s, im in zip(srcs, ims):
                sheet.paste(im, (0, y)); place[s] = (y, im.width, im.height); y += im.height + 2
            path = os.path.join(OUT, 'sprites', f'{q["id"]}.png')
            sheet.save(path, optimize=True); total += os.path.getsize(path)
            sw = W / PX_PER_EM
        url = f'data/math/sprites/{q["id"]}.png'
        f = lambda v: (f'{v / PX_PER_EM:.4f}'.rstrip('0').rstrip('.') or '0') + 'em'
        def sub(m):
            y, w, h = place[m.group(1)]
            return (f'<span class="m" style="width:{f(w)};height:{f(h)};vertical-align:{m.group(2)};'
                    f'background-image:url({url});background-size:{sw:.4f}em auto;background-position:0 -{f(y)}"></span>')
        def fix(h):
            h = IMG.sub(sub, h)
            for m in re.finditer(r'src="(figures/[^"]+)"', h): figs_used.add(m.group(1))
            return h.replace('src="figures/', 'src="data/math/figures/')
        q['stem'] = fix(q['stem'])
        for b in q['stimulus']:
            if 'html' in b: b['html'] = fix(b['html'])
            for r in b.get('rows', []):
                for c in r: c['html'] = fix(c['html'])
        for c in q['choices']: c['html'] = fix(c['html'])
        q['rationale']['paragraphs'] = [fix(p) for p in q['rationale']['paragraphs']]
        q['rationale']['byChoice'] = {k: fix(v) for k, v in q['rationale']['byChoice'].items()}
        assert not any('<img class="m"' in h for h in all_html(q)), q['id']
    for name in figs_used:
        open(os.path.join(OUT, name), 'wb').write(assets[name])
    json.dump(qs, open(os.path.join(OUT, 'questions.json'), 'w'), ensure_ascii=False, indent=1)
    index = {}
    for q in qs:
        index.setdefault(q['domain'], {}).setdefault(q['skill'], {d: [] for d in DIFF})[q['difficulty']].append(q['id'])
    json.dump(index, open(os.path.join(OUT, 'index.json'), 'w'), ensure_ascii=False, indent=1)
    print(f'{len(qs)} questions ({sum(q["type"] == "spr" for q in qs)} grid-in), {len(figs_used)} figures, sprites {total / 1e6:.1f} MB')

if __name__ == '__main__':
    main()
