import type * as MonacoNs from "monaco-editor";

/**
 * Loads Monaco's prebuilt AMD bundle from a URL at runtime.
 *
 * Monaco is deliberately NOT bundled into app.js. `bb plugin build` runs one
 * fixed esbuild config — single entry, single outfile, no code splitting and
 * no loader map — which means the ESM build fails outright (its stylesheet
 * pulls in codicon.ttf, and no loader is configured for `.ttf`), and even
 * patched around it, a dynamic import cannot split, so all ~4.4 MB would
 * parse at app boot for every user with the plugin enabled. Loading the AMD
 * build from a URL keeps our bundle at a few KB, defers every byte of Monaco
 * until a file tab actually opens, and gets the stylesheet, fonts, workers,
 * and on-demand language definitions working exactly as Microsoft ships them.
 *
 * The URL comes from `bb.sdk.files.createPreview` over `monaco-editor/min/vs`
 * (see server.ts) — same origin as the app, so workers are not cross-origin.
 *
 * Caveat worth knowing: Monaco's README marks the AMD build deprecated. It
 * ships in 0.56 and works; if it is ever dropped, the replacement is to serve
 * a self-built ESM bundle from the same preview URL, which changes this file
 * and nothing else.
 */

type AmdRequire = {
  (modules: string[], onLoad: () => void, onError: (error: unknown) => void): void;
  config(options: { paths: Record<string, string> }): void;
};

type MonacoGlobals = {
  require?: AmdRequire;
  define?: unknown;
  monaco?: typeof MonacoNs;
  MonacoEnvironment?: unknown;
};

/**
 * One load per app window, shared by every open editor tab. Keyed by nothing:
 * the asset URL can change when a lease is re-issued, but the loader is
 * already configured by then and Monaco is in memory, so re-booting it would
 * be wasteful and would re-register its global `define`.
 */
let bootPromise: Promise<typeof MonacoNs> | null = null;

export function loadMonaco(baseUrl: string): Promise<typeof MonacoNs> {
  bootPromise ??= boot(baseUrl);
  return bootPromise;
}

async function boot(baseUrl: string): Promise<typeof MonacoNs> {
  // Monaco's loader installs `require`/`define`/`monaco` as page globals;
  // TypeScript's view of globalThis knows nothing about them.
  const globals = globalThis as unknown as MonacoGlobals;

  await injectScript(`${baseUrl}/loader.js`);
  const amdRequire = globals.require;
  if (!amdRequire) {
    throw new Error("Monaco's AMD loader did not install itself");
  }
  amdRequire.config({ paths: { vs: baseUrl } });

  // Deliberately NOT setting MonacoEnvironment: Monaco 0.56's AMD build
  // assigns `self.MonacoEnvironment` itself during `editor.main`, with a
  // getWorker that builds blob workers from its own bundled worker assets.
  // Anything set here is overwritten by it.
  await new Promise<void>((resolve, reject) => {
    amdRequire(
      ["vs/editor/editor.main"],
      () => resolve(),
      (error) =>
        reject(error instanceof Error ? error : new Error(String(error))),
    );
  });

  const monaco = globals.monaco;
  if (!monaco) {
    throw new Error("Monaco loaded but did not expose its API");
  }
  configureDiagnostics(monaco);
  return monaco;
}

/**
 * Turns off type checking, leaving syntax checking on.
 *
 * `monaco-editor` bundles the whole TypeScript compiler (its `ts.worker` is
 * ~7 MB) and `editor.main` wires it up by default, so opening a `.ts` file
 * silently starts a type checker in a web worker. Nothing in BB asks for
 * this and BB has no LSP — it is Monaco's own batteries.
 *
 * That checker has no file system. It sees exactly one file: the open model.
 * Every import therefore fails to resolve, and the editor fills with
 * "Cannot find module" on imports that are perfectly correct on disk. The
 * diagnostics are not just noisy, they are wrong.
 *
 * Syntax diagnostics stay on: an unbalanced brace is a real error in a
 * single file, and reporting it needs no project graph. If BB ever grows
 * real language-server support, semantic checking belongs there — with the
 * whole project behind it — not in this worker.
 */
