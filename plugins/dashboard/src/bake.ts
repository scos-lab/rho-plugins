// Dashboard plugin — bake: pure function (config, dataset, now) → markdown.
// Idempotent whole-document regeneration; no incremental patching.
// The output is a SELF-CONTAINED AINP document: chart data is inlined in the
// fences, so the file renders published / synced / off this machine.
//
// Template v1 (the real-machine-verified demo shape): title + honesty banner →
// KPI cards (layout cols=4) → trend card grid (cols=2) → optional weekday×week
// heatmap → detail table → methodology note → generated footer.

import type { Dataset, DashboardConfig, MetricSpec } from './model';
import { GENERATOR_MARKER, METRIC_COLORS } from './model';

const DAY_MS = 86400000;

// ---------------------------------------------------------------------------
// date helpers (all UTC on yyyy-mm-dd strings — no TZ drift)
// ---------------------------------------------------------------------------

const iso = (t: number): string => new Date(t).toISOString().slice(0, 10);
const parse = (d: string): number => Date.parse(`${d}T00:00:00Z`);

/** Monday-start week anchor for a yyyy-mm-dd date. */
function weekStart(d: string): string {
  const t = parse(d);
  const dow = (new Date(t).getUTCDay() + 6) % 7; // Mon=0
  return iso(t - dow * DAY_MS);
}

// ---------------------------------------------------------------------------
// aggregation
// ---------------------------------------------------------------------------

function agg(values: number[], how: MetricSpec['agg']): number | null {
  if (values.length === 0) return null;
  switch (how) {
    case 'mean': return values.reduce((a, b) => a + b, 0) / values.length;
    case 'sum': return values.reduce((a, b) => a + b, 0);
    case 'last': return values[values.length - 1];
    case 'min': return Math.min(...values);
    case 'max': return Math.max(...values);
  }
}

