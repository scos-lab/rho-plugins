// Self-running assert script: npx tsx src/plugins/dashboard/dashboard.test.ts
// Covers ingest (JSON/CSV → Dataset) and bake (config+dataset → markdown).

import assert from 'node:assert';
import { parseDataset } from './ingest';
import { bakeDashboard, effectiveMetrics } from './bake';
import { DEFAULT_CONFIG, GENERATOR_MARKER } from './model';
import type { DashboardConfig } from './model';

const NOW = new Date('2026-08-27T00:30:00+10:00');

// ── ingest: JSON ────────────────────────────────────────────────────────────
const jsonRaw = JSON.stringify([
  { date: '2026-08-24', sleep_h: 7.2, steps: 8100, note: 'text-col-dropped' },
  { date: '2026-08-26', sleep_h: null, steps: 4300 },
  { date: '2026-08-25', sleep_h: 8.1, steps: '9050' }, // string number coerces
  { notDated: true },                                   // skipped, not fatal
]);
const dsJson = parseDataset('health', jsonRaw, 'health.json', '/x/health.json', 1);
assert.strictEqual(dsJson.rows.length, 3);
assert.deepStrictEqual(dsJson.rows.map((r) => r.date), ['2026-08-24', '2026-08-25', '2026-08-26']);
assert.strictEqual(dsJson.rows[1].values.steps, 9050);
assert.strictEqual(dsJson.rows[2].values.sleep_h, null);       // honest gap
assert.ok(dsJson.metricKeys.includes('sleep_h') && dsJson.metricKeys.includes('steps'));
assert.strictEqual(dsJson.rows[0].values.note, null);          // non-numeric → null cell

// ── ingest: CSV ─────────────────────────────────────────────────────────────
const csvRaw = 'date,weight_kg,calories\n2026-08-20,71.2,2100\n2026-08-21,,1980\nbadline,1,2\n';
const dsCsv = parseDataset('body', csvRaw, 'body.csv', '/x/body.csv', 1);
assert.strictEqual(dsCsv.rows.length, 2);
assert.strictEqual(dsCsv.rows[1].values.weight_kg, null);
assert.strictEqual(dsCsv.rows[1].values.calories, 1980);

// ── ingest: shape errors are human messages ────────────────────────────────
assert.throws(() => parseDataset('e', '{}', 'e.json', '/e', 1), /array/);
assert.throws(() => parseDataset('e', 'x,y\n1,2\n', 'e.csv', '/e', 1), /first column/);

// ── bake: zero-config over a 30-day synthetic set ──────────────────────────
const rows = [];
for (let i = 0; i < 30; i++) {
  const d = new Date(Date.UTC(2026, 6, 28 + i)); // 2026-07-28 … 2026-08-26
  rows.push({
    date: d.toISOString().slice(0, 10),
    sleep_h: 7 + Math.sin(i / 3),
    steps: 6000 + (i % 7) * 500,
  });
}
const raw30 = JSON.stringify(rows);
const ds30 = parseDataset('health', raw30, 'health.json', '/x/health.json', 1);
const zeroConf: DashboardConfig = { dataset: 'health', title: 'Health', ...DEFAULT_CONFIG };
const md = bakeDashboard(zeroConf, ds30, NOW);

assert.ok(md.startsWith(`---\ngenerator: ${GENERATOR_MARKER}\n`), 'frontmatter gate marker first');
assert.ok(md.includes('# Health'));
assert.ok(md.includes('Data through 2026-08-26'), 'honesty banner has data-through');
assert.ok(md.includes('7/7** observed'), 'KPI window coverage');
assert.ok(md.includes('````layout grid cols=2\n:::card'), 'KPI card grid (2 metrics → cols=2)');
assert.ok((md.match(/```chart line/g) || []).length === 2, 'one line chart per metric');
assert.ok(md.includes('ylim = ['), 'auto ylim guards against zero-baseline flattening');
assert.ok(!md.includes('chart heatmap'), 'no heatmap unless configured');
assert.ok(md.includes('| date | sleep_h | steps |'), 'detail table header');
// Idempotence: same inputs → identical output.
assert.strictEqual(md, bakeDashboard(zeroConf, ds30, NOW));

// ── bake: configured metrics + heatmap + duration fmt ──────────────────────
const conf: DashboardConfig = {
  dataset: 'health',
  title: '健康仪表盘',
  kpiWindowDays: 7,
  trendWeeks: 8,
  detailDays: 7,
  heatmapMetric: 'steps',
  pipelineNote: 'RingConn → Health Connect',
  metrics: [
    { key: 'sleep_h', label: '睡眠', agg: 'mean', chart: 'line', fmt: 'duration_h', color: '#8b5cf6', ylim: [6, 10] },
    { key: 'steps', label: '步数', unit: '步', agg: 'mean', chart: 'bar', fmt: 'int' },
  ],
};
const md2 = bakeDashboard(conf, ds30, NOW);
assert.ok(md2.includes('# 健康仪表盘'));
assert.ok(/## \d+h \d{2}m/.test(md2), 'duration formatting in KPI');
assert.ok(md2.includes('ylim = [6, 10]'), 'explicit ylim wins');
assert.ok(md2.includes('```chart bar'), 'bar chart type respected');
assert.ok(md2.includes('```chart heatmap'), 'heatmap emitted when configured');
assert.ok(md2.includes('(Mon, '), 'heatmap weekday rows');
assert.ok(md2.includes('pipeline: RingConn → Health Connect'));

// ── auto metric specs ──────────────────────────────────────────────────────
const specs = effectiveMetrics(zeroConf, ds30);
assert.strictEqual(specs.length, 2);
assert.strictEqual(specs[0].fmt, 'raw');   // sleep has decimals
assert.strictEqual(specs[1].fmt, 'int');   // steps all integers

// ── regression: all-null column never becomes a metric card ────────────────
{
  const raw = JSON.stringify([
    { date: '2026-08-24', steps: 100, stages: null },
    { date: '2026-08-25', steps: 200, stages: null },
  ]);
  const ds = parseDataset('h', raw, 'h.json', '/h', 1);
  assert.deepStrictEqual(ds.metricKeys, ['steps'], 'all-null column must not register as a metric');
}

console.log('dashboard.test.ts: all assertions passed');