interface DiagnosticsDefaults {
  setDiagnosticsOptions(options: {
    noSemanticValidation: boolean;
    noSyntaxValidation: boolean;
    noSuggestionDiagnostics: boolean;
  }): void;
}

interface TypescriptNamespace {
  typescriptDefaults?: unknown;
  javascriptDefaults?: unknown;
}

function isDiagnosticsDefaults(value: unknown): value is DiagnosticsDefaults {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { setDiagnosticsOptions?: unknown })
      .setDiagnosticsOptions === "function"
  );
}

/**
 * Monaco 0.56 deprecated `languages.typescript` in favour of a top-level
 * `typescript` namespace, but the AMD build still installs the working
 * implementation on `languages` and types the deprecated path as an inert
 * `{ deprecated: true }` stub. The declarations and the runtime disagree, so
 * probe both and narrow what comes back.
 */
function typescriptNamespaceOf(monaco: typeof MonacoNs): TypescriptNamespace[] {
  const candidates: unknown[] = [
    (monaco as { typescript?: unknown }).typescript,
    (monaco.languages as { typescript?: unknown } | undefined)?.typescript,
  ];
  return candidates.filter(
    (candidate): candidate is TypescriptNamespace =>
      typeof candidate === "object" && candidate !== null,
  );
}

function configureDiagnostics(monaco: typeof MonacoNs): void {
  let configured = 0;
  for (const namespace of typescriptNamespaceOf(monaco)) {
    for (const defaults of [
      namespace.typescriptDefaults,
      namespace.javascriptDefaults,
    ]) {
      if (!isDiagnosticsDefaults(defaults)) continue;
      defaults.setDiagnosticsOptions({
        noSemanticValidation: true,
        noSyntaxValidation: false,
        noSuggestionDiagnostics: true,
      });
      configured += 1;
    }
  }
  if (configured === 0) {
    // Not fatal, but the editor will fill with false "Cannot find module"
    // errors, and the cause would otherwise be invisible.
    console.warn(
      "[monaco] could not disable semantic diagnostics: Monaco's typescript" +
        " defaults were not found at either the current or deprecated path",
    );
  }
}

const OVERFLOW_NODE_ID = "bb-plugin-monaco-overflow-widgets";

/**
 * A body-level host for Monaco's "overflow widgets" — hovers, the suggest
 * list, the parameter hints, the context menu.
 *
 * By default Monaco renders these inside the editor's own DOM, where BB's
 * panel chrome clips them: a hover wider than the panel is cut off at its
 * edge rather than overflowing across the conversation.
 *
 * `fixedOverflowWidgets: true` alone is not enough here. It switches the
 * widgets to `position: fixed`, which normally escapes ancestor clipping —
 * but one of the panel's ancestors is a Tailwind `@container`, and
 * `container-type: inline-size` establishes a containing block for fixed
 * descendants, so they stay trapped. Giving Monaco a node outside that
 * subtree is what actually frees them.
 *
 * Shared by every open editor (Monaco supports that) and deliberately not
 * torn down: it is one empty div, and removing it while another tab's editor
 * still references it would break that editor's widgets.
 */
export function overflowWidgetsNode(): HTMLElement {
  const existing = document.getElementById(OVERFLOW_NODE_ID);
  if (existing !== null) return existing;
  const node = document.createElement("div");
  node.id = OVERFLOW_NODE_ID;
  // Monaco's widget CSS is scoped under `.monaco-editor`, so the host node
  // has to carry that class or the hovers render unstyled.
  node.className = "monaco-editor";
  node.style.position = "absolute";
  node.style.top = "0";
  node.style.left = "0";
  // Above BB's panel chrome. Kept below the 50+ band that dialogs and the
  // app header occupy, and since radix portals mount later in the body they
  // still stack over this.
  node.style.zIndex = "40";
  document.body.appendChild(node);
  return node;
}

/** Keeps the overflow host on the same Monaco theme as the editors. */
export function setOverflowWidgetsTheme(theme: "vs" | "vs-dark"): void {
  const node = document.getElementById(OVERFLOW_NODE_ID);
  if (node !== null) node.className = `monaco-editor ${theme}`;
}

function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}
