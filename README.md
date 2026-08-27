> **DRAFT** — this index is being set up; the install flow ships with the next Rho MD release.

# Rho MD community plugins

Plugins for [Rho MD](https://rho.md), built by people who like to tinker — most of them written with an AI assistant, and that's the intended way.

## Use a plugin

In Rho MD: **Settings → Plugins → Manage → Browse community plugins** — pick one, install, switch it on. Everything a plugin can do comes through the documented plugin API; an installed plugin runs with the same reach as the app, so install plugins you trust. Community plugins are provided by their authors, at your own risk.

## Write a plugin (no toolchain required)

1. Copy [`template/`](template/) into `<your Psi folder>/.rho/plugins/hello-panel/`.
2. Open Rho MD → Settings → Plugins → Manage → **Reload local plugins**. It's live.
3. Tell your AI assistant what you want the plugin to do, hand it `main.js` plus the
   [plugin API reference](https://github.com/scos-lab/markview/blob/master/docs/PLUGIN_API_REFERENCE.md), and iterate:
   edit → Reload → see it. If loading fails, the Manage page gives you a **Copy error** button —
   paste that into the AI and it usually fixes the plugin in one round.

A plugin is two files — `manifest.json` (id, name, version) and `main.js` (CommonJS,
`module.exports = { activate(ctx) {...} }`). No `import` syntax; everything comes through `ctx`.

## Share your plugin

PR this repo: add one entry to [`community-plugins.json`](community-plugins.json) pointing at your
repo's raw `manifest.json` and `main.js`. Review is a quick safety look, not a code-quality gate —
imperfect plugins are welcome; that's what iteration is for.
