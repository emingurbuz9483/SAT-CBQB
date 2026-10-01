# web: the practice site

React 19 + TypeScript + Vite. No backend is needed. Question data is fetched as static JSON.

```bash
npm install
npm run dev      # dev server; also saves progress to ../progress/
npm run build    # production build in dist/
npm run lint
```

- `scripts/prepare-data.mjs` splits `../data/questions.json` into `public/data/catalog.json` and one file per skill. It runs automatically before `dev` and `build`.
- `vite.config.ts` adds a small `/api/progress` endpoint for the dev and preview servers. It writes `../progress/progress.json` and appends to `../progress/history.jsonl`. When that endpoint isn't available, as on static hosting, progress stays in the browser's `localStorage`.
- `src/components/`: `Home` (skill list and filters), `Practice` (session flow), `QuestionView` (choices), `Stimulus` (passages, verse, tables, figures) and `Summary`.