function windowValues(ds: Dataset, key: string, from: string, to: string): number[] {
  const out: number[] = [];
  for (const r of ds.rows) {
    if (r.date >= from && r.date <= to) {
      const v = r.values[key];
      if (v !== null && v !== undefined) out.push(v);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// formatting
// ---------------------------------------------------------------------------

function fmtValue(v: number | null, fmt: MetricSpec['fmt']): string {
  if (v === null) return '—';
  switch (fmt) {
    case 'duration_h': {
      const m = Math.round(v * 60);
      return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
    }
    case 'int': return Math.round(v).toLocaleString('en-US');
    case 'pct': return `${v.toFixed(1)}%`;
    default:
      return Number.isInteger(v) ? v.toLocaleString('en-US') : v.toFixed(1);
  }
}

function fmtDelta(cur: number | null, prev: number | null, fmt: MetricSpec['fmt'], unit?: string): string {
  if (cur === null || prev === null) return '—';
  const d = cur - prev;
  const arrow = d > 1e-9 ? '↑' : d < -1e-9 ? '↓' : '→';
  const sign = d > 0 ? '+' : d < 0 ? '−' : '';
  let mag: string;
  switch (fmt) {
    case 'duration_h': mag = `${Math.abs(Math.round(d * 60))}m`; break;
    case 'int': mag = Math.abs(Math.round(d)).toLocaleString('en-US'); break;
    case 'pct': mag = `${Math.abs(d).toFixed(1)}%`; break;
    default: mag = Math.abs(d) >= 100 ? Math.abs(Math.round(d)).toLocaleString('en-US') : Math.abs(d).toFixed(1);
  }
  const u = fmt === 'pct' || fmt === 'duration_h' ? '' : unit ? ` ${unit}` : '';
  return `${arrow} ${sign}${mag}${u}`;
}

/** Chart tuple list: [(x, y), ...] with y rounded to 2dp. */
function tuples(pairs: Array<[string, number]>): string {
  return `[${pairs.map(([x, y]) => `(${x}, ${Math.round(y * 100) / 100})`).join(', ')}]`;
}

// ---------------------------------------------------------------------------
// auto-config (zero-config path: every numeric column becomes a line metric)
// ---------------------------------------------------------------------------

function autoFmt(ds: Dataset, key: string): MetricSpec['fmt'] {
  let sawAny = false;
  for (const r of ds.rows) {
    const v = r.values[key];
    if (v === null || v === undefined) continue;
    sawAny = true;
    if (!Number.isInteger(v)) return 'raw';
  }
  return sawAny ? 'int' : 'raw';
}

export function effectiveMetrics(config: DashboardConfig, ds: Dataset): MetricSpec[] {
  const base: MetricSpec[] =
    config.metrics.length > 0
      ? config.metrics
      : ds.metricKeys.map((key) => ({ key, label: key, agg: 'mean' as const, chart: 'line' as const }));
  return base.map((m, i) => ({
    fmt: autoFmt(ds, m.key),
    color: METRIC_COLORS[i % METRIC_COLORS.length],
    ...m,
  }));
}

// ---------------------------------------------------------------------------
// bake
// ---------------------------------------------------------------------------

export function bakeDashboard(config: DashboardConfig, ds: Dataset, now: Date): string {
  const metrics = effectiveMetrics(config, ds);
  const newest = ds.rows[ds.rows.length - 1].date;
  const oldest = ds.rows[0].date;
  const spanDays = Math.round((parse(newest) - parse(oldest)) / DAY_MS) + 1;
  const observedDays = ds.rows.filter((r) => Object.values(r.values).some((v) => v !== null)).length;

  const N = config.kpiWindowDays;
  const kpiTo = newest;
  const kpiFrom = iso(parse(newest) - (N - 1) * DAY_MS);
  const prevTo = iso(parse(kpiFrom) - DAY_MS);
  const prevFrom = iso(parse(prevTo) - (N - 1) * DAY_MS);
  const kpiObserved = ds.rows.filter(
    (r) => r.date >= kpiFrom && r.date <= kpiTo && Object.values(r.values).some((v) => v !== null),
  ).length;

  // Weekly series per metric, trailing trendWeeks.
  const byWeek = new Map<string, typeof ds.rows>();
  for (const r of ds.rows) {
    const w = weekStart(r.date);
    if (!byWeek.has(w)) byWeek.set(w, []);
    byWeek.get(w)!.push(r);
  }
  const weeks = [...byWeek.keys()].sort().slice(-config.trendWeeks);

  const weekly = (m: MetricSpec): Array<[string, number]> => {
    const out: Array<[string, number]> = [];
    for (const w of weeks) {
      const vals = byWeek.get(w)!
        .map((r) => r.values[m.key])
        .filter((v): v is number => v !== null && v !== undefined);
      const a = agg(vals, m.agg);
      if (a !== null) out.push([w, a]);
    }
    return out;
  };

  const L: string[] = [];
  L.push('---');
  L.push(`generator: ${GENERATOR_MARKER}`);
  L.push(`dataset: ${ds.name}`);
  L.push(`generated_at: ${now.toISOString()}`);
  L.push('---');
  L.push('');
  L.push(`# ${config.title}`);
  L.push('');
  const pipeline = config.pipelineNote ? ` · pipeline: ${config.pipelineNote}` : '';
  L.push(
    `> [!info] **Data through ${newest}** · last ${N} days: **${kpiObserved}/${N}** observed · ` +
      `overall ${observedDays}/${spanDays} days${pipeline}`,
  );
  L.push('');

  // ── KPI cards ────────────────────────────────────────────────────────────
  L.push('## Overview');
  L.push('');
  L.push(`\`\`\`\`layout grid cols=${Math.min(4, Math.max(1, metrics.length))}`);
  for (const m of metrics) {
    const cur = agg(windowValues(ds, m.key, kpiFrom, kpiTo), m.agg);
    const prev = agg(windowValues(ds, m.key, prevFrom, prevTo), m.agg);
    L.push(`:::card accent=${accentFor(m)} title="${m.label}"`);
    L.push(`## ${fmtValue(cur, m.fmt)}${m.fmt === 'pct' || m.fmt === 'duration_h' ? '' : m.unit ? ` ${m.unit}` : ''}`);
    L.push(`${aggLabel(m.agg)} · last ${N} days`);
    L.push(`${fmtDelta(cur, prev, m.fmt, m.unit)} vs prior ${N}`);
    L.push(':::');
  }
  L.push('````');
  L.push('');

  // ── Trend cards ──────────────────────────────────────────────────────────
  const charted = metrics.filter((m) => m.chart !== 'none');
  if (charted.length > 0 && weeks.length >= 2) {
    L.push(`## Trends · ${weeks.length} weeks`);
    L.push('');
    L.push('````layout grid cols=2');
    for (const m of charted) {
      const series = weekly(m);
      if (series.length < 2) continue;
      L.push(`:::card accent=${accentFor(m)} title="${m.label} · weekly ${m.agg}"`);
      L.push(`\`\`\`chart ${m.chart}`);
      L.push(`data = ${tuples(series)}`);
      if (m.unit) L.push(`ylabel = ${m.unit}`);
      const lim = m.ylim ?? (m.chart === 'line' ? autoYlim(series) : undefined);
      if (lim) L.push(`ylim = [${lim[0]}, ${lim[1]}]`);
      L.push(`color = ${m.color}`);
      L.push('```');
      L.push(':::');
    }
    L.push('````');
    L.push('');
  }

  // ── Weekday × week heatmap (opt-in via config.heatmapMetric) ─────────────
  const heatKey = config.heatmapMetric;
  const heatMetric = heatKey ? metrics.find((m) => m.key === heatKey) : undefined;
  if (heatMetric && weeks.length >= 2) {
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const rows: string[] = [];
    for (let wd = 0; wd < 7; wd++) {
      const cells: number[] = [];
      for (const w of weeks) {
        const date = iso(parse(w) + wd * DAY_MS);
        const rec = byWeek.get(w)!.find((r) => r.date === date);
        const v = rec ? rec.values[heatMetric.key] : null;
        cells.push(v ?? 0);
      }
      rows.push(`(${dayNames[wd]}, ${cells.map((c) => Math.round(c)).join(', ')})`);
    }
    L.push(`## ${heatMetric.label} · weekday rhythm`);
    L.push('');
    L.push('```chart heatmap');
    L.push(`data = [${rows.join(', ')}]`);
    L.push(`xlabel = week (${weeks[0]} → ${weeks[weeks.length - 1]})`);
    L.push('```');
    L.push('');
  }

  // ── Detail table ─────────────────────────────────────────────────────────
  const detail = ds.rows.slice(-config.detailDays);
  L.push(`## Last ${detail.length} days`);
  L.push('');
  L.push(`| date | ${metrics.map((m) => m.label).join(' | ')} |`);
  L.push(`|---|${metrics.map(() => '---').join('|')}|`);
  for (const r of detail) {
    L.push(`| ${r.date} | ${metrics.map((m) => fmtValue(r.values[m.key] ?? null, m.fmt)).join(' | ')} |`);
  }
  L.push('');
  L.push('> [!note] Missing days are shown as-is — no interpolation, no back-filling. Aggregates use observed days only.');
  L.push('');
  L.push('---');
  L.push('');
  L.push(
    `*Generated by the Dashboard plugin from \`${ds.name}\` · self-contained AINP document — renders anywhere, no live data source required.*`,
  );
  L.push('');
  return L.join('\n');
}

/** Card accent from the metric color (nearest named accent in the AINP card palette). */
function accentFor(m: MetricSpec): string {
  const c = (m.color ?? '').toLowerCase();
  if (c.startsWith('#8b5cf6') || c.includes('purple')) return 'purple';
  if (c.startsWith('#10b981') || c.includes('green')) return 'green';
  if (c.startsWith('#ef4444') || c.includes('red')) return 'red';
  if (c.startsWith('#3b82f6') || c.includes('blue')) return 'blue';
  if (c.startsWith('#f59e0b') || c.includes('yellow') || c.includes('orange')) return 'yellow';
  return 'gray';
}

function aggLabel(a: MetricSpec['agg']): string {
  return { mean: 'daily mean', sum: 'total', last: 'latest', min: 'minimum', max: 'maximum' }[a];
}

/** Padded y-range so weekly lines don't flatten against a zero baseline. */
function autoYlim(series: Array<[string, number]>): [number, number] | undefined {
  const ys = series.map(([, y]) => y);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  if (min === max) return undefined;
  const pad = (max - min) * 0.25;
  const lo = niceFloor(min - pad);
  const hi = niceCeil(max + pad);
  // A zero-anchored range is fine when the data actually lives near zero.
  return [Math.max(0, lo), hi];
}

/** Snap to the 1/2/2.5/5/10 “nice number” ladder — a raw power-of-ten step
 *  turns 16k into 20k and drowns the line in dead headroom. */
const NICE_STEPS = [1, 2, 2.5, 5, 10];

function niceFloor(v: number): number {
  if (v <= 0) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.floor(v / mag) * mag;
}

function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  for (const s of NICE_STEPS) {
    if (v <= s * mag) return s * mag;
  }
  return 10 * mag;
}
