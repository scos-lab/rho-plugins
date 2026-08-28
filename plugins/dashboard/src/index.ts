// Rho MD — Dashboard (official plugin): feed data files → auto-generate a
// beautiful, self-contained AINP dashboard document.
//
// Data flow: drop
// JSON/CSV into the data folder → scan/parse (ingest.ts) → pure-function bake
// (bake.ts) → write `<output>/<dataset>.md` behind the generator-marker gate
// (engine.ts). The document itself is plain AINP — publish/sync/read anywhere.
//
// Like every plugin it talks to the host ONLY through PluginContext.

import type { RhoPlugin, PluginContext } from '../../../types/api';
import { createEngine } from './engine';
import { mountDashboardSection } from './sectionView';
import { mountDashboardSettings } from './settingsView';
import { SETTINGS } from './model';

// lucide `layout-dashboard` — the canonical dashboard glyph.
const DASH_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`;

const dashboardPlugin: RhoPlugin = {
  id: 'rho.dashboard',
  description: 'Feed JSON/CSV time-series files, get self-contained dashboard documents back.',
  name: 'Dashboard',
  icon: DASH_ICON,

  activate(ctx: PluginContext) {
    const engine = createEngine(ctx);

    const openOutput = async (path: string) => {
      await ctx.workspace.openFile(path);
    };

    // ── Commands (palette / agent socket / section buttons — one surface) ──
    ctx.subscriptions.push(
      ctx.commands.register({
        id: 'rho.dashboard.refreshAll',
        title: 'Dashboard: Refresh All',
        access: 'write-file',
        stl: '[data_folder] -> [dashboards] ::mod(action="regenerated", source="rho.dashboard")',
        async run() {
          const written = await engine.refreshAll();
          return { written };
        },
      }),
      ctx.commands.register({
        id: 'rho.dashboard.refresh',
        title: 'Dashboard: Refresh Dataset',
        access: 'write-file',
        params: '{dataset}',
        async run(arg?: unknown) {
          const name =
            typeof arg === 'string'
              ? arg
              : (arg as { dataset?: string } | undefined)?.dataset;
          if (!name) throw new Error('dataset name required');
          await engine.scan();
          const path = await engine.refreshOne(name);
          await openOutput(path);
          return { path };
        },
      }),
      ctx.commands.register({
        id: 'rho.dashboard.openDataFolder',
        title: 'Dashboard: Open Data Folder',
        async run() {
          const s = engine.getState();
          if (s.dataFolder) await ctx.workspace.openFile(s.dataFolder).catch(() => undefined);
          return { dataFolder: s.dataFolder };
        },
      }),
    );

    // ── Own Activity Bar view (convention: plugins own their icon —
    // the Explorer stack is for ambient companions, not a junk drawer) ─────
    ctx.subscriptions.push(
      ctx.views.registerView({
        id: 'rho.dashboard.view',
        title: 'Dashboards',
        icon: DASH_ICON,
        order: 70,
      }),
    );
    ctx.subscriptions.push(
      ctx.sidebar.registerSection({
        id: 'rho.dashboard.section',
        title: 'Dashboards',
        icon: DASH_ICON,
        view: 'rho.dashboard.view',
        order: 10,
        mount(container, host) {
          return mountDashboardSection(container, host, engine, {
            refresh(name) {
              void engine
                .refreshOne(name)
                .then((p) => openOutput(p))
                .catch((e) =>
                  ctx.notifications.notify({
                    title: 'Dashboard refresh failed',
                    body: e instanceof Error ? e.message : String(e),
                  }),
                );
            },
            open(info) {
              if (info.outputPath) void openOutput(info.outputPath);
            },
            openDataFolder() {
              void ctx.commands.execute('rho.dashboard.openDataFolder');
            },
          });
        },
      }),
    );

    // ── Settings page ──────────────────────────────────────────────────────
    ctx.subscriptions.push(
      ctx.settings.registerPanel({
        id: 'rho.dashboard.settings',
        title: 'Dashboard',
        icon: DASH_ICON,
        mount(container, host) {
          return mountDashboardSettings(container, host, ctx, () => void engine.scan());
        },
      }),
    );

    // ── Startup refresh (default on; output is idempotent) ─────────────────
    void ctx.settings.get<boolean>(SETTINGS.refreshOnStartup, true).then((on) => {
      if (on) {
        setTimeout(() => {
          void engine.refreshAll().catch((e) => console.error('[dashboard] startup refresh', e));
        }, 2500);
      }
    });
  },
};

export default dashboardPlugin;
