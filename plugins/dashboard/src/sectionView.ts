// Dashboard plugin — sidebar section: dataset list + refresh/open actions.
// Plain-DOM mount per the SideBarSection contract; a subscribing view of the
// engine (state lives in the plugin closure, never here).

import type { SectionHost } from '../../../types/api';
import type { DashboardEngine, DatasetInfo } from './engine';

export interface SectionActions {
  refresh(name: string): void;
  open(info: DatasetInfo): void;
  openDataFolder(): void;
}

export function mountDashboardSection(
  container: HTMLElement,
  host: SectionHost,
  engine: DashboardEngine,
  actions: SectionActions,
): () => void {
  const root = document.createElement('div');
  root.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:6px 10px;font-size:12px;';
  container.appendChild(root);

  const btn = (label: string, title: string) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.title = title;
    b.style.cssText =
      'border:1px solid var(--border-color);background:transparent;color:inherit;' +
      'border-radius:5px;padding:1px 7px;font-size:11px;cursor:pointer;line-height:1.6;';
    return b;
  };

  function paint() {
    const s = engine.getState();
    root.textContent = '';

    if (!s.dataFolder) {
      const p = document.createElement('div');
      p.style.cssText = 'opacity:.75;line-height:1.5;';
      p.textContent = 'Set your Psi folder (or a data folder in Settings) to use dashboards.';
      root.appendChild(p);
      return;
    }

    if (s.datasets.length === 0) {
      const p = document.createElement('div');
      p.style.cssText = 'opacity:.75;line-height:1.5;';
      p.textContent = s.scanning
        ? 'Scanning…'
        : 'Drop a JSON or CSV time-series file into the data folder, then Refresh.';
      root.appendChild(p);
      const b = btn('Open data folder', s.dataFolder);
      b.addEventListener('click', () => actions.openDataFolder());
      root.appendChild(b);
      return;
    }

    for (const d of s.datasets) {
      const row = document.createElement('div');
      row.style.cssText =
        'display:flex;align-items:center;gap:6px;padding:4px 6px;border:1px solid var(--border-color);border-radius:6px;';

      const dot = document.createElement('span');
      const stale = d.error ? 'err' : d.staleDays !== null && d.staleDays > 3 ? 'stale' : 'ok';
      dot.style.cssText = `width:7px;height:7px;border-radius:50%;flex:none;background:${
        stale === 'err' ? '#ef4444' : stale === 'stale' ? '#f59e0b' : '#10b981'
      };`;
      dot.title = d.error ? d.error : d.dataThrough ? `data through ${d.dataThrough}` : '';
      row.appendChild(dot);

      const meta = document.createElement('div');
      meta.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;';
      const nm = document.createElement('span');
      nm.textContent = d.name;
      nm.style.cssText = 'font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      const sub = document.createElement('span');
      sub.style.cssText = 'opacity:.65;font-size:10.5px;';
      sub.textContent = d.error
        ? 'parse error — hover the dot'
        : `${d.rows} days · through ${d.dataThrough ?? '?'}`;
      meta.appendChild(nm);
      meta.appendChild(sub);
      row.appendChild(meta);

      if (!d.error) {
        const r = btn('Refresh', `Regenerate ${d.name}.md`);
        r.addEventListener('click', () => actions.refresh(d.name));
        row.appendChild(r);
        const o = btn('Open', d.outputPath ?? '');
        o.addEventListener('click', () => actions.open(d));
        row.appendChild(o);
      }
      root.appendChild(row);
    }
  }

  paint();
  const unsub = engine.subscribe(paint);
  void engine.scan();
  const themeSub = host.onThemeChange(() => paint());
  return () => {
    unsub();
    themeSub.dispose();
    root.remove();
  };
}
