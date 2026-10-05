# SAT CBQB Practice

The College Board SAT Suite Question Bank (CBQB) only exports questions as PDFs, which makes them hard to practice with and slow to check. This project turns the PDF into structured data and serves it in a Khan Academy–style practice site: pick an answer, press **Check**, and see right away why each choice is right or wrong.

**753 SAT Reading and Writing questions** (Bluebook practice test questions excluded) and **995 SAT Math questions** (772 multiple choice, 223 student-produced response), sorted by domain, skill and difficulty. Reading and Writing lives at `#/`, Math at `#/math`; each has its own skills page, Mockup Test and Analytics.

## Features

- Khan-style question screen: passage, “Choose 1 answer:”, Check / Try again / Next, explanations under every choice, progress dots
- Filters by difficulty (Easy / Medium / Hard) and by **New**, **Mistakes** or **All** questions; sets of 5, 10 or 20
- Passages keep their formatting: italics, bold, underlines, sub/superscripts (NH₃, ⁸⁷Sr), poems with their indentation, tables as real HTML tables, and charts
- Math: type grid-in answers (any equivalent form is accepted: `3/4`, `.75`, `0.75`), Desmos calculator and the reference sheet, Mockup Test modules of 22 questions in 35 minutes
- Analytics per subject: accuracy by domain, skill and difficulty, focus areas and strengths, 14-day activity
- Extras: cross out choices (like Bluebook), keyboard shortcuts (A–D or 1–4, Enter), a timer per question, the College Board question ID, links to specific questions
- Progress is saved to a local `progress/` folder (`progress.json` plus a full `history.jsonl` of every attempt), with a browser copy as backup

## Run it

```bash
cd web
npm install
npm run dev        # http://localhost:5173
```

`npm run dev` copies the question data from `data/` into the app automatically. Your progress is written to `progress/`, which git ignores.

## Repository layout

| Path | What it is |
|------|------------|
| `data/` | The extracted Reading and Writing bank: `questions.json`, `index.json`, and `figures/*.png`. The format is described in [`data/README.md`](data/README.md). |
| `data/math/` | The Math bank: `questions.json`, `index.json`, `sprites/<id>.png` (each question's math) and `figures/*.png`. |
| `web/` | The practice site (React + TypeScript + Vite). |
| `pipeline/` | The Python scripts (PyMuPDF) that turn a CBQB PDF export into `data/`. |

## Rebuilding the data from a new CBQB export

```bash
pip install pymupdf
cd pipeline
export CBQB_PDF=/path/to/questionbank-export.pdf
python3 cache.py && python3 parse.py && python3 validate.py && python3 export.py
```

Math comes from a separate export:

```bash
cd pipeline
CBQB_MATH_PDF=/path/to/math-export.pdf python3 math_parse.py && python3 math_export.py
```

In the Math export every formula is either a small raster image or vector glyph outlines, never text, so `math_parse.py` cuts each expression out of a text-free copy of the page at 4× and `math_export.py` packs a question's expressions into one sprite. Graphs become figures and ruled grids become tables.

The PDF stores all text in unnamed Type3 fonts, so italics and bold are recovered by grouping fonts by their glyph shapes (`fonts.py`). Those group IDs belong to one particular export, so a new export needs `fonts.py` re-run and the `STYLE` table in `parse.py` re-labelled. See `data/README.md` for details.

## Copyright

All questions, passages, explanations and charts are © College Board, from the SAT Suite Question Bank. This project is an independent study tool and is not affiliated with or endorsed by College Board or Khan Academy.
