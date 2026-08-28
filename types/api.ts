// Rho MD Plugin API — public type contract (mirror).
// Canonical source ships inside the app; this copy is published so plugin
// authors (and their AI assistants) get full type checking. Versioned with
// the app — see minAppVersion in your manifest.

// Rho MD — Public Plugin API contract.
//
// This module is the *stable surface* third-party plugin authors code against.
// It is deliberately framework-agnostic: sections render into a plain DOM
// `HTMLElement`, never a React node. This matches the existing in-tree renderer
// idiom (`renderXBlocks(container)`) and keeps the contract sandbox-ready — when
// v2 moves plugins behind an iframe/worker, this same shape still holds.
//
// Plugins talk to the host ONLY through `PluginContext`. They must never import
// the app's store, components, or Tauri commands directly. The host implements
// the capabilities; the plugin consumes them. That boundary is what makes the
// API safe to expose to third-party authors.

/** A handle that undoes a registration or subscription. */
export interface Disposable {
  dispose(): void;
}

/**
 * Resolved visual theme values currently in effect, so a plugin's UI can match
 * the host's light/dark look. `cssVar` gives raw forward-compatible access to
 * any `--*` custom property for tokens not surfaced explicitly here.
 */
export interface ThemeTokens {
  mode: 'light' | 'dark';
  textColor: string;
  bgColor: string;
  sidebarBg: string;
  borderColor: string;
  linkColor: string;
  hoverBg: string;
  /** Document reading zoom (the font-size overlay / Ctrl+=). Use only for
   *  content that should scale with the document; chrome must NOT use this. */
  fontSize: number;
  /** Constant chrome/UI font size — does NOT follow the document zoom. Size
   *  plugin panels and sidebars with this so font-zoom leaves chrome fixed. */
  uiFontSize: number;
  /** Read any resolved CSS custom property by name, e.g. cssVar('--accent'). */
  cssVar(name: string): string;
}

/**
 * A button in the Side Bar Tool Bar — the action row at the top of the Primary
 * Side Bar. Each Activity view owns its own set, so the buttons swap when the
 * active view changes (Explorer's differ from Psi's). Same click-runs-a-command
 * shape as a StatusItem; same inline-SVG icon convention as an ActivityView.
 */
export interface ViewAction {
  /** Stable unique id within the view, e.g. 'reindex'. */
  id: string;
  /** Tooltip. */
  title: string;
  /** Inline SVG markup for the button icon (framework-agnostic). */
  icon: string;
  /** Command id to run on click (registered via `commands.register`). */
  command: string;
  /** Left-to-right position within the tool bar; lower sorts first. */
  order?: number;
}

/**
 * An Activity Bar view — an icon in the far-left column that, when selected,
 * shows its own stack of Side Bar sections (the horizontal axis of the two-axis
 * model). Core ships 'explorer' and 'search'; plugins add their own so the
 * ecosystem's long tail doesn't crowd a single column.
 */
export interface ActivityView {
  /** Stable unique id, e.g. 'rho.git.view'. Sections target it via `view`. */
  id: string;
  /** Tooltip/label. */
  title: string;
  /** Short status tag rendered as a small pill beside the title in the Side
   *  Bar header (e.g. 'Beta'). Omit for none. */
  badge?: string;
  /** Inline SVG markup for the Activity Bar icon (framework-agnostic). */
  icon?: string;
  /** Stack position in the Activity Bar; lower is higher. */
  order?: number;
  /**
   * Tool-bar buttons shown at the top of the Side Bar while this view is active
   * (the Side Bar Tool Bar). Empty/omitted → the tool-bar row is hidden for the
   * view. The host renders the same row for its own core views (dogfood).
   */
  actions?: ViewAction[];
}

/** Per-section handle passed to `SideBarSection.mount`. */
export interface SectionHost {
  /** Theme tokens at mount time. */
  readonly theme: ThemeTokens;
  /** Fire `cb` whenever the host theme changes; re-read tokens and repaint. */
  onThemeChange(cb: (theme: ThemeTokens) => void): Disposable;
}

/**
 * A collapsible section contributed to the Primary Side Bar stack (the VS Code
 * Explorer-style column: Outline / Calendar / File Tree …). The host owns the
 * collapsible chrome (header, chevron, ordering); the plugin owns only what it
 * renders inside `container`.
 */
