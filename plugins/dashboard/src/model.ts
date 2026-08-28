// Dashboard plugin — data model & folder conventions.
// Data model & folder conventions.

import type { PluginContext } from '../../../types/api';

/** One normalized time-series table: what a dropped JSON/CSV file becomes. */
export interface Dataset {
  name: string;                 // file stem, e.g. 'health'
  /** Ascending by date. Missing measurements are null (never interpolated). */
  rows: DatasetRow[];
  /** Numeric columns discovered in the file, in first-seen order. */
  metricKeys: string[];
  sourcePath: string;
  sourceMtime: number;
}

export interface DatasetRow {
  date: string;                             // ISO yyyy-mm-dd
  values: Record<string, number | null>;
}

export interface MetricSpec {
  key: string;
  label: string;
  unit?: string;
  color?: string;                            // #hex or AINP palette name
  agg: 'mean' | 'sum' | 'last' | 'min' | 'max';
  chart: 'line' | 'bar' | 'none';
  ylim?: [number, number];
  fmt?: 'duration_h' | 'int' | 'pct' | 'raw';
}

export interface DashboardConfig {
  dataset: string;
  title: string;
  metrics: MetricSpec[];        // empty = auto-discover all numeric columns
  kpiWindowDays: number;        // default 7
  trendWeeks: number;           // default 8
  detailDays: number;           // default 7
  heatmapMetric?: string;
  pipelineNote?: string;
}

/** Frontmatter marker that gates overwrites — never eat a user file. */
export const GENERATOR_MARKER = 'rho-dashboard/v1';

export const DEFAULT_CONFIG: Omit<DashboardConfig, 'dataset' | 'title'> = {
  metrics: [],
  kpiWindowDays: 7,
  trendWeeks: 8,
  detailDays: 7,
};

/** Default trend-card colors, cycled when a metric doesn't pin one. */
export const METRIC_COLORS = ['#8b5cf6', '#10b981', '#ef4444', '#3b82f6', '#f59e0b', '#06b6d4'];

/** Settings keys (namespaced per plugin by the host). */
export const SETTINGS = {
  dataFolder: 'dataFolder',
  outputFolder: 'outputFolder',
  refreshOnStartup: 'refreshOnStartup',
} as const;

/** Resolve the data/output folders: explicit setting wins, else `<psi>/Dashboards[/data]`. */
export async function resolveFolders(
  ctx: PluginContext,
): Promise<{ dataFolder: string | null; outputFolder: string | null }> {
  const psi = ctx.workspace.notesFolder();
  const dataFolder =
    (await ctx.settings.get<string>(SETTINGS.dataFolder, '')) ||
    (psi ? ctx.workspace.joinPath(psi, 'Dashboards', 'data') : null);
  const outputFolder =
    (await ctx.settings.get<string>(SETTINGS.outputFolder, '')) ||
    (psi ? ctx.workspace.joinPath(psi, 'Dashboards') : null);
  return { dataFolder, outputFolder };
}
