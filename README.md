# SAT CBQB Practice

The College Board SAT Suite Question Bank (CBQB) only exports questions as PDFs, which makes them hard to practice with and slow to check. This project turns the PDF into structured data and serves it in a Khan Academy–style practice site: pick an answer, press **Check**, and see right away why each choice is right or wrong.

**753 SAT Reading and Writing questions** (Bluebook practice test questions excluded), sorted by domain, skill and difficulty.

## Features

- Khan-style question screen: passage, “Choose 1 answer:”, Check / Try again / Next, explanations under every choice, progress dots
- Filters by difficulty (Easy / Medium / Hard) and by **New**, **Mistakes** or **All** questions; sets of 5, 10 or 20
- Passages keep their formatting: italics, bold, underlines, sub/superscripts (NH₃, ⁸⁷Sr), poems with their indentation, tables as real HTML tables, and charts
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
| `data/` | The extracted question bank: `questions.json`, `index.json`, and `figures/*.png`. The format is described in [`data/README.md`](data/README.md). |
| `web/` | The practice site (React + TypeScript + Vite). |
| `pipeline/` | The Python scripts (PyMuPDF) that turn a CBQB PDF export into `data/`. |

## Rebuilding the data from a new CBQB export

```bash
pip install pymupdf
cd pipeline
export CBQB_PDF=/path/to/questionbank-export.pdf
python3 cache.py && python3 parse.py && python3 validate.py && python3 export.py
```

The PDF stores all text in unnamed Type3 fonts, so italics and bold are recovered by grouping fonts by their glyph shapes (`fonts.py`). Those group IDs belong to one particular export, so a new export needs `fonts.py` re-run and the `STYLE` table in `parse.py` re-labelled. See `data/README.md` for details.

## Copyright

All questions, passages, explanations and charts are © College Board, from the SAT Suite Question Bank. This project is an independent study tool and is not affiliated with or endorsed by College Board or Khan Academy.