export interface SideBarSection {
  /** Stable unique id, namespaced by plugin, e.g. 'rho.calendar.month'. */
  id: string;
  /** Title shown in the section header. */
  title: string;
  /** Optional inline SVG markup for a small leading icon. */
  icon?: string;
  /** Stack position; lower sorts higher. Core Outline = 0; plugins default 100. */
  order?: number;
  /**
   * Which Activity Bar view this section belongs to (the horizontal axis).
   * Defaults to 'explorer'. A plugin that registers its own view (see
   * `views.registerView`) sets this to that view's id to stack sections under it.
   */
  view?: string;
  /** Initial collapsed state (the user can toggle it afterward). */
  defaultCollapsed?: boolean;
  /**
   * Render the section body into `container` when it mounts. Return an optional
   * cleanup function, invoked when the section unmounts (e.g. plugin disabled).
   */
  mount(container: HTMLElement, host: SectionHost): void | (() => void);
}

/**
 * What a command touches when it runs. Annotation only for now — no gating —
 * but recorded from day one so a future AI driver can be scoped by reading
 * attributes instead of re-auditing every command.
 */
export type CommandAccess = 'read' | 'write-meta' | 'write-index' | 'write-file';

/**
 * A command contributed to the host. Commands are discoverable and runnable
 * from the Command Palette (Ctrl/Cmd+Shift+P) and may be invoked
 * programmatically via `PluginContext.commands.execute`.
 */
export interface Command {
  /** Stable unique id, namespaced, e.g. 'rho.calendar.openToday'. */
  id: string;
  /** Human-facing label, conventionally 'Category: Action'. */
  title: string;
  /** Execute the command. May take args when invoked via `execute`. */
  run(...args: unknown[]): unknown | Promise<unknown>;
  /** Read/write annotation (defaults to 'read' when omitted). */
  access?: CommandAccess;
  /**
   * Declarative STL template for the command's effect, e.g.
   * '[doc:<path>] -> [tag:<tag>] ::mod(action="tagged", source="user")'.
   * Structured I/O today for the UI driver, same shape for an AI driver later.
   */
  stl?: string;
  /** One-line JSON argument shape hint for programmatic drivers, e.g. '{doc, tag}'. */
  params?: string;
}

/**
 * A context-menu item contributed to a surface. Items are thin references into
 * the command registry — the menu owns no behavior of its own, so everything a
 * menu can do is equally reachable from the Command Palette and agent IPC.
 */
export interface MenuItem {
  /** Stable unique id within the surface, e.g. 'close-others'. */
  id: string;
  /** Menu label. */
  title: string;
  /** Optional leading icon — an inline SVG string (see utils/menuIcons). */
  icon?: string;
  /** Command id to execute on click. Omit on a submenu parent (it only opens
   *  its `submenu` and runs nothing itself). */
  command?: string;
  /** Build the command argument from the surface context (omitted → no args). */
  args?: (ctx: unknown) => unknown;
  /** Show the item only when this predicate passes (omitted → always). */
  when?: (ctx: unknown) => boolean;
  /** Child items, computed from the surface context (e.g. a dynamic folder
   *  list). Present → this item is a submenu parent: hovering it opens a child
   *  menu of these items; clicking a child runs that child's command. */
  submenu?: (ctx: unknown) => MenuItem[];
  /** Sort order within the surface (default 100). */
  order?: number;
  /** Draw a separator line above this item. */
  separatorBefore?: boolean;
  /** Destructive action — render the label (and icon) in red. */
  danger?: boolean;
}

/**
 * Context-menu surfaces. Core surfaces are listed here; plugins may register
 * onto them (or their own) via `PluginContext.menus`.
 *  - 'tab'            ctx: { tabId: string; path: string; kind: string }
 *  - 'doc-read'       ctx: { path: string; selection: string; linkHref?: string }
 *  - 'doc-edit'       ctx: same as doc-read
 *  - 'filetree-file'  ctx: { path: string }
 *  - 'filetree-folder' ctx: { path: string }
 *  - 'psi-doc'        ctx: { path: string }
 */
export type MenuSurfaceId = string;

/**
 * A keyboard shortcut bound to a command. Chords use 'Mod' for Ctrl (Cmd on
 * macOS): 'Mod+S', 'Mod+Shift+P', 'Mod+1'. Single registry, one global
 * dispatcher — bindings are command references, like menu items.
 */
export interface Keybinding {
  /** Normalized chord, e.g. 'Mod+Shift+P' (Mod = Ctrl / Cmd). */
  key: string;
  /** Command id to execute. */
  command: string;
  /** Argument passed to the command (static, unlike menu args). */
  args?: unknown;
}

/** A command as reported by introspection — metadata only, no `run`. */
export interface CommandInfo {
  id: string;
  title: string;
  access: CommandAccess;
  stl?: string;
  params?: string;
}

