// Rho MD starter plugin (CommonJS — do not use `import`/`export` syntax).
// Everything you can do comes through the `ctx` parameter: see
// PLUGIN_API_REFERENCE.md. Edit → Settings → Plugins → Manage → Reload.

module.exports = {
  activate(ctx) {
    // Shared state: the command updates it, the section shows it — visible
    // feedback IN the panel (an OS notification alone is easy to miss).
    let clicks = 0;
    let statusEl = null;

    // A command: runs from the palette (Ctrl+Shift+P) and the agent surface.
    ctx.subscriptions.push(
      ctx.commands.register({
        id: 'hello-panel.greet',
        title: 'Hello Panel: Greet',
        run() {
          clicks++;
          if (statusEl) statusEl.textContent = `Hello! 👋 (× ${clicks})`;
          // Also fire an OS notification — may be muted by the system; the
          // in-panel line above is the feedback you can always see.
          return ctx.notifications.notify({ title: 'Hello from your plugin 👋' });
        },
      }),
    );

    // Your own Activity Bar icon — the convention: a plugin owns its view
    // (its own icon in the far-left column) instead of crowding the Explorer
    // stack. Reserve Explorer sections for ambient, glance-along content.
    ctx.subscriptions.push(
      ctx.views.registerView({
        id: 'hello-panel.view',
        title: 'Hello Panel',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
        order: 90,
      }),
    );

    // A section stacked under your view.
    ctx.subscriptions.push(
      ctx.sidebar.registerSection({
        id: 'hello-panel.section',
        title: 'Hello Panel',
        view: 'hello-panel.view',
        order: 10,
        mount(container, host) {
          const root = document.createElement('div');
          root.style.cssText = 'padding:8px 12px;font-size:12px;display:flex;flex-direction:column;gap:8px;';
          const p = document.createElement('div');
          p.textContent = 'This is a demo that teaches you how to build your own plugin. Edit main.js, hit Reload, and it changes live.';
          p.style.color = host.theme.textColor;
          const learn = document.createElement('button');
          learn.textContent = 'Learn how — full guide';
          learn.title = 'Opens the plugin-building guide. Read it yourself, or hand the whole page to an AI and let it build your plugin.';
          learn.style.cssText = 'border:1px solid var(--link-color);color:var(--link-color);background:transparent;border-radius:6px;padding:4px 10px;cursor:pointer;';
          learn.addEventListener('click', () => {
            ctx.commands.execute('rho.discover.openUrl', { url: 'https://rho.md/p/build-your-own-plugin' })
              .catch(() => ctx.notifications.notify({ title: 'Guide', body: 'rho.md/p/build-your-own-plugin' }));
          });
          const btn = document.createElement('button');
          btn.textContent = 'Say hello';
          btn.style.cssText = 'border:1px solid var(--border-color);background:transparent;color:inherit;border-radius:6px;padding:4px 10px;cursor:pointer;';
          btn.addEventListener('click', () => ctx.commands.execute('hello-panel.greet'));
          statusEl = document.createElement('div');
          statusEl.style.cssText = 'min-height:18px;font-weight:600;';
          statusEl.textContent = clicks ? `Hello! 👋 (× ${clicks})` : '';
          root.appendChild(p);
          root.appendChild(learn);
          root.appendChild(btn);
          root.appendChild(statusEl);
          container.appendChild(root);
          return () => root.remove();
        },
      }),
    );
  },
};
