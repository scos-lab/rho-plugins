// Dashboard plugin — 表芯: scan the data folder, hold dataset state, bake and
// write dashboards. Lives in the activate() closure (pomodoro precedent) so
// the sidebar section is just a subscribing view of it.

import type { PluginContext } from '../../../types/api';
import type { Dataset, DashboardConfig } from './model';
import { DEFAULT_CONFIG, GENERATOR_MARKER, resolveFolders } from './model';
import { isDataFile, datasetName, parseDataset } from './ingest';
import { bakeDashboard } from './bake';

export interface DatasetInfo {
  name: string;
  sourcePath: string;
  outputPath: string | null;   // null until folders resolve
  rows: number;
  dataThrough: string | null;  // newest date in the file
  staleDays: number | null;    // today - dataThrough
  error: string | null;        // parse failure (file listed, marked broken)
  dataset: Dataset | null;
}

export interface EngineState {
  dataFolder: string | null;
  outputFolder: string | null;
  datasets: DatasetInfo[];
  scanning: boolean;
  lastScan: number | null;
}

export interface DashboardEngine {
  getState(): EngineState;
  subscribe(cb: () => void): () => void;
  /** Re-list + re-parse the data folder. Cheap; safe to call on section mount. */
  scan(): Promise<void>;
  /** Bake one dataset and write its dashboard. Returns the output path. */
  refreshOne(name: string): Promise<string>;
  /** Scan, then bake every parseable dataset. Returns written paths. */
  refreshAll(): Promise<string[]>;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

export function createEngine(ctx: PluginContext): DashboardEngine {
  let state: EngineState = {
    dataFolder: null,
    outputFolder: null,
    datasets: [],
    scanning: false,
    lastScan: null,
  };
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((cb) => cb());
  const set = (patch: Partial<EngineState>) => {
    state = { ...state, ...patch };
    emit();
  };

  async function scan(): Promise<void> {
    set({ scanning: true });
    try {
      const { dataFolder, outputFolder } = await resolveFolders(ctx);
      if (!dataFolder) {
        set({ dataFolder, outputFolder, datasets: [], scanning: false, lastScan: Date.now() });
        return;
      }
      // First run: materialize the data folder so "Open data folder" has a
      // real target and the drop location exists before any file is dropped.
      // (createFile makes parent dirs; the dotfile is invisible to the scan.)
      if (!(await ctx.workspace.exists(dataFolder))) {
        await ctx.workspace.createFile(ctx.workspace.joinPath(dataFolder, '.keep'), '');
      }
      const entries = (await ctx.workspace.listFolder(dataFolder)).filter(
        (e) => !e.isDir && isDataFile(e.name),
      );
      // Same stem twice (health.json + health.csv): newest mtime wins.
      const byName = new Map<string, (typeof entries)[number]>();
      for (const e of entries) {
        const name = datasetName(e.name);
        const prev = byName.get(name);
        if (!prev || e.created > prev.created) byName.set(name, e);
      }
      const infos: DatasetInfo[] = [];
      for (const [name, entry] of byName) {
        const outputPath = outputFolder ? ctx.workspace.joinPath(outputFolder, `${name}.md`) : null;
        try {
          const raw = await ctx.workspace.readFile(entry.path);
          const ds = parseDataset(name, raw, entry.name, entry.path, entry.created);
          const dataThrough = ds.rows.length ? ds.rows[ds.rows.length - 1].date : null;
          infos.push({
            name,
            sourcePath: entry.path,
            outputPath,
            rows: ds.rows.length,
            dataThrough,
            staleDays: dataThrough ? daysBetween(dataThrough, todayIso()) : null,
            error: null,
            dataset: ds,
          });
        } catch (e) {
          infos.push({
            name,
            sourcePath: entry.path,
            outputPath,
            rows: 0,
            dataThrough: null,
            staleDays: null,
            error: e instanceof Error ? e.message : String(e),
            dataset: null,
          });
        }
      }
      infos.sort((a, b) => a.name.localeCompare(b.name));
      set({ dataFolder, outputFolder, datasets: infos, scanning: false, lastScan: Date.now() });
    } catch (e) {
      console.error('[dashboard] scan failed', e);
      set({ scanning: false, lastScan: Date.now() });
    }
  }

  async function configFor(name: string): Promise<DashboardConfig> {
    const stored = await ctx.settings.get<Partial<DashboardConfig> | null>(`config:${name}`, null);
    return {
      dataset: name,
      title: stored?.title ?? name,
      ...DEFAULT_CONFIG,
      ...(stored ?? {}),
    } as DashboardConfig;
  }

  async function refreshOne(name: string): Promise<string> {
    const info = state.datasets.find((d) => d.name === name);
    if (!info || !info.dataset) throw new Error(`dataset '${name}' not loaded${info?.error ? `: ${info.error}` : ''}`);
    if (!info.outputPath) throw new Error('output folder not configured (set the Psi folder or a dashboard output folder)');
    const config = await configFor(name);
    const md = bakeDashboard(config, info.dataset, new Date());
    // Generator gate: never overwrite a file we did not generate.
    if (await ctx.workspace.exists(info.outputPath)) {
      const head = (await ctx.workspace.readFile(info.outputPath).catch(() => '')).slice(0, 400);
      if (!head.includes(`generator: ${GENERATOR_MARKER.split('/')[0]}`)) {
        throw new Error(
          `${info.outputPath} exists but was not generated by Dashboard — refusing to overwrite. Rename or move it.`,
        );
      }
      await ctx.workspace.writeFile(info.outputPath, md);
    } else {
      await ctx.workspace.createFile(info.outputPath, md);
    }
    return info.outputPath;
  }

  async function refreshAll(): Promise<string[]> {
    await scan();
    const written: string[] = [];
    for (const d of state.datasets) {
      if (!d.dataset) continue;
      try {
        written.push(await refreshOne(d.name));
      } catch (e) {
        console.error(`[dashboard] refresh '${d.name}' failed`, e);
        void ctx.notifications.notify({
          title: 'Dashboard refresh failed',
          body: `${d.name}: ${e instanceof Error ? e.message : e}`,
        });
      }
    }
    return written;
  }

  return {
    getState: () => state,
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    scan,
    refreshOne,
    refreshAll,
  };
}