/**
 * A Status Bar item contributed by a plugin (the bottom strip). Rendered
 * right-aligned; clicking runs `command` if set. Re-register with the same id to
 * update the text.
 */
export interface StatusItem {
  /** Stable unique id, namespaced. */
  id: string;
  /** Short text shown in the strip. */
  text: string;
  /** Tooltip. */
  title?: string;
  /** Position; lower sorts further left within the right-aligned group. */
  order?: number;
  /** Command id to run on click (registered via `commands.register`). */
  command?: string;
}

/**
 * Authorized file-system / editor capability. Available because the user chose
 * to install the plugin (user-triggered trust, see threat model N11-B). Paths
 * are absolute; `joinPath` builds them portably.
 */
/** One child of a folder, as returned by `WorkspaceApi.listFolder`/`listMarkdownTree`. */
export interface WorkspaceEntry {
  /** File or folder name (no path). */
  name: string;
  /** Absolute path. */
  path: string;
  isDir: boolean;
  /** File size in bytes (0 for folders). */
  size: number;
  /** Creation time in ms since epoch (mtime fallback on filesystems without
   *  birthtime; 0 when unresolvable). */
  created: number;
}

export interface WorkspaceApi {
  /** Open a markdown file in a new or existing editor tab. */
  openFile(path: string): Promise<void>;
  /** True if `path` exists on disk. */
  exists(path: string): Promise<boolean>;
  /**
   * List the immediate children of a folder (one level, dotfiles skipped).
   * Read-only. Resolves to [] when the folder doesn't exist — absent and
   * empty are the same to a reader. E.g. the Calendar heatmap lists the
   * daily-notes folder once to tint a whole month of day cells by note size.
   */
  listFolder(path: string): Promise<WorkspaceEntry[]>;
  /**
   * Recursively list every markdown file under a root (dot-entries skipped,
   * folders themselves omitted). Same absent-folder-is-[] contract as
   * listFolder. One call yields a whole corpus with sizes and creation
   * times — e.g. the Calendar groups them by creation day for its
   * "documents started this day" heatmap.
   */
  listMarkdownTree(path: string): Promise<WorkspaceEntry[]>;
  /**
   * Read a text file. Rejects when the file doesn't exist or isn't readable
   * — callers that can degrade (a preview, a tooltip) should catch and carry
   * on without the content.
   */
  readFile(path: string): Promise<string>;
  /**
   * Create `path` with optional `content` if it does not exist (parent dirs are
   * created). No-op when the file already exists. Returns true if newly created.
   */
  createFile(path: string, content?: string): Promise<boolean>;
  /**
   * Write `content` to `path`, OVERWRITING an existing file (parent dirs are
   * created). The generator convention: a plugin that regenerates documents
   * must gate its own overwrites — verify the target carries its generator
   * marker (e.g. a `generator:` frontmatter key it wrote) before writing over
   * a file it did not just create. Never overwrite a user-authored file.
   */
  writeFile(path: string, content: string): Promise<void>;
  /** Native folder picker. Returns the chosen absolute path, or null if cancelled. */
  pickFolder(title?: string): Promise<string | null>;
  /** The user's notes home (the Psi folder), or null if not configured yet. */
  notesFolder(): string | null;
  /**
   * Open a generated local HTML file in an editor-area tab (asset protocol).
   * Re-activates the existing tab when the same path is already open.
   * E.g. Psi's 3D star map. The file must be inside the asset-protocol scope.
   */
  openHtmlTab(name: string, path: string): void;
  /** Absolute path of the active doc tab, or null (canvas/home/web tab). */
  activeDocument(): string | null;
  /** Fire `cb` whenever the active document changes (path or null). */
  onDidChangeActiveDocument(cb: (path: string | null) => void): Disposable;
  /** Join path segments with a forward slash (portable for host fs ops). */
  joinPath(...segments: string[]): string;
  /**
   * Tell the workspace a file or folder moved on disk (rename / move). Every
   * open editor tab showing `from` — or, for a folder, any path beneath it —
   * is re-pointed in place to the new location, so no stale tab keeps the old
   * path (saving such a tab would resurrect the old file). If the destination
   * is already open in another tab, the stale duplicate closes (kept, with a
   * console warning, only when it holds unsaved edits — edits are never
   * discarded). Invariant served: one disk file ↔ at most one editor tab.
   * Call it after your rename/move actually succeeded on disk.
   */
  pathMoved(from: string, to: string): void;
}

/** Namespaced, persisted, per-plugin key/value settings. */
export interface SettingsApi {
  get<T>(key: string, fallback: T): Promise<T>;
  set<T>(key: string, value: T): Promise<void>;
}

