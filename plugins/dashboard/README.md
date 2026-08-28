# Dashboard (Beta)

Feed JSON/CSV time-series files (one row per day), get beautiful self-contained
dashboard documents back — KPI cards, trend charts, optional heatmap, detail
table, and an honesty banner (data-through / coverage).

**Open source (MIT).** This is an official Rho MD plugin and doubles as the
reference example of a real plugin: its own Activity Bar view, sidebar section,
settings panel, commands, and a pure bake engine — all speaking to the app only
through the documented `ctx` contract (`types/api.ts` in this repo).

- `src/` — TypeScript source. Start at `index.ts` (activate), then
  `engine.ts` (scan/refresh), `ingest.ts` (JSON/CSV → dataset),
  `bake.ts` (dataset → markdown).
- `build.sh` — one command: `src/index.ts` → `main.js` (CJS bundle).
- Known limit (why Beta): the input shape is fixed — daily rows only.
  Generalizing it (hourly / event-level data) is the graduation criterion;
  PRs welcome.
