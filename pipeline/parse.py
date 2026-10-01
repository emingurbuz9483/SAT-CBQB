"""CBQB PDF -> structured JSON.  Reads the per-page cache built by cache.py."""
import pickle, glob, re, json, collections, html, sys

# Glyph-content clusters (see f3.py) identified by rendering samples.
STYLE = {'C9760': '', 'C9762': '', 'C9758': 'B', 'C9795': 'I', 'C10917': 'BI', 'OpenSans-Regular': 'F'}
RIGHT = 594.5          # right edge of text area
SPACE_W = 2.23         # width of a normal space at body size

class Ch:
    __slots__ = ('c', 'x0', 'y0', 'x1', 'y1', 'oy', 'font', 'st', 'u', 'page', 'sz', 'vs')
    def __init__(s, c, bb, o, font, page, sz=0.9):
        s.c = c; s.x0, s.y0, s.x1, s.y1 = bb; s.oy = o[1]; s.font = font
        s.st = STYLE.get(font); s.u = False; s.page = page; s.sz = sz; s.vs = ''
    @property
    def cx(s): return (s.x0 + s.x1) / 2
    @property
    def cy(s): return (s.y0 + s.y1) / 2

class Sep:
    __slots__ = ('c', 'st', 'u', 'vs')
    def __init__(s, c): s.c = c; s.st = ''; s.u = False; s.vs = ''

def load_pages():
    pages = {}
    for f in sorted(glob.glob('cache/*.pkl')):
        pages.update(pickle.load(open(f, 'rb')))
    return [pages[i] for i in range(len(pages))]

def page_chars(pg, pno):
    out = []
    for l in pg['lines']:
        for s in l['spans']:
            for c, bb, o in s['chars']:
                if c in ' \xa0' and s['font'] != 'OpenSans-Regular' and (bb[2] - bb[0]) / s['size'] < 0.5:
                    continue                      # zero-width kerning "space" (repor ted -> reported)
                if c == '\xa0': c = ' '
                out.append(Ch(c, bb, o, s['font'], pno, s['size']))
    return out

