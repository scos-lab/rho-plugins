var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// plugins/dashboard/src/index.ts
var index_exports = {};
__export(index_exports, {
  default: () => index_default
});
module.exports = __toCommonJS(index_exports);

// plugins/dashboard/src/model.ts
var GENERATOR_MARKER = "rho-dashboard/v1";
var DEFAULT_CONFIG = {
  metrics: [],
  kpiWindowDays: 7,
  trendWeeks: 8,
  detailDays: 7
};
var METRIC_COLORS = ["#8b5cf6", "#10b981", "#ef4444", "#3b82f6", "#f59e0b", "#06b6d4"];
var SETTINGS = {
  dataFolder: "dataFolder",
  outputFolder: "outputFolder",
  refreshOnStartup: "refreshOnStartup"
};
async function resolveFolders(ctx) {
  const psi = ctx.workspace.notesFolder();
  const dataFolder = await ctx.settings.get(SETTINGS.dataFolder, "") || (psi ? ctx.workspace.joinPath(psi, "Dashboards", "data") : null);
  const outputFolder = await ctx.settings.get(SETTINGS.outputFolder, "") || (psi ? ctx.workspace.joinPath(psi, "Dashboards") : null);
  return { dataFolder, outputFolder };
}

// plugins/dashboard/src/ingest.ts
var DATA_EXTS = [".json", ".csv"];
function isDataFile(name) {
  const lower = name.toLowerCase();
  return DATA_EXTS.some((e) => lower.endsWith(e)) && !name.startsWith(".");
}
function datasetName(fileName) {
  return fileName.replace(/\.[^.]+$/, "");
}
function parseDataset(name, raw, fileName, sourcePath, sourceMtime) {
  const rows = fileName.toLowerCase().endsWith(".csv") ? parseCsv(raw) : parseJson(raw);
  rows.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const metricKeys = [];
  for (const r of rows) {
    for (const [k, v] of Object.entries(r.values)) {
      if (v !== null && !metricKeys.includes(k)) metricKeys.push(k);
    }
  }
  if (rows.length === 0) throw new Error(`${fileName}: no rows`);
  if (metricKeys.length === 0) throw new Error(`${fileName}: no numeric columns besides date`);
  return { name, rows, metricKeys, sourcePath, sourceMtime };
}
var DATE_RE = /^\d{4}-\d{2}-\d{2}/;
function toCell(v) {
  if (v === null || v === void 0 || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}
function parseJson(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error(`invalid JSON: ${e instanceof Error ? e.message : e}`);
  }
  if (!Array.isArray(data)) throw new Error("JSON must be an array of {date, ...} objects");
  const out = [];
  for (const item of data) {
    if (typeof item !== "object" || item === null) continue;
    const rec = item;
    const date = String(rec.date ?? "");
    if (!DATE_RE.test(date)) continue;
    const values = {};
    for (const [k, v] of Object.entries(rec)) {
      if (k === "date") continue;
      if (typeof v === "object" && v !== null) continue;
      values[k] = toCell(v);
    }
    out.push({ date: date.slice(0, 10), values });
  }
  return out;
}
function parseCsv(raw) {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) throw new Error("CSV needs a header row and at least one data row");
  const header = lines[0].split(",").map((h) => h.trim());
  if (header[0].toLowerCase() !== "date") throw new Error("CSV first column must be `date`");
  const out = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    const date = (cells[0] ?? "").trim();
    if (!DATE_RE.test(date)) continue;
    const values = {};
    for (let i = 1; i < header.length; i++) {
      values[header[i]] = toCell(cells[i]);
    }
    out.push({ date: date.slice(0, 10), values });
  }
  return out;
}

