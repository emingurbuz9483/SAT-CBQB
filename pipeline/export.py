"""parsed.pkl -> data/questions.json + data/index.json + data/figures/*.png"""
import pickle, json, os, re, collections
from html.parser import HTMLParser
import fitz

PDF = os.environ.get('CBQB_PDF', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'questionbank-export.pdf'))
OUT = os.environ.get('CBQB_OUT', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data'))

DOMAINS = {
    'Information and Ideas': ['Central Ideas and Details', 'Command of Evidence', 'Inferences'],
    'Craft and Structure': ['Words in Context', 'Text Structure and Purpose', 'Cross-Text Connections'],
    'Expression of Ideas': ['Rhetorical Synthesis', 'Transitions'],
    'Standard English Conventions': ['Boundaries', 'Form, Structure, and Sense'],
}
DIFF = ['Easy', 'Medium', 'Hard']
NOTES = {'source-defect:choice-drawn-as-bullet':
         'In the source PDF, choice D is printed as a bullet under choice C; it is restored here as choice D.'}

class Balance(HTMLParser):
    def __init__(s): super().__init__(); s.stack = []; s.ok = True
    def handle_starttag(s, t, a):
        if t != 'br': s.stack.append(t)
    def handle_endtag(s, t):
        if not s.stack or s.stack.pop() != t: s.ok = False

def balanced(h):
    p = Balance(); p.feed(h or ''); p.close(); return p.ok and not p.stack

def main():
    qs, problems = pickle.load(open('parsed.pkl', 'rb'))
    assert not problems, problems
    os.makedirs(f'{OUT}/figures', exist_ok=True)
    pdf = fitz.open(PDF)
    out = []; unbalanced = []
    for q in qs:
        stim = []
        for b in q['stimulus']:
            b = dict(b)
            if b['type'] == 'figure':
                x0, y0, x1, y1 = b.pop('_bbox'); page = b.pop('_page')
                clip = fitz.Rect(x0 - 8, y0 - 8, x1 + 8, y1 + 8)
                name = f"{q['id']}.png"
                pdf[page].get_pixmap(matrix=fitz.Matrix(3, 3), clip=clip).save(f'{OUT}/figures/{name}')
                b = {'type': 'figure', 'src': f'figures/{name}', 'width': round(clip.width), 'height': round(clip.height), 'alt': b['alt']}
            elif b['type'] == 'table':
                b.pop('_bbox'); b.pop('_page')
                if not b.get('caption'): b.pop('caption', None)
            elif b['type'] == 'label':
                b['html'] = re.sub(r'</?strong>', '', b['html'])
            stim.append(b)
        r = {'id': q['id'], 'test': q['test'], 'domain': q['domain'], 'skill': q['skill'], 'difficulty': q['difficulty'],
             'stimulus': stim, 'stem': q['stem'], 'choices': q['choices'], 'answer': q['answer'],
             'rationale': q['rationale'], 'source': q['source']}
        notes = [NOTES[i] for i in q.get('_issues', []) if i in NOTES]
        left = [i for i in q.get('_issues', []) if i not in NOTES]
        assert not left, (q['id'], left)
        if notes: r['notes'] = notes
        frags = [r['stem']] + [c['html'] for c in r['choices']] + r['rationale']['paragraphs'] + list(r['rationale']['byChoice'].values())
        for b in stim:
            frags += [b.get('html'), b.get('caption')] + b.get('items', []) + [l['html'] for l in b.get('lines', [])]
            frags += [c['html'] for row in b.get('rows', []) for c in row]
        if not all(balanced(f) for f in frags if f): unbalanced.append(q['id'])
        out.append(r)
    assert not unbalanced, unbalanced
    dom = list(DOMAINS)
    out.sort(key=lambda r: (dom.index(r['domain']), DOMAINS[r['domain']].index(r['skill']), DIFF.index(r['difficulty']), r['id']))
    with open(f'{OUT}/questions.json', 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    idx = {}
    for r in out:
        idx.setdefault(r['domain'], {}).setdefault(r['skill'], {}).setdefault(r['difficulty'], []).append(r['id'])
    with open(f'{OUT}/index.json', 'w', encoding='utf-8') as f:
        json.dump(idx, f, ensure_ascii=False, indent=1)
    print('wrote', len(out), 'questions;', len(os.listdir(f'{OUT}/figures')), 'figures')

if __name__ == '__main__':
    main()
