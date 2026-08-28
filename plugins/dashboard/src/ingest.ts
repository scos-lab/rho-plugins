// Dashboard plugin — ingestion: dropped JSON/CSV file → normalized Dataset.
// Input shapes: JSON = array of {date, [metric]: number}; CSV = header row with
// `date` first. Empty cell / missing key = null (honest gaps, no cleaning).

import type { Dataset, DatasetRow } from './model';

/** File extensions the data folder scan picks up. */
export const DATA_EXTS = ['.json', '.csv'];

export function isDataFile(name: string): boolean {
  const lower = name.toLowerCase();
  return DATA_EXTS.some((e) => lower.endsWith(e)) && !name.startsWith('.');
}

export function datasetName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '');
}

/** Parse a data file's text into a Dataset. Throws with a human message on shape errors. */
export function parseDataset(
  name: string,
  raw: string,
  fileName: string,
  sourcePath: string,
  sourceMtime: number,
): Dataset {
  const rows = fileName.toLowerCase().endsWith('.csv') ? parseCsv(raw) : parseJson(raw);
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  // A column counts as a metric only if it was OBSERVED at least once — a key
  // that is null on every row (e.g. a nested-object column the parser skips)
  // would otherwise surface as an all-“—” card.
  const metricKeys: string[] = [];
  for (const r of rows) {
    for (const [k, v] of Object.entries(r.values)) {
      if (v !== null && !metricKeys.includes(k)) metricKeys.push(k);
    }
  }
  if (rows.length === 0) throw new Error(`${fileName}: no rows`);
  if (metricKeys.length === 0) throw new Error(`${fileName}: no numeric columns besides date`);
  return { name, rows, metricKeys, sourcePath, sourceMtime };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

function toCell(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

function parseJson(raw: string): DatasetRow[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error(`invalid JSON: ${e instanceof Error ? e.message : e}`);
  }
  if (!Array.isArray(data)) throw new Error('JSON must be an array of {date, ...} objects');
  const out: DatasetRow[] = [];
  for (const item of data) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as Record<string, unknown>;
    const date = String(rec.date ?? '');
    if (!DATE_RE.test(date)) continue; // rows without a date are skipped, not fatal
    const values: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(rec)) {
      if (k === 'date') continue;
      // Nested objects (e.g. sleep stages) are out of the v1 table model — skip.
      if (typeof v === 'object' && v !== null) continue;
      values[k] = toCell(v);
    }
    out.push({ date: date.slice(0, 10), values });
  }
  return out;
}

function parseCsv(raw: string): DatasetRow[] {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) throw new Error('CSV needs a header row and at least one data row');
  // v1: simple comma split — data files are machine-written; quoted commas are
  // out of scope (documented in the spec, revisit if a real file needs them).
  const header = lines[0].split(',').map((h) => h.trim());
  if (header[0].toLowerCase() !== 'date') throw new Error('CSV first column must be `date`');
  const out: DatasetRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    const date = (cells[0] ?? '').trim();
    if (!DATE_RE.test(date)) continue;
    const values: Record<string, number | null> = {};
    for (let i = 1; i < header.length; i++) {
      values[header[i]] = toCell(cells[i]);
    }
    out.push({ date: date.slice(0, 10), values });
  }
  return out;
}
