// Rho MD starter plugin (CommonJS — do not use `import`/`export` syntax).
// Everything you can do comes through the `ctx` parameter: see
// PLUGIN_API_REFERENCE.md. Edit → Settings → Plugins → Manage → Reload.

module.exports = {
  activate(ctx) {
    // A command: runs from the palette (Ctrl+Shift+P) and the agent surface.
    ctx.subscriptions.push(
      ctx.commands.register({
        id: 'hello-panel.greet',
        title: 'Hello Panel: Greet',
        run() {
          return ctx.notifications.notify({ title: 'Hello from your plugin 👋' });
        },
      }),
    );

    // A sidebar section in the Explorer stack.
    ctx.subscriptions.push(
      ctx.sidebar.registerSection({
        id: 'hello-panel.section',
        title: 'Hello Panel',
        order: 130,
        mount(container, host) {
          const root = document.createElement('div');
          root.style.cssText = 'padding:8px 12px;font-size:12px;display:flex;flex-direction:column;gap:8px;';
          const p = document.createElement('div');
          p.textContent = 'This section comes from a local plugin. Edit main.js and hit Reload.';
          p.style.color = host.theme.textColor;
          const btn = document.createElement('button');
          btn.textContent = 'Say hello';
          btn.style.cssText = 'border:1px solid var(--border-color);background:transparent;color:inherit;border-radius:6px;padding:4px 10px;cursor:pointer;';
          btn.addEventListener('click', () => ctx.commands.execute('hello-panel.greet'));
          root.appendChild(p);
          root.appendChild(btn);
          container.appendChild(root);
          return () => root.remove();
        },
      }),
    );
  },
};