# ---------------------------------------------------------------- drawings
def classify_drawings(pg, chars):
    """Drop drawings that are pieces of Type3 glyphs; keep real graphics."""
    buckets = collections.defaultdict(list)
    for ch in chars:
        if ch.st == 'F' or ch.c.isspace(): continue
        for b in range(int(ch.y0 // 10), int(ch.y1 // 10) + 1): buckets[b].append(ch)
    real = []
    for typ, r, fill, col, w, nitems, ops in pg['draw']:
        x0, y0, x1, y1 = r
        glyph = False
        if x1 - x0 <= 14 and y1 - y0 <= 16:
            for ch in buckets.get(int(((y0 + y1) / 2) // 10), ()):
                if ch.x0 - 3.5 <= x0 and x1 <= ch.x1 + 3.5 and ch.y0 - .7 <= y0 and y1 <= ch.y1 + .7:
                    glyph = True; break
        if not glyph:
            real.append({'type': typ, 'r': r, 'fill': fill, 'color': col, 'w': w, 'ops': ops})
    return real

def rect_union(a, b): return (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))
def near(a, b, g): return not (a[2] + g < b[0] or b[2] + g < a[0] or a[3] + g < b[1] or b[3] + g < a[1])

def components(rects, gap):
    groups = []
    for r in rects:
        hit = [g for g in groups if any(near(r, x, gap) for x in g)]
        new = [r] + [x for g in hit for x in g]
        groups = [g for g in groups if not any(g is h for h in hit)] + [new]
    return groups

def bbox_of(rs):
    b = rs[0]
    for r in rs[1:]: b = rect_union(b, r)
    return b

def is_underline_shape(d):
    x0, y0, x1, y1 = d['r']
    return y1 - y0 <= 1.6 and x1 - x0 >= 2.5

def is_bullet(d):
    x0, y0, x1, y1 = d['r']
    return 25 <= x0 <= 60 and 2 <= x1 - x0 <= 6 and 2 <= y1 - y0 <= 6

# ---------------------------------------------------------------- rows / text
def make_rows(chars):
    small = [c for c in chars if c.sz < 0.8 and c.st != 'F']
    chars = [c for c in chars if not (c.sz < 0.8 and c.st != 'F')]
    rows = []
    for ch in sorted(chars, key=lambda c: (c.page, c.oy)):
        for r in rows[-3:]:
            if r['page'] == ch.page and abs(r['oy'] - ch.oy) < 2.2:
                r['chars'].append(ch); break
        else:
            rows.append({'oy': ch.oy, 'page': ch.page, 'chars': [ch]})
    for ch in small:
        cand = [r for r in rows if r['page'] == ch.page and abs(r['oy'] - ch.oy) < 6.5]
        if cand:
            r = min(cand, key=lambda r: abs(r['oy'] - ch.oy)); r['chars'].append(ch)
            if not ch.c.isspace() and ch.c not in '.,;:':
                ch.vs = 'sub' if ch.oy > r['oy'] + 0.5 else 'sup' if ch.oy < r['oy'] - 0.5 else ''
        else:
            rows.append({'oy': ch.oy, 'page': ch.page, 'chars': [ch]})
    for r in rows:
        r['chars'].sort(key=lambda c: c.x0)
        # words separated only by positioning (no space glyph) get a space; runs of spaces collapse
        fixed = []
        for ch in r['chars']:
            if fixed:
                p = fixed[-1]
                if ch.c.isspace() and p.c.isspace(): continue
                if not ch.c.isspace() and not p.c.isspace() and ch.x0 - p.x1 >= 1.0 and 'F' not in (p.st, ch.st):
                    sp = Ch(' ', (p.x1, p.y0, ch.x0, p.y1), (0, p.oy), p.font, p.page, p.sz); sp.st = ''
                    fixed.append(sp)
            fixed.append(ch)
        r['chars'] = fixed
        cs = [c for c in r['chars'] if not c.c.isspace()] or r['chars']
        r['x0'] = cs[0].x0; r['x1'] = max(c.x1 for c in cs)
        r['y0'] = min(c.y0 for c in r['chars']); r['y1'] = max(c.y1 for c in r['chars'])
        r['text'] = ''.join(c.c for c in r['chars']).strip()
        r['bullet'] = False
    rows.sort(key=lambda r: (r['page'], r['oy']))
    return rows

def first_word_width(row):
    cs = row['chars']; i = 0
    while i < len(cs) and cs[i].c.isspace(): i += 1
    j = i
    while j < len(cs) and not cs[j].c.isspace(): j += 1
    return (cs[j - 1].x1 - cs[i].x0) if j > i else 0

def wraps_naturally(prev, nxt, right=RIGHT):
    """True when the line break between two rows is an automatic word-wrap."""
    return prev['x1'] + SPACE_W + first_word_width(nxt) > right - 40.0

def resolve_rare_styles(chars):
    """Chars from tiny one-glyph Type3 fonts take the style of the word they sit in."""
    n = len(chars)
    for k, ch in enumerate(chars):
        if ch.st is not None: continue
        def scan(step):
            j = k + step
            while 0 <= j < n:
                o = chars[j]
                if o.c.isspace(): return None
                if o.st is not None and o.c.isalnum(): return o.st
                j += step
            return None
        left, right = scan(-1), scan(1)
        if ch.c in '“‘(':
            st = right if right is not None else left
        elif ch.c in '”)':
            st = left if left is not None else right
        elif left is not None and right is not None:
            st = left if (left == right or ch.c.isalpha()) else ''
        else:
            st = left if left is not None else right
        ch.st = st if st is not None else ''
        ch.font = ch.font + '*'

TAGS = [('strong', 0), ('em', 1), ('u', 2), ('sub', 3), ('sup', 4)]

def to_html(chars):
    n = len(chars)
    sty = [['B' in (c.st or ''), 'I' in (c.st or ''), c.u, c.vs == 'sub', c.vs == 'sup'] for c in chars]
    for k, ch in enumerate(chars):
        if ch.c in ' \n':
            l = next((sty[j] for j in range(k - 1, -1, -1) if chars[j].c not in ' \n'), [False] * 5)
            r = next((sty[j] for j in range(k + 1, n) if chars[j].c not in ' \n'), [False] * 5)
            sty[k] = [l[0] and r[0], l[1] and r[1], l[2] and r[2], False, False]
    out = []; cur = [False] * 5
    for k, ch in enumerate(chars):
        s = sty[k]
        if s != cur:
            for t, ix in reversed(TAGS):
                if cur[ix]: out.append(f'</{t}>')
            for t, ix in TAGS:
                if s[ix]: out.append(f'<{t}>')
            cur = s
        out.append('<br>' if ch.c == '\n' else html.escape(ch.c, quote=False))
    for t, ix in reversed(TAGS):
        if cur[ix]: out.append(f'</{t}>')
    h = ''.join(out)
    # tidy: merge adjacent identical wrappers  e.g. </em><em>
    prev = None
    while prev != h:
        prev = h
        h = re.sub(r'</(strong|em|u|sub|sup)><\1>', '', h)
        h = re.sub(r'</u></em></strong><strong><em><u>', '', h)
    return h.strip()

def join_rows(rows, right=RIGHT, allow_breaks=True):
    seq = []
    for k, r in enumerate(rows):
        cs = r['chars']; a, b = 0, len(cs)
        while a < b and cs[a].c.isspace(): a += 1
        while b > a and cs[b - 1].c.isspace(): b -= 1
        cs = cs[a:b]
        if not cs: continue
        if seq:
            prev = rows[k - 1]; last = seq[-1].c
            if allow_breaks and not wraps_naturally(prev, r, right):
                seq.append(Sep('\n'))
            elif last in '-—–/':
                pass
            else:
                seq.append(Sep(' '))
        seq.extend(cs)
    return seq

# ---------------------------------------------------------------- tables
def build_table(lines, chars):
    H = [d['r'] for d in lines if d['r'][3] - d['r'][1] <= 2.0 and d['r'][2] - d['r'][0] > 3]
    V = [d['r'] for d in lines if d['r'][2] - d['r'][0] <= 2.0 and d['r'][3] - d['r'][1] > 3]
    def uniq(vals, tol=2.0):
        out = []
        for v in sorted(vals):
            if not out or v - out[-1] > tol: out.append(v)
        return out
    ys = uniq([(r[1] + r[3]) / 2 for r in H]); xs = uniq([(r[0] + r[2]) / 2 for r in V])
    if len(ys) < 2 or len(xs) < 2: return None
    def has_v(x, ya, yb):
        return any(abs((r[0] + r[2]) / 2 - x) < 2 and r[1] <= ya + 2 and r[3] >= yb - 2 for r in V)
    def has_h(y, xa, xb):
        return any(abs((r[1] + r[3]) / 2 - y) < 2 and r[0] <= xa + 2 and r[2] >= xb - 2 for r in H)
    R, C = len(ys) - 1, len(xs) - 1
    owner = [[None] * C for _ in range(R)]; cells = []
    for i in range(R):
        for j in range(C):
            if owner[i][j] is not None: continue
            cs = 1
            while j + cs < C and not has_v(xs[j + cs], ys[i], ys[i + 1]): cs += 1
            rs = 1
            while i + rs < R and not has_h(ys[i + rs], xs[j], xs[j + cs]): rs += 1
            cell = {'r': i, 'c': j, 'rowspan': rs, 'colspan': cs, 'box': (xs[j], ys[i], xs[j + cs], ys[i + rs]), 'chars': []}
            for a in range(i, i + rs):
                for b in range(j, j + cs): owner[a][b] = cell
            cells.append(cell)
    lost = 0
    for ch in chars:
        for cell in cells:
            x0, y0, x1, y1 = cell['box']
            if x0 <= ch.cx <= x1 and y0 <= ch.cy <= y1:
                cell['chars'].append(ch); break
        else:
            if not ch.c.isspace(): lost += 1
    grid = []
    for i in range(R):
        row = []
        for cell in [c for c in cells if c['r'] == i]:
            rws = make_rows(cell['chars']) if cell['chars'] else []
            seq = join_rows(rws, allow_breaks=False)
            resolve_rare_styles([c for c in seq if isinstance(c, Ch)])
            ink = [c for c in seq if isinstance(c, Ch) and not c.c.isspace()]
            hdr = bool(ink) and all('B' in (c.st or '') for c in ink)
            d = {'html': to_html(seq)}
            if hdr: d['header'] = True
            votes = set()
            for rw in rws:                       # alignment from lines that don't fill the cell
                lg = rw['x0'] - cell['box'][0]; rg = cell['box'][2] - rw['x1']
                if lg <= 10 and rg <= 10: continue
                votes.add('left' if lg <= 6 else 'right' if rg <= 6 else 'center' if abs(lg - rg) < 4 else 'left' if lg < rg else 'right')
            if len(votes) == 1: d['_al'] = votes.pop()
            d['_col'] = cell['c']
            if cell['rowspan'] > 1: d['rowspan'] = cell['rowspan']
            if cell['colspan'] > 1: d['colspan'] = cell['colspan']
            row.append(d)
        grid.append(row)
    # cells whose text fills the cell take the majority alignment of their column's body cells
    col = collections.defaultdict(collections.Counter)
    for row in grid[1:]:
        for d in row:
            if '_al' in d and 'colspan' not in d: col[d['_col']][d['_al']] += 1
    for row in grid:
        for d in row:
            al = d.pop('_al', None) or (col[d['_col']].most_common(1)[0][0] if col[d['_col']] else 'left')
            d.pop('_col')
            if al != 'left': d['align'] = al
    return grid, lost

# ---------------------------------------------------------------- per question
META_COLS = ['assessment', 'test', 'domain', 'skill', 'difficulty']

def parse_meta(chars):
    cols = [18, 134, 248, 364, 478, 600]
    vals = {k: [] for k in META_COLS}
    for c in chars:
        if c.y0 < 75: continue
        for k in range(5):
            if cols[k] <= c.cx < cols[k + 1]:
                vals[META_COLS[k]].append(c); break
    return {k: ' '.join(r['text'] for r in make_rows(cs)).strip() for k, cs in vals.items()}

def qid_of(pg):
    for l in pg['lines'][:3]:
        t = ''.join(c[0] for s in l['spans'] for c in s['chars']).replace('\xa0', ' ')
        m = re.match(r'\s*Question\s*ID:\s*([0-9a-f]{8})', t)
        if m: return m.group(1)
    return None

def collect(pnos, pages, issues):
    allchars = []; figures = []; tables = []; underlines = []; bullets = []; other = []; meta = None
    for pno in pnos:
        pg = pages[pno]
        chars = page_chars(pg, pno)
        real = classify_drawings(pg, chars)
        if pno == pnos[0]:
            meta = parse_meta([c for c in chars if c.y0 < 118])
            chars = [c for c in chars if c.y0 >= 118]
            real = [d for d in real if d['r'][1] >= 118]
        fchars = [c for c in chars if c.st == 'F']
        graphics = [d for d in real if not is_bullet(d)]
        figs = []
        if fchars:
            seeds = [(c.x0, c.y0, c.x1, c.y1) for c in fchars if not c.c.isspace()]
            sset = set(seeds)
            for comp in components(seeds + [d['r'] for d in graphics if not (is_underline_shape(d) and d['r'][2] - d['r'][0] < 40)], 18):
                if any(r in sset for r in comp):
                    figs.append(bbox_of(comp))
            # title, rotated axis label and legend of one chart are separate components: merge them
            figs = [bbox_of(g) for g in components(figs, 70)]
        rest = [d for d in graphics if not any(near(d['r'], f, 0) for f in figs)]
        tbls = []
        for comp in components([d['r'] for d in rest], 3):
            v = [r for r in comp if r[2] - r[0] <= 2 and r[3] - r[1] > 3]
            if len(v) >= 2: tbls.append(bbox_of(comp))
        for f in figs:
            inside = [c for c in chars if f[0] - 1 <= c.cx <= f[2] + 1 and f[1] - 1 <= c.cy <= f[3] + 1]
            ins = set(map(id, inside))
            alt = []
            for l in pg['lines']:
                lb = l['bbox']
                if f[0] - 1 <= (lb[0] + lb[2]) / 2 <= f[2] + 1 and f[1] - 1 <= (lb[1] + lb[3]) / 2 <= f[3] + 1:
                    t = ''.join(c[0] for sp in l['spans'] for c in sp['chars']).replace('\xa0', ' ').strip()
                    if t: alt.append(((lb[1] + lb[3]) / 2, lb[0], t))
            figures.append({'page': pno, 'bbox': f, 'top': f[1],
                            'alt': ' / '.join(t for _, _, t in sorted(alt)),
                            'roboto_inside': sum(1 for c in inside if c.st != 'F' and not c.c.isspace())})
            chars = [c for c in chars if id(c) not in ins]
        for t in tbls:
            inside = [c for c in chars if t[0] - 1 <= c.cx <= t[2] + 1 and t[1] - 1 <= c.cy <= t[3] + 1]
            ins = set(map(id, inside))
            res = build_table([d for d in rest if near(d['r'], t, 0.5)], inside)
            if res is None:
                issues.append('table-grid-failed'); continue
            grid, lost = res
            if lost: issues.append(f'table-chars-lost:{lost}')
            tables.append({'page': pno, 'bbox': t, 'grid': grid, 'top': t[1]})
            chars = [c for c in chars if id(c) not in ins]
        for d in real:
            if any(near(d['r'], f, 0) for f in figs) or any(near(d['r'], t, 0.5) for t in tbls): continue
            if is_bullet(d): bullets.append((pno, d['r']))
            elif is_underline_shape(d): underlines.append((pno, d['r']))
            else: other.append((pno, d['r']))
        allchars += chars
    rows = make_rows(allchars)
    for pno, r in underlines:
        x0, y0, x1, y1 = r
        best = next((row for row in rows if row['page'] == pno and 0.2 <= y0 - row['oy'] <= 4.0
                     and row['x0'] - 1 < x1 and x0 < row['x1'] + 1), None)
        if best is None: other.append((pno, r)); continue
        if any(c.c == '_' and c.x0 - 1 <= x0 and x1 <= c.x1 + 1 for c in best['chars']): continue
        hit = False
        for c in best['chars']:
            if x0 - 0.8 <= c.cx <= x1 + 0.8 and c.c != '_':
                c.u = True; hit = True
        if not hit: other.append((pno, r))
    for row in rows:
        row['bullet'] = any(p == row['page'] and r[2] <= row['x0'] and row['y0'] - 2 <= (r[1] + r[3]) / 2 <= row['y1'] + 2
                            for p, r in bullets)
    return meta, rows, figures, tables, other

def row_kind(r):
    ink = [c for c in r['chars'] if not c.c.isspace()]
    if ink and all('B' in (c.st or '') for c in ink) and len(r['text']) < 40: return 'label'
    if r['bullet']: return 'li'
    if r['x0'] > 40: return 'li-cont'
    if r['x0'] > 22: return 'quote'
    return 'p'

def blocks_from_rows(rows):
    blocks = []; cur = None; prev = None
    for r in rows:
        k = row_kind(r)
        if k == 'li-cont' and (cur is None or cur['kind'] not in ('li', 'indent') or r['oy'] - prev['oy'] > 20 and cur['kind'] == 'li'):
            k = 'indent'
        elif k == 'li-cont' and cur['kind'] == 'indent':
            k = 'indent'
        if cur is None or k in ('label', 'li'):
            new = True
        elif k == 'li-cont':
            new = cur['kind'] != 'li'
        else:
            new = k != cur['kind']
        if not new:
            if r['page'] != prev['page']:
                new = not wraps_naturally(prev, r, QUOTE_RIGHT if cur['kind'] == 'indent' else RIGHT)
            elif r['oy'] - prev['oy'] > 20:
                new = True
        if new:
            cur = {'kind': 'li' if k == 'li-cont' else k, 'rows': [r]}; blocks.append(cur)
        else:
            cur['rows'].append(r)
        prev = r
    return blocks

QUOTE_RIGHT = 564.5   # 48pt-indented passages are inset 30pt on the right too

EM = 9.0              # body font size in pt

def block_html(b, breaks=True):
    seq = join_rows(b['rows'], right=QUOTE_RIGHT if b['kind'] == 'indent' else RIGHT, allow_breaks=breaks)
    resolve_rare_styles([c for c in seq if isinstance(c, Ch)])
    return to_html(seq)

def quote_block(b, base):
    """Passage quote. Prose -> html; verse (hard line breaks / staggered indents) -> lines with indent (em)."""
    right = QUOTE_RIGHT if b['kind'] == 'indent' else RIGHT
    lines = []
    for r in b['rows']:
        if lines and wraps_naturally(lines[-1][-1], r, right) and abs(r['x0'] - lines[-1][-1]['x0']) <= 3:
            lines[-1].append(r)
        else:
            lines.append([r])
    def ind(rows):
        return round((rows[0]['x0'] - base) / EM * 2) / 2
    def html_of(rows):
        seq = join_rows(rows, allow_breaks=False)
        resolve_rare_styles([c for c in seq if isinstance(c, Ch)])
        return to_html(seq)
    if len(lines) == 1:
        d = {'type': 'quote', 'html': html_of(lines[0])}
        if ind(lines[0]): d['indent'] = ind(lines[0])
        return d
    out = []
    for ln in lines:
        d = {'html': html_of(ln)}
        if ind(ln): d['indent'] = ind(ln)
        out.append(d)
    return {'type': 'quote', 'lines': out}

CHOICE_RE = re.compile(r'^([A-D])\.\s')

def split_rationale(pars):
    text = ' '.join(pars)
    parts = re.split(r'(?=Choice [A-D] is )', text)
    by = {}
    for p in parts:
        m = re.match(r'Choice ([A-D]) is', p)
        if m: by[m.group(1)] = (by.get(m.group(1), '') + ' ' + p.strip()).strip()
    return by

def build(pages):
    starts = [i for i, pg in enumerate(pages) if qid_of(pg)]
    out = []; problems = []
    for n, s in enumerate(starts):
        e = starts[n + 1] if n + 1 < len(starts) else len(pages)
        pnos = list(range(s, e)); issues = []
        qid = qid_of(pages[s])
        meta, rows, figures, tables, other = collect(pnos, pages, issues)
        if other: issues.append(f'unclassified-drawings:{len(other)}')
        for f in figures:
            if f['roboto_inside']: issues.append(f'roboto-text-in-figure:{f["roboto_inside"]}')
        lab = {}; correct = None
        for k, r in enumerate(rows):
            t = r['text']
            if row_kind(r) == 'label':
                if t in ('Question', 'Answer', 'Rationale') and t not in lab: lab[t] = k
                m = re.match(r'^Correct Answer:\s*([A-D])$', t)
                if m and 'ca' not in lab: lab['ca'] = k; correct = m.group(1)
        if not all(k in lab for k in ('Question', 'Answer', 'ca', 'Rationale')):
            problems.append((qid, s + 1, 'missing-section', sorted(lab))); continue
        if not lab['Question'] < lab['Answer'] < lab['ca'] < lab['Rationale']:
            problems.append((qid, s + 1, 'section-order', lab)); continue
        qrows = rows[lab['Question'] + 1: lab['Answer']]
        arows = rows[lab['Answer'] + 1: lab['ca']]
        mid = rows[lab['ca'] + 1: lab['Rationale']]
        if mid: issues.append('text-between-answer-and-rationale')
        rrows = rows[lab['Rationale'] + 1:]
        # ---- stimulus + stem
        qblocks = blocks_from_rows(qrows)
        items = [{'pos': (b['rows'][0]['page'], b['rows'][0]['y0']), 'blk': b} for b in qblocks]
        items += [{'pos': (f['page'], f['top']), 'fig': f} for f in figures]
        items += [{'pos': (t['page'], t['top']), 'tbl': t} for t in tables]
        items.sort(key=lambda x: x['pos'])
        qx = [r['x0'] for b in qblocks if b['kind'] in ('quote', 'indent') for r in b['rows']]
        base = min(qx) if qx else 0
        stim = []
        for it in items:
            if 'tbl' in it:
                cap = stim.pop()['html'] if stim and stim[-1].get('_centered') else None
                stim.append({'type': 'table', 'caption': cap, 'rows': it['tbl']['grid'],
                             '_page': it['tbl']['page'], '_bbox': it['tbl']['bbox']})
            elif 'fig' in it:
                stim.append({'type': 'figure', 'alt': it['fig']['alt'], '_page': it['fig']['page'], '_bbox': it['fig']['bbox']})
            else:
                b = it['blk']; rws = b['rows']
                xc = sum((r['x0'] + r['x1']) / 2 for r in rws) / len(rws)
                if min(r['x0'] for r in rws) > 60 and abs(xc - 306) < 40 and b['kind'] != 'li' \
                        and all(abs((r['x0'] + r['x1']) / 2 - xc) < 6 for r in rws):
                    blk = {'type': 'p', 'html': block_html(b, breaks=False), '_centered': True}
                elif b['kind'] in ('quote', 'indent'):
                    blk = quote_block(b, base)
                else:
                    blk = {'type': {'p': 'p', 'li': 'li', 'label': 'label'}[b['kind']], 'html': block_html(b)}

                stim.append(blk)
        merged = []
        for b in stim:
            if b['type'] == 'li':
                if merged and merged[-1]['type'] == 'list': merged[-1]['items'].append(b['html'])
                else: merged.append({'type': 'list', 'items': [b['html']]})
            else:
                merged.append(b)
        stem = None
        if merged and merged[-1]['type'] == 'p' and not merged[-1].get('_centered'):
            stem = merged.pop()['html']
        else:
            issues.append('no-stem')
        for b in merged:
            if b.pop('_centered', None):
                b['type'] = 'caption'; issues.append('centered-text-not-before-table')
        # ---- choices
        choices = []; cur = None
        for r in arows:
            m = CHOICE_RE.match(r['text'])
            if m and r['x0'] < 22 and (cur is None or ord(m.group(1)) == ord(cur['letter']) + 1):
                cur = {'letter': m.group(1), 'rows': [r]}; choices.append(cur)
            elif r['bullet'] and cur is not None and cur['letter'] < 'D':
                cur = {'letter': chr(ord(cur['letter']) + 1), 'rows': [r], 'nolabel': True}; choices.append(cur)
                issues.append('source-defect:choice-drawn-as-bullet')
            elif cur is not None:
                cur['rows'].append(r)
            else:
                issues.append('text-before-choice-A')
        ch_out = []
        for c in choices:
            seq = join_rows(c['rows'], allow_breaks=False)
            resolve_rare_styles([x for x in seq if isinstance(x, Ch)])
            if not c.get('nolabel'):
                k = 0
                while k < len(seq) and seq[k].c != '.': k += 1
                seq = seq[k + 1:]
            while seq and seq[0].c.isspace(): seq = seq[1:]
            ch_out.append({'letter': c['letter'], 'html': to_html(seq)})
        if ''.join(c['letter'] for c in ch_out) != 'ABCD':
            issues.append('choices:' + ''.join(c['letter'] for c in ch_out))
        # ---- rationale
        rpar = [block_html(b) for b in blocks_from_rows(rrows)]
        by = split_rationale(rpar)
        if correct not in by: issues.append('rationale-no-correct-choice')
        skill = {'Cross-text Connections': 'Cross-Text Connections'}.get(meta['skill'], meta['skill'])
        q = {'id': qid, 'test': meta['test'], 'domain': meta['domain'], 'skill': skill,
             'difficulty': meta['difficulty'], 'stimulus': merged, 'stem': stem, 'choices': ch_out,
             'answer': correct, 'rationale': {'paragraphs': rpar, 'byChoice': by},
             'source': {'pdfPages': [p + 1 for p in pnos]}}
        if issues: q['_issues'] = issues
        out.append(q)
    return out, problems

if __name__ == '__main__':
    pages = load_pages()
    qs, problems = build(pages)
    pickle.dump((qs, problems), open('parsed.pkl', 'wb'))
    rep = collections.Counter(i.split(':')[0] for q in qs for i in q.get('_issues', []))
    print('questions', len(qs), 'problems', len(problems))
    print(rep.most_common())
    for p in problems[:20]: print(p)
