---
name: obsidian-plugin-dev
description: >
  Use this skill when the user is developing, building, or working on an Obsidian
  community plugin in TypeScript. Triggers include: writing or editing plugin source
  code, asking about Obsidian APIs (Plugin, Vault, Workspace, Editor, CodeMirror 6),
  setting up a plugin project, asking about manifest.json or plugin submission,
  fixing ESLint issues in an Obsidian plugin, or implementing any plugin feature
  (commands, settings, modals, editor extensions, decorations, paste handlers, etc.).
  Also trigger when the user asks "how do I do X in an Obsidian plugin" or shares
  a .ts file that imports from "obsidian". Do NOT trigger for general Obsidian usage
  questions (e.g. "how do I use dataview") or generic TypeScript questions unrelated
  to a plugin.
---

# Obsidian Plugin Development

You are helping develop an Obsidian community plugin in TypeScript. Follow this
workflow every session.

## Step 1 — Orient yourself in the project

At the start of a session, silently check for these files and read them if present:

- `docs/guidelines.md` — project-specific rules and ESLint rule reference
- `DESIGN.md` — product decisions and feature design
- `manifest.json` — plugin ID, name, minAppVersion

If none exist, rely on the built-in rules in `references/api-rules.md` (read it now).

Also note the plugin ID from `manifest.json` — you'll need it for CSS class prefixes
and to verify command IDs are not accidentally double-prefixed.

## Step 2 — Apply rules inline while coding

Do not wait for the linter to catch things you already know. The most common mistakes
to prevent inline:

**Naming (get these right every time):**
- Command IDs: `"verb-noun"` — no plugin ID prefix, no word "command"
  → Obsidian auto-prefixes with `pluginId:`, so `"insert-image"` becomes `"better-edit:insert-image"`
- Command names: sentence case, no plugin name prefix, no "command" word
  → `"Insert image"` not `"Insert Image"` not `"Better Edit: Insert image"`
- UI strings everywhere: sentence case — only first word and proper nouns capitalised
- CSS classes: prefix with plugin ID → `.better-edit-wrapper`
- Settings keys: camelCase, stable after release

**APIs (always use these):**
- Events: `this.registerDomEvent(el, 'click', handler)` not `el.addEventListener`
- Workspace events: `this.registerEvent(this.app.workspace.on('file-open', handler))`
- Intervals: `this.registerInterval(window.setInterval(fn, ms))`
- CM6 extensions: `this.registerEditorExtension(extension)`
- DOM creation: `createEl('div')` / `createDiv()` / `createSpan()` not `document.createElement`
- Document ref: `activeDocument` not `document` (popout window safety)
- Window ref: `activeWindow` not `window` for timers
- File lookup: `vault.getFileByPath(path)` not `vault.getFiles().find(...)`
- File deletion: `app.fileManager.trashFile(file)` not `vault.delete()`
- Type checks: `file instanceof TFile` not `file as TFile`
- Platform: `Platform.isDesktop` not `navigator.platform`

**Paste/drop handlers (critical pattern):**
```ts
this.registerEvent(this.app.workspace.on('editor-paste', (evt, editor) => {
  if (evt.defaultPrevented) return;  // MUST check first
  evt.preventDefault();              // MUST claim the event
}));
```

**Keep `main.ts` minimal** — only `onload`, `onunload`, and feature registration.
All logic lives in feature modules under `src/features/`.

## Step 3 — Run the linter at checkpoints only

Run `npm run lint` only at:
- Before committing a completed feature
- After a significant refactor
- When explicitly asked ("run lint", "check compliance", "scan")

```bash
npm run lint        # check
npm run lint:fix    # auto-fix what it can
```

When errors appear, fix them before moving on. If a rule conflicts with an
intentional design choice, document the exception with a comment — never disable
a rule globally without justification.

## Step 4 — File structure

```
src/
  main.ts              # Lifecycle only (onload, onunload, feature registration)
  settings.ts          # Settings interface + defaults + SettingTab
  features/
    <feature-name>/    # One folder per feature
      index.ts         # Entry — registers handlers and CM6 extensions
      *.ts             # Feature modules
  types.ts             # Shared interfaces
```

Split any file that grows beyond ~200-300 lines.

## Step 5 — End-of-session checklist

- [ ] New command IDs follow `"verb-noun"` format (no plugin prefix, no "command")
- [ ] All event handlers use `register*` helpers
- [ ] No bare `document` / `window` in new code
- [ ] Lint run completed if a feature was finished

---

Read `references/api-rules.md` for the full rule set with examples — especially
useful when working with unfamiliar Obsidian APIs, CodeMirror 6 extensions,
settings UI patterns, or preparing for community plugin submission.
