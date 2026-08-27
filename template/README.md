# Rho MD plugin starter

Copy this folder to `<your Psi folder>/.rho/plugins/hello-panel/`, then in
Rho MD open **Settings → Plugins → Manage → Reload local plugins**. The plugin
appears in the list with a **Local** tag — switch it on.

- `manifest.json` — id (must equal the folder name), name, version.
- `main.js` — CommonJS module: `module.exports = { activate(ctx) {...} }`.
  No `import`/`export` syntax; everything comes through `ctx`
  (see PLUGIN_API_REFERENCE.md). TypeScript users: build with
  `esbuild src/main.ts --bundle --format=cjs --outfile=main.js`.

If loading fails, the Manage page shows a copyable error card — paste it into
your AI assistant together with your `main.js` and it can usually fix the
plugin in one round.