// plugins/dashboard/src/bake.ts
var DAY_MS = 864e5;
var iso = (t) => new Date(t).toISOString().slice(0, 10);
var parse = (d) => Date.parse(`${d}T00:00:00Z`);
function weekStart(d) {
  const t = parse(d);
  const dow = (new Date(t).getUTCDay() + 6) % 7;
  return iso(t - dow * DAY_MS);
}
function agg(values, how) {
  if (values.length === 0) return null;
  switch (how) {
    case "mean":
      return values.reduce((a, b) => a + b, 0) / values.length;
    case "sum":
      return values.reduce((a, b) => a + b, 0);
    case "last":
      return values[values.length - 1];
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
  }
}
function windowValues(ds, key, from, to) {
  const out = [];
  for (const r of ds.rows) {
    if (r.date >= from && r.date <= to) {
      const v = r.values[key];
      if (v !== null && v !== void 0) out.push(v);
    }
  }
  return out;
}
function fmtValue(v, fmt) {
  if (v === null) return "\u2014";
  switch (fmt) {
    case "duration_h": {
      const m = Math.round(v * 60);
      return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
    }
    case "int":
      return Math.round(v).toLocaleString("en-US");
    case "pct":
      return `${v.toFixed(1)}%`;
    default:
      return Number.isInteger(v) ? v.toLocaleString("en-US") : v.toFixed(1);
  }
}
function fmtDelta(cur, prev, fmt, unit) {
  if (cur === null || prev === null) return "\u2014";
  const d = cur - prev;
  const arrow = d > 1e-9 ? "\u2191" : d < -1e-9 ? "\u2193" : "\u2192";
  const sign = d > 0 ? "+" : d < 0 ? "\u2212" : "";
  let mag;
  switch (fmt) {
    case "duration_h":
      mag = `${Math.abs(Math.round(d * 60))}m`;
      break;
    case "int":
      mag = Math.abs(Math.round(d)).toLocaleString("en-US");
      break;
    case "pct":
      mag = `${Math.abs(d).toFixed(1)}%`;
      break;
    default:
      mag = Math.abs(d) >= 100 ? Math.abs(Math.round(d)).toLocaleString("en-US") : Math.abs(d).toFixed(1);
  }
  const u = fmt === "pct" || fmt === "duration_h" ? "" : unit ? ` ${unit}` : "";
  return `${arrow} ${sign}${mag}${u}`;
}
function tuples(pairs) {
  return `[${pairs.map(([x, y]) => `(${x}, ${Math.round(y * 100) / 100})`).join(", ")}]`;
}
function autoFmt(ds, key) {
  let sawAny = false;
  for (const r of ds.rows) {
    const v = r.values[key];
    if (v === null || v === void 0) continue;
    sawAny = true;
    if (!Number.isInteger(v)) return "raw";
  }
  return sawAny ? "int" : "raw";
}
function effectiveMetrics(config, ds) {
  const base = config.metrics.length > 0 ? config.metrics : ds.metricKeys.map((key) => ({ key, label: key, agg: "mean", chart: "line" }));
  return base.map((m, i) => ({
    fmt: autoFmt(ds, m.key),
    color: METRIC_COLORS[i % METRIC_COLORS.length],
    ...m
  }));
}
function bakeDashboard(config, ds, now) {
  const metrics = effectiveMetrics(config, ds);
  const newest = ds.rows[ds.rows.length - 1].date;
  const oldest = ds.rows[0].date;
  const spanDays = Math.round((parse(newest) - parse(oldest)) / DAY_MS) + 1;
  const observedDays = ds.rows.filter((r) => Object.values(r.values).some((v) => v !== null)).length;
  const N = config.kpiWindowDays;
  const kpiTo = newest;
  const kpiFrom = iso(parse(newest) - (N - 1) * DAY_MS);
  const prevTo = iso(parse(kpiFrom) - DAY_MS);
  const prevFrom = iso(parse(prevTo) - (N - 1) * DAY_MS);
  const kpiObserved = ds.rows.filter(
    (r) => r.date >= kpiFrom && r.date <= kpiTo && Object.values(r.values).some((v) => v !== null)
  ).length;
  const byWeek = /* @__PURE__ */ new Map();
  for (const r of ds.rows) {
    const w = weekStart(r.date);
    if (!byWeek.has(w)) byWeek.set(w, []);
    byWeek.get(w).push(r);
  }
  const weeks = [...byWeek.keys()].sort().slice(-config.trendWeeks);
  const weekly = (m) => {
    const out = [];
    for (const w of weeks) {
      const vals = byWeek.get(w).map((r) => r.values[m.key]).filter((v) => v !== null && v !== void 0);
      const a = agg(vals, m.agg);
      if (a !== null) out.push([w, a]);
    }
    return out;
  };
  const L = [];
  L.push("---");
  L.push(`generator: ${GENERATOR_MARKER}`);
  L.push(`dataset: ${ds.name}`);
  L.push(`generated_at: ${now.toISOString()}`);
  L.push("---");
  L.push("");
  L.push(`# ${config.title}`);
  L.push("");
  const pipeline = config.pipelineNote ? ` \xB7 pipeline: ${config.pipelineNote}` : "";
  L.push(
    `> [!info] **Data through ${newest}** \xB7 last ${N} days: **${kpiObserved}/${N}** observed \xB7 overall ${observedDays}/${spanDays} days${pipeline}`
  );
  L.push("");
  L.push("## Overview");
  L.push("");
  L.push(`\`\`\`\`layout grid cols=${Math.min(4, Math.max(1, metrics.length))}`);
  for (const m of metrics) {
    const cur = agg(windowValues(ds, m.key, kpiFrom, kpiTo), m.agg);
    const prev = agg(windowValues(ds, m.key, prevFrom, prevTo), m.agg);
    L.push(`:::card accent=${accentFor(m)} title="${m.label}"`);
    L.push(`## ${fmtValue(cur, m.fmt)}${m.fmt === "pct" || m.fmt === "duration_h" ? "" : m.unit ? ` ${m.unit}` : ""}`);
    L.push(`${aggLabel(m.agg)} \xB7 last ${N} days`);
    L.push(`${fmtDelta(cur, prev, m.fmt, m.unit)} vs prior ${N}`);
    L.push(":::");
  }
  L.push("````");
  L.push("");
  const charted = metrics.filter((m) => m.chart !== "none");
  if (charted.length > 0 && weeks.length >= 2) {
    L.push(`## Trends \xB7 ${weeks.length} weeks`);
    L.push("");
    L.push("````layout grid cols=2");
    for (const m of charted) {
      const series = weekly(m);
      if (series.length < 2) continue;
      L.push(`:::card accent=${accentFor(m)} title="${m.label} \xB7 weekly ${m.agg}"`);
      L.push(`\`\`\`chart ${m.chart}`);
      L.push(`data = ${tuples(series)}`);
      if (m.unit) L.push(`ylabel = ${m.unit}`);
      const lim = m.ylim ?? (m.chart === "line" ? autoYlim(series) : void 0);
      if (lim) L.push(`ylim = [${lim[0]}, ${lim[1]}]`);
      L.push(`color = ${m.color}`);
      L.push("```");
      L.push(":::");
    }
    L.push("````");
    L.push("");
  }
  const heatKey = config.heatmapMetric;
  const heatMetric = heatKey ? metrics.find((m) => m.key === heatKey) : void 0;
  if (heatMetric && weeks.length >= 2) {
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const rows = [];
    for (let wd = 0; wd < 7; wd++) {
      const cells = [];
      for (const w of weeks) {
        const date = iso(parse(w) + wd * DAY_MS);
        const rec = byWeek.get(w).find((r) => r.date === date);
        const v = rec ? rec.values[heatMetric.key] : null;
        cells.push(v ?? 0);
      }
      rows.push(`(${dayNames[wd]}, ${cells.map((c) => Math.round(c)).join(", ")})`);
    }
    L.push(`## ${heatMetric.label} \xB7 weekday rhythm`);
    L.push("");
    L.push("```chart heatmap");
    L.push(`data = [${rows.join(", ")}]`);
    L.push(`xlabel = week (${weeks[0]} \u2192 ${weeks[weeks.length - 1]})`);
    L.push("```");
    L.push("");
  }
  const detail = ds.rows.slice(-config.detailDays);
  L.push(`## Last ${detail.length} days`);
  L.push("");
  L.push(`| date | ${metrics.map((m) => m.label).join(" | ")} |`);
  L.push(`|---|${metrics.map(() => "---").join("|")}|`);
  for (const r of detail) {
    L.push(`| ${r.date} | ${metrics.map((m) => fmtValue(r.values[m.key] ?? null, m.fmt)).join(" | ")} |`);
  }
  L.push("");
  L.push("> [!note] Missing days are shown as-is \u2014 no interpolation, no back-filling. Aggregates use observed days only.");
  L.push("");
  L.push("---");
  L.push("");
  L.push(
    `*Generated by the Dashboard plugin from \`${ds.name}\` \xB7 self-contained AINP document \u2014 renders anywhere, no live data source required.*`
  );
  L.push("");
  return L.join("\n");
}
function accentFor(m) {
  const c = (m.color ?? "").toLowerCase();
  if (c.startsWith("#8b5cf6") || c.includes("purple")) return "purple";
  if (c.startsWith("#10b981") || c.includes("green")) return "green";
  if (c.startsWith("#ef4444") || c.includes("red")) return "red";
  if (c.startsWith("#3b82f6") || c.includes("blue")) return "blue";
  if (c.startsWith("#f59e0b") || c.includes("yellow") || c.includes("orange")) return "yellow";
  return "gray";
}
function aggLabel(a) {
  return { mean: "daily mean", sum: "total", last: "latest", min: "minimum", max: "maximum" }[a];
}
function autoYlim(series) {
  const ys = series.map(([, y]) => y);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  if (min === max) return void 0;
  const pad = (max - min) * 0.25;
  const lo = niceFloor(min - pad);
  const hi = niceCeil(max + pad);
  return [Math.max(0, lo), hi];
}
var NICE_STEPS = [1, 2, 2.5, 5, 10];
function niceFloor(v) {
  if (v <= 0) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.floor(v / mag) * mag;
}
function niceCeil(v) {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  for (const s of NICE_STEPS) {
    if (v <= s * mag) return s * mag;
  }
  return 10 * mag;
}

