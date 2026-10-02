# CBQB question data

Extracted from `questionbank-export-2026-10-1.pdf` (1,977 pages), then limited to the **753 Reading and Writing questions** in `questionbank-export-2026-10-2.pdf` (805 pages), which leaves out every question that appears in a Bluebook practice test.

- `questions.json`: all questions, sorted by domain → skill → difficulty (Easy, Medium, Hard), in College Board's official order.
- `index.json`: `{domain: {skill: {difficulty: [question ids]}}}` for menus and filters.
- `figures/<id>.png`: the 26 charts, rendered at 3× from the PDF's vector drawings.

## Question object

```jsonc
{
  "id": "a15b3219",                       // College Board question ID
  "test": "Reading and Writing",
  "domain": "Information and Ideas",
  "skill": "Command of Evidence",
  "difficulty": "Hard",                   // Easy | Medium | Hard
  "stimulus": [ /* blocks, in reading order (see below) */ ],
  "stem": "Which choice best describes data from the graph that weaken the team’s hypothesis?",
  "choices": [ { "letter": "A", "html": "…" }, … ],   // always A–D
  "answer": "B",
  "rationale": {
    "paragraphs": ["Choice B is the best answer because …", "…"],
    "byChoice": { "A": "Choice A is incorrect because …", "B": "…", "C": "…", "D": "…" }
  },
  "source": { "pdfPages": [7, 8] },
  "notes": ["…"]                          // only when the source PDF had a defect we corrected
}
```

## Stimulus blocks

| type     | fields | meaning |
|----------|--------|---------|
| `p`      | `html` | ordinary paragraph |
| `quote`  | `html`, optional `indent` | indented passage (prose excerpt, one verse line, a speech) |
| `quote`  | `lines: [{html, indent?}]` | verse with line breaks; `indent` is extra indentation in **em** |
| `list`   | `items: [html]` | bulleted list ("a student has taken the following notes") |
| `label`  | `html` | heading such as `Text 1` / `Text 2` |
| `table`  | `caption?`, `rows: [[{html, header?, align?, colspan?, rowspan?}]]` | data table rebuilt as real cells |
| `figure` | `src`, `width`, `height` (pt), `alt` | chart image + its text for screen readers |

## Inline HTML

Every `html` string is well-formed and uses only these tags:

- `<em>`: italics (titles, species names, emphasis)
- `<strong>`: bold (mostly table headers)
- `<u>`: underlined portions ("the underlined sentence")
- `<sub>`, `<sup>`: e.g. NH<sub>3</sub>, <sup>87</sup>Sr

Blanks are written as `______`. Curly quotes, dashes and accented letters are kept as in the original.

## How styles were recovered

The PDF stores all text in unnamed Type3 fonts, so it never labels anything as italic or bold. Each font was identified by the shapes of its glyphs, and the resulting groups were checked visually: regular, bold, italic and bold-italic. The ~940 characters drawn by tiny one-glyph fonts (accented letters, some quotes and dashes) take the style of the word they appear in. All 35 such letter fonts were checked against the rendered page.

## Rebuilding

See `../pipeline/`. Run `cache.py`, then `parse.py`, `validate.py` and `export.py` (needs PyMuPDF; set `CBQB_PDF` to the PDF path). The font-group IDs in `parse.py`'s `STYLE` table belong to this particular export. A new PDF export needs `fonts.py` re-run and the groups re-labelled.
