/**
 * The Monaco we actually ship.
 *
 * Importing `monaco-editor` whole pulls in the CSS, HTML, JSON, and
 * TypeScript *language services* — the pieces that do completion and type
 * checking. This plugin has no language server and deliberately does no type
 * checking (Monaco's checker sees only the open file, so its "cannot find
 * module" errors are wrong), so those services are dead weight: they are the
 * difference between a 4.3 MB bundle and a 3.0 MB one, and between a 337 KB
 * stylesheet and a 75 KB one.
 *
 * `basic-languages` is what remains, and it is what actually matters here:
 * the Monarch grammars behind syntax highlighting for every language this
 * plugin claims.
 */
export * as monaco from "monaco-editor/editor/editor.api.js";
import "monaco-editor/basic-languages/monaco.contribution.js";