// plugins/dashboard/src/engine.ts
function todayIso() {
  const d = /* @__PURE__ */ new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
}
function createEngine(ctx) {
  let state = {
    dataFolder: null,
    outputFolder: null,
    datasets: [],
    scanning: false,
    lastScan: null
  };
  const listeners = /* @__PURE__ */ new Set();
  const emit = () => listeners.forEach((cb) => cb());
  const set = (patch) => {
    state = { ...state, ...patch };
    emit();
  };
  async function scan() {
    set({ scanning: true });
    try {
      const { dataFolder, outputFolder } = await resolveFolders(ctx);
      if (!dataFolder) {
        set({ dataFolder, outputFolder, datasets: [], scanning: false, lastScan: Date.now() });
        return;
      }
      if (!await ctx.workspace.exists(dataFolder)) {
        await ctx.workspace.createFile(ctx.workspace.joinPath(dataFolder, ".keep"), "");
      }
      const entries = (await ctx.workspace.listFolder(dataFolder)).filter(
        (e) => !e.isDir && isDataFile(e.name)
      );
      const byName = /* @__PURE__ */ new Map();
      for (const e of entries) {
        const name = datasetName(e.name);
        const prev = byName.get(name);
        if (!prev || e.created > prev.created) byName.set(name, e);
      }
      const infos = [];
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
            dataset: ds
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
            dataset: null
          });
        }
      }
      infos.sort((a, b) => a.name.localeCompare(b.name));
      set({ dataFolder, outputFolder, datasets: infos, scanning: false, lastScan: Date.now() });
    } catch (e) {
      console.error("[dashboard] scan failed", e);
      set({ scanning: false, lastScan: Date.now() });
    }
  }
  async function configFor(name) {
    const stored = await ctx.settings.get(`config:${name}`, null);
    return {
      dataset: name,
      title: stored?.title ?? name,
      ...DEFAULT_CONFIG,
      ...stored ?? {}
    };
  }
  async function refreshOne(name) {
    const info = state.datasets.find((d) => d.name === name);
    if (!info || !info.dataset) throw new Error(`dataset '${name}' not loaded${info?.error ? `: ${info.error}` : ""}`);
    if (!info.outputPath) throw new Error("output folder not configured (set the Psi folder or a dashboard output folder)");
    const config = await configFor(name);
    const md = bakeDashboard(config, info.dataset, /* @__PURE__ */ new Date());
    if (await ctx.workspace.exists(info.outputPath)) {
      const head = (await ctx.workspace.readFile(info.outputPath).catch(() => "")).slice(0, 400);
      if (!head.includes(`generator: ${GENERATOR_MARKER.split("/")[0]}`)) {
        throw new Error(
          `${info.outputPath} exists but was not generated by Dashboard \u2014 refusing to overwrite. Rename or move it.`
        );
      }
      await ctx.workspace.writeFile(info.outputPath, md);
    } else {
      await ctx.workspace.createFile(info.outputPath, md);
    }
    return info.outputPath;
  }
  async function refreshAll() {
    await scan();
    const written = [];
    for (const d of state.datasets) {
      if (!d.dataset) continue;
      try {
        written.push(await refreshOne(d.name));
      } catch (e) {
        console.error(`[dashboard] refresh '${d.name}' failed`, e);
        void ctx.notifications.notify({
          title: "Dashboard refresh failed",
          body: `${d.name}: ${e instanceof Error ? e.message : e}`
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
    refreshAll
  };
}

// plugins/dashboard/src/sectionView.ts
function mountDashboardSection(container, host, engine, actions) {
  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;gap:6px;padding:6px 10px;font-size:12px;";
  container.appendChild(root);
  const btn = (label, title) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.title = title;
    b.style.cssText = "border:1px solid var(--border-color);background:transparent;color:inherit;border-radius:5px;padding:1px 7px;font-size:11px;cursor:pointer;line-height:1.6;";
    return b;
  };
  function paint() {
    const s = engine.getState();
    root.textContent = "";
    if (!s.dataFolder) {
      const p = document.createElement("div");
      p.style.cssText = "opacity:.75;line-height:1.5;";
      p.textContent = "Set your Psi folder (or a data folder in Settings) to use dashboards.";
      root.appendChild(p);
      return;
    }
    if (s.datasets.length === 0) {
      const p = document.createElement("div");
      p.style.cssText = "opacity:.75;line-height:1.5;";
      p.textContent = s.scanning ? "Scanning\u2026" : "Drop a JSON or CSV time-series file into the data folder, then Refresh.";
      root.appendChild(p);
      const b = btn("Open data folder", s.dataFolder);
      b.addEventListener("click", () => actions.openDataFolder());
      root.appendChild(b);
      return;
    }
    for (const d of s.datasets) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:6px;padding:4px 6px;border:1px solid var(--border-color);border-radius:6px;";
      const dot = document.createElement("span");
      const stale = d.error ? "err" : d.staleDays !== null && d.staleDays > 3 ? "stale" : "ok";
      dot.style.cssText = `width:7px;height:7px;border-radius:50%;flex:none;background:${stale === "err" ? "#ef4444" : stale === "stale" ? "#f59e0b" : "#10b981"};`;
      dot.title = d.error ? d.error : d.dataThrough ? `data through ${d.dataThrough}` : "";
      row.appendChild(dot);
      const meta = document.createElement("div");
      meta.style.cssText = "flex:1;min-width:0;display:flex;flex-direction:column;";
      const nm = document.createElement("span");
      nm.textContent = d.name;
      nm.style.cssText = "font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
      const sub = document.createElement("span");
      sub.style.cssText = "opacity:.65;font-size:10.5px;";
      sub.textContent = d.error ? "parse error \u2014 hover the dot" : `${d.rows} days \xB7 through ${d.dataThrough ?? "?"}`;
      meta.appendChild(nm);
      meta.appendChild(sub);
      row.appendChild(meta);
      if (!d.error) {
        const r = btn("Refresh", `Regenerate ${d.name}.md`);
        r.addEventListener("click", () => actions.refresh(d.name));
        row.appendChild(r);
        const o = btn("Open", d.outputPath ?? "");
        o.addEventListener("click", () => actions.open(d));
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

// plugins/dashboard/src/settingsView.ts
function mountDashboardSettings(container, _host, ctx, onChanged) {
  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;gap:14px;font-size:13px;max-width:560px;";
  container.appendChild(root);
  const folderRow = (label, key, hint) => {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;gap:4px;";
    const lab = document.createElement("div");
    lab.textContent = label;
    lab.style.cssText = "font-weight:600;";
    const val = document.createElement("div");
    val.style.cssText = "font-family:ui-monospace,monospace;font-size:11.5px;opacity:.8;overflow-wrap:anywhere;";
    const btns = document.createElement("div");
    btns.style.cssText = "display:flex;gap:8px;";
    const choose = document.createElement("button");
    choose.textContent = "Choose\u2026";
    const reset = document.createElement("button");
    reset.textContent = "Reset to default";
    for (const b of [choose, reset]) {
      b.style.cssText = "border:1px solid var(--border-color);background:transparent;color:inherit;border-radius:6px;padding:3px 10px;cursor:pointer;font-size:12px;";
    }
    const note = document.createElement("div");
    note.textContent = hint;
    note.style.cssText = "opacity:.6;font-size:11.5px;";
    const repaint = async () => {
      const folders = await resolveFolders(ctx);
      const stored = await ctx.settings.get(key, "");
      const effective = key === SETTINGS.dataFolder ? folders.dataFolder : folders.outputFolder;
      val.textContent = (effective ?? "not configured") + (stored ? "" : "  (default)");
    };
    choose.addEventListener("click", async () => {
      const picked = await ctx.workspace.pickFolder(label);
      if (picked) {
        await ctx.settings.set(key, picked);
        await repaint();
        onChanged();
      }
    });
    reset.addEventListener("click", async () => {
      await ctx.settings.set(key, "");
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
    folderRow("Data folder", SETTINGS.dataFolder, "Where dropped JSON/CSV time-series files are scanned from.")
  );
  root.appendChild(
    folderRow("Output folder", SETTINGS.outputFolder, "Where generated dashboard .md documents are written.")
  );
  const toggleWrap = document.createElement("label");
  toggleWrap.style.cssText = "display:flex;align-items:center;gap:8px;cursor:pointer;";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  void ctx.settings.get(SETTINGS.refreshOnStartup, true).then((v) => {
    cb.checked = v;
  });
  cb.addEventListener("change", () => void ctx.settings.set(SETTINGS.refreshOnStartup, cb.checked));
  const txt = document.createElement("span");
  txt.textContent = "Refresh all dashboards on startup";
  toggleWrap.appendChild(cb);
  toggleWrap.appendChild(txt);
  root.appendChild(toggleWrap);
  return () => root.remove();
}

// plugins/dashboard/src/index.ts
var DASH_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`;
var dashboardPlugin = {
  id: "rho.dashboard",
  description: "Feed JSON/CSV time-series files, get self-contained dashboard documents back.",
  name: "Dashboard",
  icon: DASH_ICON,
  activate(ctx) {
    const engine = createEngine(ctx);
    const openOutput = async (path) => {
      await ctx.workspace.openFile(path);
    };
    ctx.subscriptions.push(
      ctx.commands.register({
        id: "rho.dashboard.refreshAll",
        title: "Dashboard: Refresh All",
        access: "write-file",
        stl: '[data_folder] -> [dashboards] ::mod(action="regenerated", source="rho.dashboard")',
        async run() {
          const written = await engine.refreshAll();
          return { written };
        }
      }),
      ctx.commands.register({
        id: "rho.dashboard.refresh",
        title: "Dashboard: Refresh Dataset",
        access: "write-file",
        params: "{dataset}",
        async run(arg) {
          const name = typeof arg === "string" ? arg : arg?.dataset;
          if (!name) throw new Error("dataset name required");
          await engine.scan();
          const path = await engine.refreshOne(name);
          await openOutput(path);
          return { path };
        }
      }),
      ctx.commands.register({
        id: "rho.dashboard.openDataFolder",
        title: "Dashboard: Open Data Folder",
        async run() {
          const s = engine.getState();
          if (s.dataFolder) await ctx.workspace.openFile(s.dataFolder).catch(() => void 0);
          return { dataFolder: s.dataFolder };
        }
      })
    );
    ctx.subscriptions.push(
      ctx.views.registerView({
        id: "rho.dashboard.view",
        title: "Dashboards",
        icon: DASH_ICON,
        order: 70
      })
    );
    ctx.subscriptions.push(
      ctx.sidebar.registerSection({
        id: "rho.dashboard.section",
        title: "Dashboards",
        icon: DASH_ICON,
        view: "rho.dashboard.view",
        order: 10,
        mount(container, host) {
          return mountDashboardSection(container, host, engine, {
            refresh(name) {
              void engine.refreshOne(name).then((p) => openOutput(p)).catch(
                (e) => ctx.notifications.notify({
                  title: "Dashboard refresh failed",
                  body: e instanceof Error ? e.message : String(e)
                })
              );
            },
            open(info) {
              if (info.outputPath) void openOutput(info.outputPath);
            },
            openDataFolder() {
              void ctx.commands.execute("rho.dashboard.openDataFolder");
            }
          });
        }
      })
    );
    ctx.subscriptions.push(
      ctx.settings.registerPanel({
        id: "rho.dashboard.settings",
        title: "Dashboard",
        icon: DASH_ICON,
        mount(container, host) {
          return mountDashboardSettings(container, host, ctx, () => void engine.scan());
        }
      })
    );
    void ctx.settings.get(SETTINGS.refreshOnStartup, true).then((on) => {
      if (on) {
        setTimeout(() => {
          void engine.refreshAll().catch((e) => console.error("[dashboard] startup refresh", e));
        }, 2500);
      }
    });
  }
};
var index_default = dashboardPlugin;
