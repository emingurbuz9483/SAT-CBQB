"""CBQB Math PDF export -> parsed questions (math_parsed.pkl), then math_export.py writes data/math/.

Text in the export is real (Type3) text, but every piece of math is either a small raster image
(older questions) or vector glyph outlines (newer questions). Math is therefore cut out of a
text-free copy of the page as a high-resolution PNG and placed inline; graphs become figures and
ruled grids whose cells hold text become HTML tables.

    CBQB_MATH_PDF=/path/export.pdf python3 math_parse.py [first-page-of-question ...]
"""
import collections, hashlib, html, os, pickle, re, sys
from multiprocessing import Pool
import pymupdf

PDF = os.environ.get('CBQB_MATH_PDF', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'math-export.pdf'))
EM = 9.0            # body font size (pt); inline images are sized in em so they scale with the text
RIGHT = 594.5       # right edge of the text area
ZOOM_MATH = 4       # render scale for inline math (pt -> px)
ZOOM_FIG = 3        # render scale for figures

# ---------------------------------------------------------------- page model
class Ch:
    __slots__ = ('c', 'x0', 'y0', 'x1', 'y1', 'oy', 'fig', 'vs', 'sz')
    def __init__(s, c, bb, oy, fig=False, sz=1.0):
        s.c = c; s.x0, s.y0, s.x1, s.y1 = bb; s.oy = oy; s.fig = fig; s.vs = ''; s.sz = sz
    @property
    def cx(s): return (s.x0 + s.x1) / 2
    @property
    def cy(s): return (s.y0 + s.y1) / 2

class Ink:
    """A run of math: glyph outlines clustered into one expression, or one raster image."""
    __slots__ = ('x0', 'y0', 'x1', 'y1', 'parts', 'img')
    c = None
    def __init__(s, r, img=False):
        s.x0, s.y0, s.x1, s.y1 = r; s.parts = [tuple(r)]; s.img = img
    @property
    def cx(s): return (s.x0 + s.x1) / 2
    @property
    def cy(s): return (s.y0 + s.y1) / 2
    def add(s, o):
        s.x0 = min(s.x0, o.x0); s.y0 = min(s.y0, o.y0); s.x1 = max(s.x1, o.x1); s.y1 = max(s.y1, o.y1)
        s.parts += o.parts; s.img = s.img or o.img

def overlap(a0, a1, b0, b1): return min(a1, b1) - max(a0, b0)
def near(a, b, g): return not (a[2] + g < b[0] or b[2] + g < a[0] or a[3] + g < b[1] or b[3] + g < a[1])
def union(a, b): return (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))
def box(t): return (t.x0, t.y0, t.x1, t.y1)
def inside(x, y, b, pad=1): return b[0] - pad <= x <= b[2] + pad and b[1] - pad <= y <= b[3] + pad

def bbox_of(rs):
    b = rs[0]
    for r in rs[1:]: b = union(b, r)
    return b

def components(rects, gap):
    parent = list(range(len(rects)))
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]; i = parent[i]
        return i
    order = sorted(range(len(rects)), key=lambda i: rects[i][0])
    for a, i in enumerate(order):
        for j in order[a + 1:]:
            if rects[j][0] > rects[i][2] + gap: break
            if near(rects[i], rects[j], gap): parent[find(i)] = find(j)
    groups = collections.defaultdict(list)
    for i in range(len(rects)): groups[find(i)].append(rects[i])
    return list(groups.values())

