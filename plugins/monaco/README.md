# bb-plugin-monaco

Opens files in BB using [Monaco](https://microsoft.github.io/monaco-editor/),
the editor from VS Code, instead of BB's read-only file preview.

It applies everywhere BB opens a file: links clicked in chat, the secondary
panel's file search, and `bb thread open`.

## Features

- **Edit and save.** <kbd>⌘S</kbd> writes the file. If it changed on disk
  since you opened it — often because the agent edited it — the save stops and
  offers Reload or Overwrite rather than clobbering the change.
- **Find in file** with <kbd>⌘F</kbd>, plus Monaco's usual editing: multiple
  cursors, block selection, bracket matching, code folding.
- **Syntax highlighting** for ~86 common file types.
- **File tree.** Toggle it from the file bar to browse the project, filter by
  path, expand and collapse directories, and jump to another file. It opens
  with the current file revealed. Right-click any row to copy its absolute
  path, relative path, or filename.
- **Follows your theme,** including light/dark switches and custom palettes.

## Development

Ships with BB as a builtin; there is nothing to install.

```
pnpm exec turbo run typecheck test --filter=bb-plugin-monaco
```

Monaco's AMD build is what the editor loads at runtime, and packaging copies
only a builtin's `dist/`, so `scripts/stage-assets.mjs` copies
`monaco-editor/min/vs` into `dist/vs` during the build
(`apps/server/scripts/copy-builtin-plugins.ts` runs it). Running from source
there is no `dist/`, and the server falls back to resolving `monaco-editor`
from `node_modules`.

## Which files it opens

The plugin claims the extensions listed in `lib/languages.ts` — common code,
config, and text formats. Binaries like `png` and `pdf` are left to BB's own
preview, which renders them properly.

To change any file type back, use **Settings → File openers**, which offers
Automatic, BB's built-in preview, or Monaco per extension. Right-clicking a
file link also offers a one-off "Open with…".

## Roadmap

- **Language intelligence.** There is no language server, so no
  go-to-definition, find-references, or type checking. Monaco ships a
  TypeScript checker, but it can only see the one open file, so every import
  looks unresolved — it is switched off rather than showing errors that are
  wrong.
- **File operations.** The tree is read-only; renaming, creating, and
  deleting files are not implemented yet.
- **Hidden files and `node_modules`** never appear in the tree. BB's path
  listing excludes them and offers no way to ask for them
  ([#2093](https://github.com/get-bb/bb/issues/2093)).
- **Opening a file from the tree reuses the current tab,** so the tab title
  keeps naming the file it was opened with. A plugin cannot ask BB to open a
  file or retitle its tab ([#2102](https://github.com/get-bb/bb/issues/2102)).
- **No "open in editor" button** like BB's preview has; that capability is not
  available to plugins.
- **Thread-storage files on a remote machine** fail to open.