/**
 * A settings page contributed to the global Settings modal. Each contributing
 * plugin gets its OWN page in the left-nav "Plugins" group (icon + title), the
 * Obsidian core-plugins idiom. Same plain-DOM `mount` contract as a
 * SideBarSection — the host renders a content pane and the plugin fills it,
 * so a plugin can reuse one settings view in either surface. Registered via
 * `ctx.settings.registerPanel`.
 */
export interface SettingsPanel {
  /** Stable id, namespaced, e.g. 'rho.ai.settings'. */
  id: string;
  /** Nav label, e.g. 'RHO AI'. */
  title: string;
  /** Inline SVG markup for the nav icon (same convention as ActivityView). */
  icon?: string;
  /** Sort order within the Plugins group; lower sorts higher. */
  order?: number;
  /** Render the page body into `container` when shown; return optional cleanup
   *  (invoked when the user navigates away or the plugin deactivates). */
  mount(container: HTMLElement, host: SectionHost): void | (() => void);
}

/** A single OS-native notification request. */
export interface NotificationOptions {
  /** Bold headline line. */
  title: string;
  /** Optional body text shown under the title. */
  body?: string;
}

/**
 * Reach-OUT capability: surface an OS-native notification even when Rho MD is
 * unfocused or the plugin's view is hidden. Available because the user chose to
 * install the plugin (user-triggered trust, N11-B). Unlike rendering or sidebar
 * contributions (which are space — the plugin putting UI *into* the chrome),
 * this is the host letting a plugin reach *out* to the user at a moment of its
 * choosing — the first capability on that axis.
 *
 * The host transparently handles the OS permission prompt on first use; `notify`
 * never throws on a denied permission — it resolves `false`. This keeps a
 * background plugin (e.g. a focus timer firing at a phase boundary) from having
 * to manage permission state itself.
 */
export interface NotificationApi {
  /** Show an OS notification. Resolves true if shown, false if permission was denied. */
  notify(options: NotificationOptions): Promise<boolean>;
}

/**
 * App-drawn modal dialogs. Plugins must use these instead of the native GTK
 * message boxes (`@tauri-apps/plugin-dialog` ask/message) — the native boxes
 * double-print the title, ignore the app theme, and look foreign in the app
 * (`window.confirm` is additionally a silent no-op inside the Tauri webview).
 * File/folder *pickers* are unaffected — those stay native by design.
 */
export interface DialogApi {
  /** Modal confirm; resolves true on confirm, false on cancel/dismiss. */
  confirm(opts: {
    title: string;
    message: string;
    /** Distinct monospace box under the message — the path/command acted on. */
    detail?: string;
    confirmLabel: string;
    /** Default 'Cancel'. */
    cancelLabel?: string;
    /** Red confirm button for destructive actions. */
    danger?: boolean;
  }): Promise<boolean>;
  /** Alert with a single OK button (error/info notices). */
  alert(title: string, message: string, detail?: string): Promise<void>;
}

/** A completion candidate a provider offers. Framework-agnostic — the host maps
 *  it onto the editor's native completion UI. */
export interface CompletionItem {
  /** Shown in the popup and matched against the typed query. */
  label: string;
  /** Optional secondary line (e.g. the document path). */
  detail?: string;
  /** Text inserted in place of the typed query (defaults to `label`). */
  insert?: string;
}

/** A source of completions for a literal trigger. EXPERIMENTAL — v1 wires into
 *  the CodeMirror source editor only; the contract may grow for the WYSIWYG view. */
export interface CompletionProvider {
  /** Literal trigger that opens the popup, e.g. '[[' for wikilinks. */
  trigger: string;
  /** Given the text typed after the trigger, return ranked candidates. */
  provide(query: string): CompletionItem[];
}