def load_page(doc, pno):
    p = doc[pno]
    chars = []
    for b in p.get_text('rawdict')['blocks']:
        if b['type'] != 0: continue
        for l in b['lines']:
            for s in l['spans']:
                fig = 'OpenSans' in s['font']
                for c in s['chars']:
                    ch = c['c']; bb = c['bbox']
                    if ch in ' \xa0' and not fig and (bb[2] - bb[0]) < 0.45: continue   # kerning "space" (repor ting)
                    if ch == '\xa0': ch = ' '
                    chars.append(Ch(ch, bb, c['origin'][1], fig, s['size']))
    # drawings that are not pieces of Type3 text glyphs
    buckets = collections.defaultdict(list)
    for ch in chars:
        if ch.c.isspace() or ch.fig: continue
        for k in range(int(ch.y0 // 10), int(ch.y1 // 10) + 1): buckets[k].append(ch)
    draws = []
    for dr in p.get_drawings():
        r = dr['rect']
        if r.width < 0.05 and r.height < 0.05: continue
        f = dr.get('fill')
        if f == (1.0, 1.0, 1.0) and not dr.get('color'): continue     # white backgrounds
        if f and len(f) == 3 and f[0] > 0.8 and f[1] > 0.8 and f[2] < 0.5: continue   # yellow "Math output error" highlights
        if r.width <= 14 and r.height <= 16 and any(
                c.x0 - 3.5 <= r.x0 and r.x1 <= c.x1 + 3.5 and c.y0 - .7 <= r.y0 and r.y1 <= c.y1 + .7
                for c in buckets.get(int(((r.y0 + r.y1) / 2) // 10), ())):
            continue
        draws.append({'r': (r.x0, r.y0, r.x1, r.y1), 'items': len(dr['items'])})
    imgs = [tuple(i['bbox']) for i in p.get_image_info() if i['bbox'][2] - i['bbox'][0] > 1]
    return chars, draws, imgs

# ---------------------------------------------------------------- tables
def is_rule(r):
    w, h = r[2] - r[0], r[3] - r[1]
    return (h <= 2.0 and w > 3) or (w <= 2.0 and h > 3)

def grid_of(rules):
    H = [r for r in rules if r[3] - r[1] <= 2.0]; V = [r for r in rules if r[2] - r[0] <= 2.0]
    def uniq(vals, tol=2.0):
        out = []
        for v in sorted(vals):
            if not out or v - out[-1] > tol: out.append(v)
        return out
    return H, V, uniq([(r[0] + r[2]) / 2 for r in V]), uniq([(r[1] + r[3]) / 2 for r in H])

def build_table(rules, toks):
    H, V, xs, ys = grid_of(rules)
    if len(ys) < 2 or len(xs) < 2 or len(V) < 2: return None
    def covered(segs, a, b):
        # borders are often drawn one cell at a time: joined segments count as one line
        pos = a + 2
        for s0, s1 in sorted(segs):
            if s0 > pos + 1.5: break
            pos = max(pos, s1)
        return pos >= b - 2
    def has_v(x, ya, yb): return covered([(r[1], r[3]) for r in V if abs((r[0] + r[2]) / 2 - x) < 2], ya, yb)
    def has_h(y, xa, xb): return covered([(r[0], r[2]) for r in H if abs((r[1] + r[3]) / 2 - y) < 2], xa, xb)
    R, C = len(ys) - 1, len(xs) - 1
    if C > 12 or R > 30: return None
    owner = [[None] * C for _ in range(R)]; cells = []
    for i in range(R):
        for j in range(C):
            if owner[i][j] is not None: continue
            cs = 1
            while j + cs < C and not has_v(xs[j + cs], ys[i], ys[i + 1]): cs += 1
            rs = 1
            while i + rs < R and not has_h(ys[i + rs], xs[j], xs[j + cs]): rs += 1
            cell = {'r': i, 'c': j, 'rowspan': rs, 'colspan': cs, 'box': (xs[j], ys[i], xs[j + cs], ys[i + rs]), 'toks': []}
            for a in range(i, i + rs):
                for b in range(j, j + cs): owner[a][b] = cell
            cells.append(cell)
    lost = 0
    for t in toks:
        for cell in cells:
            if inside(t.cx, t.cy, cell['box']):
                cell['toks'].append(t); break
        else:
            if t.c is None or not t.c.isspace(): lost += 1
    filled = sum(1 for c in cells if any(t.c is None or not t.c.isspace() for t in c['toks']))
    if filled < 0.6 * len(cells) or lost > 2: return None    # mostly empty grid: a graph, not a table
    return cells, R, C

# ---------------------------------------------------------------- rows
def cluster_ink(inks, chars):
    """Glyph outlines that belong to one expression become one Ink (fractions, exponents, radicals)."""
    textboxes = [c for c in chars if not c.c.isspace()]
    def blocked(a, b):
        lo, hi = (a, b) if a.x0 <= b.x0 else (b, a)
        if hi.x0 - lo.x1 <= 0.3: return False
        top, bot = max(lo.y0, hi.y0) - 2, min(lo.y1, hi.y1) + 2
        return any(lo.x1 - 0.3 < c.cx < hi.x0 + 0.3 and overlap(c.y0, c.y1, top, bot) > 0 for c in textboxes)
    def stacked(a, b):
        # one above the other only joins across a fraction bar (or radical overline) between them
        top, bot = (a, b) if a.y0 <= b.y0 else (b, a)
        lo, hi = top.y1 - 1.5, bot.y0 + 1.5
        return any(p[3] - p[1] <= 1.6 and p[2] - p[0] >= 3 and p[1] >= lo and p[3] <= hi for p in a.parts + b.parts)
    inks = sorted(inks, key=lambda k: k.x0)
    changed = True
    while changed:
        changed = False; out = []
        for k in inks:
            for o in out:
                if o.img or k.img: continue                       # raster images are whole expressions already
                vg = max(k.y0 - o.y1, o.y0 - k.y1)
                if max(k.x0 - o.x1, o.x0 - k.x1) <= 4.5 and vg <= 3.2 and not blocked(o, k) and (vg <= 0 or stacked(o, k)):
                    o.add(k); changed = True; break
            else:
                out.append(k)
        inks = out
    return inks

def make_rows(chars, inks, page):
    # superscripts/subscripts set in a smaller text size join the nearest line
    small = [c for c in chars if c.sz < 0.8]
    chars = [c for c in chars if not c.sz < 0.8]
    rows = []
    for ch in sorted(chars, key=lambda c: c.oy):
        for r in rows[-3:]:
            if abs(r['oy'] - ch.oy) < 2.2:
                r['toks'].append(ch); break
        else:
            rows.append({'oy': ch.oy, 'toks': [ch]})
    for ch in small:
        cand = [r for r in rows if abs(r['oy'] - ch.oy) < 6.5]
        if cand:
            r = min(cand, key=lambda r: abs(r['oy'] - ch.oy)); r['toks'].append(ch)
            if not ch.c.isspace() and ch.c not in '.,;:':
                ch.vs = 'sub' if ch.oy > r['oy'] + 0.5 else 'sup' if ch.oy < r['oy'] - 0.5 else ''
        else:
            rows.append({'oy': ch.oy, 'toks': [ch]})
    bands = []
    for r in rows:
        tb = [t for t in r['toks'] if not t.c.isspace()]
        bands.append((min(t.y0 for t in tb), max(t.y1 for t in tb)) if tb else None)
    for k in inks:
        best = None
        for r, b in zip(rows, bands):
            if b is None: continue
            ov = overlap(k.y0, k.y1, b[0], b[1])
            if ov > 0.35 * min(b[1] - b[0], k.y1 - k.y0) or k.y0 <= r['oy'] - 3 <= k.y1:
                dist = abs(k.cy - (b[0] + b[1]) / 2)
                if best is None or dist < best[0]: best = (dist, r)
        if best: best[1]['toks'].append(k)
        else: rows.append({'oy': k.y1 - 1.5, 'toks': [k], 'mathonly': True})
    for r in rows:
        r['page'] = page
        r['toks'].sort(key=lambda t: t.x0)
        ink = [t for t in r['toks'] if t.c is None or not t.c.isspace()] or r['toks']
        r['x0'] = min(t.x0 for t in ink); r['x1'] = max(t.x1 for t in ink)
        r['y0'] = min(t.y0 for t in r['toks']); r['y1'] = max(t.y1 for t in r['toks'])
        r['text'] = ''.join(t.c if t.c is not None else '\x00' for t in r['toks']).strip()
    # math-only rows side by side on one line (a displayed equation split by wide gaps) are one row
    rows.sort(key=lambda r: (r['y0'] + r['y1']) / 2 if r.get('mathonly') else r['oy'])
    merged = []
    for r in rows:
        p = merged[-1] if merged else None
        if p is not None and r.get('mathonly') and p.get('mathonly') and overlap(r['y0'], r['y1'], p['y0'], p['y1']) > 0.5 * min(r['y1'] - r['y0'], p['y1'] - p['y0']):
            p['toks'] = sorted(p['toks'] + r['toks'], key=lambda t: t.x0)
            p['x0'] = min(p['x0'], r['x0']); p['x1'] = max(p['x1'], r['x1']); p['y0'] = min(p['y0'], r['y0']); p['y1'] = max(p['y1'], r['y1'])
            p['oy'] = max(p['oy'], r['oy'])
        else:
            merged.append(r)
    return merged

# ---------------------------------------------------------------- rendering
class Renderer:
    def __init__(s, doc):
        s.doc = doc; s.assets = {}; s.tf = {}
    def textfree(s, pno):
        if pno not in s.tf:
            t = pymupdf.open(); t.insert_pdf(s.doc, from_page=pno, to_page=pno)
            p = t[0]; p.add_redact_annot(p.rect); p.apply_redactions(images=0, graphics=0, text=0)
            s.tf = {pno: (t, p)}
        return s.tf[pno][1]
    def png(s, page, rect, zoom, kind):
        pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), clip=pymupdf.Rect(rect), alpha=False)
        data = pix.tobytes('png')
        name = f'{kind}/{hashlib.sha1(data).hexdigest()[:12]}.png'
        s.assets[name] = data
        return name
    def math(s, pno, k):
        r = (k.x0 - 0.6, k.y0 - 0.6, k.x1 + 0.6, k.y1 + 0.6)
        return s.png(s.textfree(pno), r, ZOOM_MATH, 'm'), r
    def figure(s, pno, r):
        r = (r[0] - 3, r[1] - 3, r[2] + 3, r[3] + 3)
        return s.png(s.doc[pno], r, ZOOM_FIG, 'figures'), r

def em(v): return (f'{v / EM:.3f}'.rstrip('0').rstrip('.') or '0') + 'em'

def toks_html(toks, oy, rend, pno):
    out = []; prev = None
    for t in toks:
        sp = t.c is not None and t.c.isspace()
        if prev is not None and not sp and not (prev.c is not None and prev.c.isspace()):
            gap = t.x0 - prev.x1
            if gap >= (1.0 if t.c is not None and prev.c is not None else 1.6): out.append(' ')
        if t.c is None:
            src, r = rend.math(pno, t)
            out.append(f'<img class="m" src="{src}" alt="" style="width:{em(r[2] - r[0])};height:{em(r[3] - r[1])};vertical-align:{em(oy - r[3])}">')
        else:
            e = html.escape(t.c, quote=False)
            out.append(f'<{t.vs}>{e}</{t.vs}>' if t.vs else e)
        prev = t
    h = re.sub(r'</(sup|sub)><\1>', '', ''.join(out))
    return re.sub(r' {2,}', ' ', h).strip()

def first_word_width(r):
    toks = [t for t in r['toks']]
    i = 0
    while i < len(toks) and toks[i].c is not None and toks[i].c.isspace(): i += 1
    if i == len(toks): return 0
    j = i
    while j < len(toks) and not (toks[j].c is not None and toks[j].c.isspace()): j += 1
    return toks[j - 1].x1 - toks[i].x0

def wraps(prev, nxt):
    return prev['x1'] + 2.5 + first_word_width(nxt) > RIGHT - 40

def rows_html(rows, rend):
    parts = []
    for k, r in enumerate(rows):
        if k: parts.append(' ' if wraps(rows[k - 1], r) else '<br>')
        parts.append(toks_html(r['toks'], r['oy'], rend, r['page']))
    return ''.join(parts)

def paragraphs(rows):
    """Group rows into paragraphs (blank-line separated) and centered display lines."""
    out = []; cur = None
    for r in rows:
        centered = r['x0'] > 60 and abs((r['x0'] + r['x1']) / 2 - 306) < 30
        same = False
        if cur is not None and not centered and not cur['center']:
            prev = cur['rows'][-1]
            if r['page'] == prev['page']:
                gap = r['y0'] - prev['y1']
                same = gap < 7.5 or (wraps(prev, r) and gap < 16)
            else:
                same = wraps(prev, r)
        if same: cur['rows'].append(r)
        else:
            cur = {'rows': [r], 'center': centered}; out.append(cur)
    return out

# ---------------------------------------------------------------- per question
META = ['assessment', 'test', 'domain', 'skill', 'difficulty']

def parse_meta(chars):
    cols = [18, 134, 248, 364, 478, 600]
    vals = {k: [] for k in META}
    for c in chars:
        for k in range(5):
            if cols[k] <= c.cx < cols[k + 1]: vals[META[k]].append(c); break
    return {k: re.sub(r'\s+', ' ', ' '.join(''.join(t.c for t in r['toks']) for r in make_rows(cs, [], 0))).strip()
            for k, cs in vals.items()}

def page_objects(doc, pno, top, rend, issues):
    """Rows of text+inline math, plus figures and tables (as (page, y, block)) for one page."""
    chars, draws, imgs = load_page(doc, pno)
    chars = [c for c in chars if c.y0 >= top]
    draws = [d for d in draws if d['r'][1] >= top]
    figs = []; inks = []; rfigs = []
    for r in imgs:
        if r[1] < top: continue
        w, h = r[2] - r[0], r[3] - r[1]
        beside = any(not c.c.isspace() and not c.fig and overlap(c.y0, c.y1, r[1], r[3]) > 0.5 * (c.y1 - c.y0)
                     and (c.x1 <= r[0] + 1 or c.x0 >= r[2] - 1) for c in chars)
        if h > 60 or (w > 150 and h > 30 and not beside): rfigs.append(r)
        else: inks.append(Ink(r, img=True))
    rules = [d['r'] for d in draws if is_rule(d['r'])]
    glyphs = [d['r'] for d in draws if not is_rule(d['r'])]
    big = [r for r, d in ((d['r'], d) for d in draws if not is_rule(d['r']))
           if r[2] - r[0] > 40 or r[3] - r[1] > 40 or d['items'] > 60]
    figs += big
    figs += [box(c) for c in chars if c.fig and not c.c.isspace()]
    tables = []
    for g in (components(rules, 3) if rules else []):
        bb = bbox_of(g)
        if any(near(f, bb, 2) for f in figs + rfigs):
            figs.append(bb); continue
        cin = [c for c in chars if inside(c.cx, c.cy, bb)]
        gin = [Ink(r) for r in glyphs if inside((r[0] + r[2]) / 2, (r[1] + r[3]) / 2, bb)]
        iin = [k for k in inks if inside(k.cx, k.cy, bb)]
        res = build_table(g, cin + cluster_ink(gin + iin, cin)) if len(g) >= 4 else None
        if res: tables.append((bb, res))
        elif bb[2] - bb[0] > 20 and bb[3] - bb[1] > 20: figs.append(bb)
        else: glyphs += g                                     # fraction bars, overlines, minus signs
    # a figure takes in the labels drawn around it, then overlapping figures merge
    if figs:
        figs = [bbox_of(g) for g in components(figs, 10)]
        for _ in range(3):
            grown = []
            for f in figs:
                for r in glyphs + [box(k) for k in inks]:
                    if near(r, f, 5): f = union(f, r)
                grown.append(f)
            figs = [bbox_of(g) for g in components(grown, 2)]
    # raster figures are complete pictures: keep them apart unless vector drawing overlaps them
    for r in rfigs:
        hit = [f for f in figs if near(f, r, 0)]
        figs = [f for f in figs if not near(f, r, 0)] + [bbox_of([r] + hit)]
    out = []
    for f in figs:
        body = sum(1 for c in chars if not c.fig and not c.c.isspace() and inside(c.cx, c.cy, f))
        if body > 80: issues.append(f'figure-with-text:{body}')
        src, r = rend.figure(pno, f)
        out.append((pno, f[1], {'type': 'figure', 'src': src, 'width': round(r[2] - r[0], 1), 'height': round(r[3] - r[1], 1), 'alt': '', '_bb': f}))
    for bb, (cells, R, C) in tables:
        grid = []
        for i in range(R):
            row = []
            for cell in (c for c in cells if c['r'] == i):
                ts = cell['toks']
                rws = make_rows([t for t in ts if t.c is not None], [t for t in ts if t.c is None], pno)
                d = {'html': ' '.join(toks_html(r['toks'], r['oy'], rend, pno) for r in rws).strip()}
                if rws:
                    lg = min(r['x0'] for r in rws) - cell['box'][0]; rg = cell['box'][2] - max(r['x1'] for r in rws)
                    if lg > 6 and rg > 6 and abs(lg - rg) < 6: d['align'] = 'center'
                    elif lg > 10 and rg < 8: d['align'] = 'right'
                if cell['rowspan'] > 1: d['rowspan'] = cell['rowspan']
                if cell['colspan'] > 1: d['colspan'] = cell['colspan']
                row.append(d)
            grid.append(row)
        out.append((pno, bb[1], {'type': 'table', 'rows': grid}))
    boxes = figs + [t[0] for t in tables]
    chars = [c for c in chars if not c.fig and not any(inside(c.cx, c.cy, b) for b in boxes)]
    g_inks = [Ink(r) for r in glyphs if not any(inside((r[0] + r[2]) / 2, (r[1] + r[3]) / 2, b) for b in boxes)]
    inks = [k for k in inks if not any(inside(k.cx, k.cy, b) for b in boxes)]
    return make_rows(chars, cluster_ink(g_inks + inks, chars), pno), out

LABELS = ('Question', 'Answer', 'Rationale')

def question(doc, pnos, rend):
    issues = []
    first = doc[pnos[0]]
    m = re.search(r'Question\s*ID:\s*([0-9a-f]{8})', first.get_text()[:60])
    qid = m.group(1) if m else None
    chars0, _, _ = load_page(doc, pnos[0])
    qy = None
    for r in make_rows([c for c in chars0 if c.y0 > 100], [], 0):
        if r['text'] == 'Question' and r['x0'] < 30: qy = r['y0']; break
    if qy is None or qid is None: return None, [f'no-question-label:{pnos[0] + 1}']
    head = next((r for r in make_rows([c for c in chars0 if 40 < c.y0 < qy], [], 0) if r['text'].startswith('Assessment')), None)
    meta = parse_meta([c for c in chars0 if (head['y1'] + 2 if head else 75) < c.y0 < qy - 4])
    rows = []; extras = []
    for pno in pnos:
        rws, ex = page_objects(doc, pno, qy - 2 if pno == pnos[0] else 0, rend, issues)
        rows += rws; extras += ex
    lab = {}; ca_row = None
    for k, r in enumerate(rows):
        if r['x0'] < 30 and r['text'] in LABELS and r['text'] not in lab: lab[r['text']] = k
        if r['x0'] < 30 and r['text'].startswith('Correct Answer:') and 'ca' not in lab: lab['ca'] = k; ca_row = r
    if not all(k in lab for k in ('Question', 'Rationale')):
        return None, [f'missing-sections:{sorted(lab)}:{pnos[0] + 1}']
    spr = 'Answer' not in lab
    if 'ca' not in lab: lab['ca'] = lab['Rationale']; ca_row = None      # some grid-ins state the answer only in the rationale
    pos = lambda r: (r['page'], r['y0'])
    def extras_in(lo, hi): return [(p, y, b) for p, y, b in extras if lo <= (p, y) < hi]

    # ---- stimulus + stem
    q_hi = pos(rows[lab['ca'] if spr else lab['Answer']])
    items = [(pos(p['rows'][0]), p) for p in paragraphs(rows[lab['Question'] + 1: lab['ca'] if spr else lab['Answer']])]
    items += [((p, y), b) for p, y, b in extras_in(pos(rows[lab['Question']]), q_hi)]
    items.sort(key=lambda x: x[0])
    stim = []
    for _, it in items:
        if 'type' not in it:
            stim.append({'type': 'p', 'html': rows_html(it['rows'], rend), **({'center': True} if it['center'] else {})})
        else:
            stim.append(it)
    stem = None
    for i in range(len(stim) - 1, -1, -1):
        if stim[i]['type'] == 'p' and not stim[i].get('center'):
            stem = stim.pop(i)['html']; break
    if stem is None: issues.append('no-stem'); stem = ''

    # ---- choices
    choices = []
    if not spr:
        cur = None
        for r in rows[lab['Answer'] + 1: lab['ca']]:
            m = re.match(r'^([A-D])\.', r['text'])
            if m and r['x0'] < 30 and (cur is None or ord(m.group(1)) == ord(cur['letter']) + 1):
                cur = {'letter': m.group(1), 'rows': [r], 'figs': []}; choices.append(cur)
            elif cur is not None: cur['rows'].append(r)
            else: issues.append('text-before-A')
        for p, y, b in extras_in(pos(rows[lab['Answer']]), pos(rows[lab['ca']])):
            tgt = None
            bb = b.get('_bb') or (0, y, 0, y)
            for c in choices:
                if pos(c['rows'][0]) <= (p, y + 12): tgt = c
            # a graph choice is drawn level with its letter, or just above it
            best = None
            for c in choices:
                r0 = c['rows'][0]
                if r0['page'] != p: continue
                cy = (r0['y0'] + r0['y1']) / 2
                dist = max(bb[1] - cy, cy - bb[3], 0)
                if dist < 30 and (best is None or dist < best[0]): best = (dist, c)
            if best: tgt = best[1]
            if tgt is None: issues.append('figure-before-choices'); tgt = choices[0] if choices else None
            if tgt is not None: tgt['figs'].append(b)
        out = []
        for c in choices:
            r0 = dict(c['rows'][0]); toks = list(r0['toks'])
            k = next((i for i, t in enumerate(toks) if t.c == '.'), -1)
            r0['toks'] = toks[k + 1:]
            h = rows_html([r0] + c['rows'][1:], rend).strip()
            for f in c['figs']:
                h += block_img(f) if f['type'] == 'figure' else table_html(f)
            out.append({'letter': c['letter'], 'html': h})
        choices = out
        if ''.join(c['letter'] for c in choices) != 'ABCD': issues.append('choices:' + ''.join(c['letter'] for c in choices))

    # ---- correct answer
    toks = ca_row['toks'] if ca_row else []
    k = next((i for i, t in enumerate(toks) if t.c == ':'), len(toks))
    rest = toks[k + 1:]
    text = ''.join(t.c for t in rest if t.c is not None).strip()
    ink = [t for t in rest if t.c is None]
    answer = ''; answers = None
    if not spr and ca_row:
        if re.fullmatch(r'[A-D]', text) and not ink: answer = text
        else: issues.append(f'bad-answer:{text!r}')
    else:
        answers = {'line': toks_html(rest, ca_row['oy'], rend, ca_row['page']) if ca_row else None}

    # ---- rationale
    ritems = [(pos(p['rows'][0]), p) for p in paragraphs(rows[lab['Rationale'] + 1:])]
    ritems += [((p, y), b) for p, y, b in extras_in(pos(rows[lab['Rationale']]), (10 ** 6, 0))]
    ritems.sort(key=lambda x: x[0])
    rpar = []
    for _, it in ritems:
        if 'type' not in it:
            h = rows_html(it['rows'], rend)
            if it['center'] and rpar: rpar[-1] += f'<span class="mblock">{h}</span>'
            elif it['center']: rpar.append(f'<span class="mblock">{h}</span>')
            elif rpar and rpar[-1].endswith('</span>') and not re.match(r'(Choices? [A-D]|The correct answer)', h): rpar[-1] += h
            else: rpar.append(h)
        else:
            h = block_img(it) if it['type'] == 'figure' else table_html(it)
            if rpar: rpar[-1] += h
            else: rpar.append(h)
    by = {}
    if not spr:
        lead = r'Choices? ([A-D](?:,? (?:and |or )?[A-D])*),? (?:is|are) '
        for p in rpar:
            for seg in re.split(r'(?=' + lead.replace('(', '(?:', 1) + r')', p):
                m = re.match(lead, seg)
                if m:
                    for L in re.findall(r'[A-D]', m.group(1)):
                        by[L] = (by.get(L, '') + ' ' + seg.strip()).strip()
        stated = sorted(set(re.findall(r'Choice ([A-D]) is (?:correct|the best answer)', ' '.join(rpar))))
        if not answer:
            if len(stated) == 1: answer = stated[0]; issues.append('answer-from-rationale')
            else: issues.append(f'no-answer:{stated}')
        elif stated and stated != [answer]: issues.append(f'answer-mismatch:{answer}:{stated}')
        if answer and answer not in by: issues.append('rationale-no-correct')
    if spr:
        # every way the answer is written: the Correct Answer line, "The correct answer is …", "Note that …, … are examples …"
        allr = ' '.join(rpar)
        m = re.search(r'[Tt]he correct answers? (?:is|are) (.*?)\.(?:\s|$|<)', allr)
        answers['rationale'] = m.group(1) if m else None
        m = re.search(r'Note that (.*?),? (?:is an example|are examples) of ', allr)
        answers['examples'] = m.group(1) if m else None
        if not answers['line'] and not answers['rationale']: issues.append('spr-no-answer')
    q = {'id': qid, 'test': meta['test'], 'domain': meta['domain'], 'skill': meta['skill'], 'difficulty': meta['difficulty'],
         'type': 'spr' if spr else 'mcq', 'stimulus': stim, 'stem': stem, 'choices': choices, 'answer': answer,
         'rationale': {'paragraphs': rpar, 'byChoice': by}, 'source': {'pdfPages': [p + 1 for p in pnos]}}
    if spr: q['answers'] = answers
    return q, issues

def block_img(f):
    return f'<img class="fig" src="{f["src"]}" alt="" style="width:{em(f["width"])}">'

def table_html(t):
    def cell(c):
        a = ''.join(f' {k}="{c[k]}"' for k in ('rowspan', 'colspan') if k in c)
        return f'<td{a}>{c["html"]}</td>'
    return '<table class="mtable">' + ''.join('<tr>' + ''.join(cell(c) for c in r) + '</tr>' for r in t['rows']) + '</table>'

def work(args):
    lo, hi, starts, npages = args
    doc = pymupdf.open(PDF)
    rend = Renderer(doc); out = []
    for n in range(lo, hi):
        s = starts[n]; e = starts[n + 1] if n + 1 < len(starts) else npages
        try:
            q, issues = question(doc, list(range(s, e)), rend)
        except Exception as ex:
            import traceback; traceback.print_exc()
            q, issues = None, [f'crash:{ex!r}:{s + 1}']
        out.append((s, q, issues))
    return out, rend.assets

def main():
    doc = pymupdf.open(PDF)
    starts = [i for i in range(doc.page_count) if doc[i].get_text()[:40].lstrip().startswith('Question ID')]
    only = set(sys.argv[1:])
    idx = [i for i, s in enumerate(starts) if str(s + 1) in only] if only else None
    jobs = [(i, i + 1, starts, doc.page_count) for i in idx] if idx is not None else \
        [(a, min(a + 20, len(starts)), starts, doc.page_count) for a in range(0, len(starts), 20)]
    results = []; assets = {}
    with Pool(8) as P:
        for out, a in P.imap_unordered(work, jobs):
            results += out; assets.update(a)
    results.sort(key=lambda x: x[0])
    pickle.dump((results, assets), open('math_parsed.pkl', 'wb'))
    rep = collections.Counter(i.split(':')[0] for _, q, iss in results for i in iss)
    print('questions', sum(1 for _, q, _ in results if q), 'failed', sum(1 for _, q, _ in results if not q), 'assets', len(assets))
    print(rep.most_common())
    for s, q, iss in results:
        if not q: print('FAILED page', s + 1, iss)

if __name__ == '__main__':
    main()
