"""Independent checks of parsed.pkl against the source pages."""
import pickle, re, collections, html, json
import parse
from parse import load_pages, page_chars

qs, _ = pickle.load(open('parsed.pkl', 'rb'))
pages = load_pages()

def strip(h): return html.unescape(re.sub(r'<[^>]+>', '', h or ''))

def out_text(q):
    parts = ['Question', 'Answer', 'Rationale', 'Correct Answer:', q['answer']]
    for b in q['stimulus']:
        if b['type'] == 'list': parts += b['items']
        elif b['type'] == 'table':
            parts.append(b.get('caption') or '')
            parts += [c['html'] for row in b['rows'] for c in row]
        elif b['type'] == 'figure': parts.append(b['alt'])
        elif 'lines' in b: parts += [l['html'] for l in b['lines']]
        else: parts.append(b['html'])
    parts.append(q['stem'] or '')
    for c in q['choices']: parts += [c['letter'] + '.', c['html']]
    parts += q['rationale']['paragraphs']
    return ''.join(strip(p) for p in parts)

def src_text(q):
    out = []
    for p in q['source']['pdfPages']:
        chars = page_chars(pages[p - 1], p - 1)
        if p == q['source']['pdfPages'][0]: chars = [c for c in chars if c.y0 >= 118]
        out += [c.c for c in chars]
    return ''.join(out)

# 1. completeness ------------------------------------------------------------
bad = []
for q in qs:
    a = collections.Counter(ch for ch in src_text(q) if not ch.isspace())
    b = collections.Counter(ch for ch in out_text(q) if not ch.isspace())
    if q['id'] == 'e3bbf2bf': a['D'] += 1; a['.'] += 1      # choice letter we reconstructed
    if a != b:
        bad.append((q['id'], q['source']['pdfPages'], dict(a - b), dict(b - a)))
print('1. completeness mismatches:', len(bad))
for x in bad[:15]: print('   ', x)

# 2. rare-font style consistency ---------------------------------------------
style_by_font = collections.defaultdict(collections.Counter)
orig = parse.resolve_rare_styles
def spy(chars):
    orig(chars)
    for c in chars:
        if isinstance(c, parse.Ch) and c.font.endswith('*') and not c.c.isspace():
            style_by_font[c.font.rstrip('*')][c.st] += 1
parse.resolve_rare_styles = spy
parse.build(pages)
mixed = {f: dict(v) for f, v in style_by_font.items() if len(v) > 1}
print('2. rare font clusters:', len(style_by_font), ' with inconsistent style:', len(mixed))
for f, v in list(mixed.items())[:20]: print('   ', f, v)
pickle.dump({k: dict(v) for k, v in style_by_font.items()}, open('rare_styles.pkl', 'wb'))

# 3. underline / blank sanity -------------------------------------------------
def stim_html(q): return json.dumps(q['stimulus'], ensure_ascii=False)
need_u = [q['id'] for q in qs if 'underlined' in (q['stem'] or '') and '<u>' not in stim_html(q)]
extra_u = [q['id'] for q in qs if '<u>' in json.dumps(q['choices'] + [q['stem'] or ''], ensure_ascii=False)]
print('3a. stem says "underlined" but no <u> in passage:', need_u)
print('3b. <u> inside stem/choices (check):', extra_u[:20], len(extra_u))
need_blank = [q['id'] for q in qs if re.search(r'complete[s]? the (text|sentence|statement|comparison|example|claim)|blank', q['stem'] or '')
              and '___' not in stim_html(q)]
print('3c. completion question without blank:', need_blank)

# 4. rationale coverage -----------------------------------------------------
miss = [(q['id'], sorted(q['rationale']['byChoice'])) for q in qs if sorted(q['rationale']['byChoice']) != ['A', 'B', 'C', 'D']]
print('4. rationale not covering A-D:', len(miss)); print('   ', miss[:10])
wrong = [q['id'] for q in qs if 'best answer' not in q['rationale']['byChoice'].get(q['answer'], '')]
print('   correct-choice rationale lacks "best answer":', wrong[:10], len(wrong))

# 5. meta ---------------------------------------------------------------------
print('5. meta values:', collections.Counter(q['domain'] for q in qs), collections.Counter(q['difficulty'] for q in qs),
      collections.Counter(q['test'] for q in qs))
print('   duplicate ids:', [k for k, v in collections.Counter(q['id'] for q in qs).items() if v > 1])
print('   empty stems/choices:', [q['id'] for q in qs if not q['stem'] or any(not c['html'] for c in q['choices'])])