/** The host surface handed to a plugin at `activate`. THE plugin contract. */
export interface PluginContext {
  /** The activating plugin's id (settings/section namespacing derive from it). */
  readonly pluginId: string;
  readonly sidebar: {
    /** Contribute a collapsible section to the Primary Side Bar. */
    registerSection(section: SideBarSection): Disposable;
  };
  readonly views: {
    /** Contribute an Activity Bar view (its own Side Bar section stack). */
    registerView(view: ActivityView): Disposable;
    /** Switch the Activity Bar to `viewId` (opens the Side Bar if hidden). */
    show(viewId: string): void;
  };
  readonly commands: {
    register(command: Command): Disposable;
    execute(id: string, ...args: unknown[]): Promise<unknown>;
    /** Introspect the whole command surface — metadata only. */
    list(): readonly CommandInfo[];
  };
  /**
   * The Secondary Side Bar (right-hand auxiliary column). Sections here are
   * global — they follow the active document rather than an Activity view.
   */
  readonly secondary: {
    registerSection(section: SideBarSection): Disposable;
  };
  /**
   * The bottom Panel drawer (VS Code's name). Like the Secondary Side Bar,
   * sections here are global (not tied to an Activity view), but the Panel is
   * the WIDE surface — for corpus-scale overviews that want horizontal room
   * (vs. the narrow doc-following Secondary Side Bar). Multiple sections render
   * as tabs along the Panel's header.
   */
  readonly panel: {
    registerSection(section: SideBarSection): Disposable;
    /** Reveal the Panel (opens it if hidden); a sectionId focuses that tab. */
    show(sectionId?: string): void;
  };
  readonly menus: {
    /** Contribute items to a context-menu surface (core or plugin-own). */
    register(surface: MenuSurfaceId, items: MenuItem[]): Disposable;
    /** Open the context menu for a surface at a mouse event's position. */
    open(
      e: { clientX: number; clientY: number; preventDefault(): void; stopPropagation(): void },
      surface: MenuSurfaceId,
      ctx: unknown,
    ): void;
  };
  readonly statusBar: {
    /** Contribute (or update, by id) a Status Bar item. */
    registerItem(item: StatusItem): Disposable;
  };
  readonly keybindings: {
    /** Bind chords to commands ('Mod+K' style; one binding per chord, last wins). */
    register(bindings: Keybinding[]): Disposable;
  };
  /**
   * EXPERIMENTAL — editor completions. Register a provider for a trigger (e.g.
   * '[[' wikilinks); the host wires it into the source editor's native popup.
   * v1 = CodeMirror source mode only.
   */
  readonly editor: {
    registerCompletions(provider: CompletionProvider): Disposable;
  };
  readonly workspace: WorkspaceApi;
  readonly settings: SettingsApi & {
    /** Contribute a settings page to the global Settings modal (Plugins group).
     *  The plugin gets its own left-nav entry; `mount` fills the content pane. */
    registerPanel(panel: SettingsPanel): Disposable;
  };
  readonly notifications: NotificationApi;
  readonly dialogs: DialogApi;
  readonly theme: {
    tokens(): ThemeTokens;
    onChange(cb: (theme: ThemeTokens) => void): Disposable;
  };
  /**
   * Disposables pushed here are all disposed when the plugin deactivates. The
   * return value of every `register*`/`on*` call can be pushed here.
   */
  readonly subscriptions: Disposable[];
}

/** A plugin's entry contract. A third party exports a value of this shape. */
export interface RhoPlugin {
  /** Stable unique id, reverse-DNS style, e.g. 'rho.calendar'. */
  id: string;
  /** Display name. */
  name: string;
  /** Short status tag rendered as a small pill beside the name on the plugin's
   *  Settings page (e.g. 'Beta'). Omit for none. */
  badge?: string;
  /** One-line summary shown in the Settings "Manage" list. Write it for the
   *  person deciding whether to switch the plugin on. */
  description?: string;
  /** Plugin version. Built-ins omit it (they version with the app); loaded
   *  third-party plugins carry their manifest's version. */
  version?: string;
  /** Host-reserved provenance tag: where this plugin came from. Built-ins omit
   *  it (treated as 'builtin'); the third-party loader stamps 'local' /
   *  'community'. Shown as a pill in the Settings Manage list. */
  source?: 'builtin' | 'local' | 'community';
  /** Optional inline-SVG identity icon (same convention as ActivityView),
   *  shown beside the plugin in the Settings "Plugins" group. */
  icon?: string;
  /** Host-reserved: a core built-in that cannot be disabled. The manager
   *  ignores any persisted disabled-state and refuses setEnabled(false); its
   *  Settings page renders without the Enabled toggle. No built-in currently
   *  sets it (built-ins are user-toggleable by design). */
  alwaysOn?: boolean;
  /** First-run enabled state when the user has never toggled this plugin.
   *  Defaults to true; set false for plugins that should be opt-in (e.g.
   *  RHO AI — it needs a user-supplied API key to do anything, so shipping
   *  it on by default only adds chrome). A persisted user choice always wins. */
  defaultEnabled?: boolean;
  /** Called once when the plugin loads. Wire up contributions here. */
  activate(ctx: PluginContext): void | Promise<void>;
  /** Optional teardown. The host also disposes `ctx.subscriptions` for you. */
  deactivate?(): void | Promise<void>;
}
