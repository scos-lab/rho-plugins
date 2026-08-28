// Dashboard plugin — settings page (settings.registerPanel contract):
// data folder / output folder / refresh-on-startup.

import type { PluginContext, SectionHost } from '../../../types/api';
import { SETTINGS, resolveFolders } from './model';

export function mountDashboardSettings(
  container: HTMLElement,
  _host: SectionHost,
  ctx: PluginContext,
  onChanged: () => void,
): () => void {
  const root = document.createElement('div');
  root.style.cssText = 'display:flex;flex-direction:column;gap:14px;font-size:13px;max-width:560px;';
  container.appendChild(root);

  const folderRow = (label: string, key: string, hint: string) => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
    const lab = document.createElement('div');
    lab.textContent = label;
    lab.style.cssText = 'font-weight:600;';
    const val = document.createElement('div');
    val.style.cssText =
      'font-family:ui-monospace,monospace;font-size:11.5px;opacity:.8;overflow-wrap:anywhere;';
    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:8px;';
    const choose = document.createElement('button');
    choose.textContent = 'Choose…';
    const reset = document.createElement('button');
    reset.textContent = 'Reset to default';
    for (const b of [choose, reset]) {
      b.style.cssText =
        'border:1px solid var(--border-color);background:transparent;color:inherit;border-radius:6px;padding:3px 10px;cursor:pointer;font-size:12px;';
    }
    const note = document.createElement('div');
    note.textContent = hint;
    note.style.cssText = 'opacity:.6;font-size:11.5px;';

    const repaint = async () => {
      const folders = await resolveFolders(ctx);
      const stored = await ctx.settings.get<string>(key, '');
      const effective = key === SETTINGS.dataFolder ? folders.dataFolder : folders.outputFolder;
      val.textContent = (effective ?? 'not configured') + (stored ? '' : '  (default)');
    };
    choose.addEventListener('click', async () => {
      const picked = await ctx.workspace.pickFolder(label);
      if (picked) {
        await ctx.settings.set(key, picked);
        await repaint();
        onChanged();
      }
    });
    reset.addEventListener('click', async () => {
      await ctx.settings.set(key, '');
      await repaint();
      onChanged();
    });
    void repaint();
    btns.appendChild(choose);
    btns.appendChild(reset);
    wrap.appendChild(lab);
    wrap.appendChild(val);
    wrap.appendChild(btns);
    wrap.appendChild(note);
    return wrap;
  };

  root.appendChild(
    folderRow('Data folder', SETTINGS.dataFolder, 'Where dropped JSON/CSV time-series files are scanned from.'),
  );
  root.appendChild(
    folderRow('Output folder', SETTINGS.outputFolder, 'Where generated dashboard .md documents are written.'),
  );

  const toggleWrap = document.createElement('label');
  toggleWrap.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  void ctx.settings.get<boolean>(SETTINGS.refreshOnStartup, true).then((v) => {
    cb.checked = v;
  });
  cb.addEventListener('change', () => void ctx.settings.set(SETTINGS.refreshOnStartup, cb.checked));
  const txt = document.createElement('span');
  txt.textContent = 'Refresh all dashboards on startup';
  toggleWrap.appendChild(cb);
  toggleWrap.appendChild(txt);
  root.appendChild(toggleWrap);

  return () => root.remove();
}
