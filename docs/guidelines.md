# Obsidian Plugin Development Guidelines

Reference for developing `obsidian-better-edit`. Distilled from the official
[Obsidian developer docs](https://docs.obsidian.md), the
[sample plugin AGENTS.md](https://github.com/obsidianmd/obsidian-sample-plugin),
and the rules enforced by `eslint-plugin-obsidianmd`.

---

## Manifest (`manifest.json`)

| Field | Rule |
|---|---|
| `id` | Lowercase, hyphens only, no spaces. Must match the plugin folder name. Never contain the substring `obsidian`. Never change after release — treat as a stable API. |
| `name` | Human-readable, title case. |
| `version` | Semantic versioning `x.y.z`. No leading `v`. |
| `minAppVersion` | Must be set. Update when using newer APIs. |
| `description` | Short and clear. |
| `isDesktopOnly` | Boolean. Must be `true` if you use any Node/Electron-only API. |

The `validate-manifest` ESLint rule checks this automatically.

---

## Naming Conventions

### Command IDs
```ts
// Format: "short-action-verb-noun" — no plugin prefix, no "command" word
this.addCommand({ id: "insert-image", name: "Insert image" })

// ❌ Wrong — plugin ID prefix is added automatically by Obsidian
this.addCommand({ id: "obsidian-better-edit:insert-image", ... })

// ❌ Wrong — "command" in the ID
this.addCommand({ id: "image-command", ... })
```

Rules enforced: `commands/no-plugin-id-in-command-id`, `commands/no-command-in-command-id`

### Command Names
```ts
// Sentence case. No plugin name prefix. No "command" word. No trailing period.
{ name: "Insert image" }       // ✅
{ name: "Better Edit: Insert image" }  // ❌ plugin name prefix
{ name: "Insert image command" }       // ❌ "command" word
```

Rules enforced: `commands/no-plugin-name-in-command-name`, `commands/no-command-in-command-name`

### CSS Classes
Use your plugin ID as a prefix to avoid conflicts with Obsidian core and other plugins.
```css
.better-edit-image-wrapper { }
.better-edit-caption { }
```

### Settings Keys
camelCase. Stable — never rename after release.
```ts
interface Settings {
  defaultImageWidth: number;   // ✅
  default_image_width: number; // ❌
}
```

### TypeScript / File Names
- Files: `kebab-case.ts` (e.g., `image-widget.ts`)
- Classes: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE` for module-level constants

---

## Required File Structure

```
obsidian-better-edit/
  src/
    main.ts           # Plugin entry point, lifecycle only (onload / onunload)
    settings.ts       # Settings interface + defaults + SettingTab
    features/
      image/          # One folder per feature
        index.ts      # Feature entry — registers handlers & extensions
        paste-handler.ts
        widget.ts
        resize-handle.ts
        flex-layout.ts
    types.ts          # Shared TypeScript interfaces
  main.js             # Build output (gitignored)
  manifest.json
  styles.css
  package.json
  tsconfig.json
  eslint.config.mts
```

**Rule:** Keep `main.ts` minimal. It should only call `onload`, `onunload`, register features, load settings. All logic lives in feature modules.

---

## Key APIs — Must Use These

### Event & interval registration
Always use the `register*` helpers so Obsidian auto-cleans up on plugin unload.

```ts
// ✅ DOM events
this.registerDomEvent(document, 'paste', handler);
this.registerDomEvent(window, 'resize', handler);

// ✅ Workspace events
this.registerEvent(this.app.workspace.on('file-open', handler));
this.registerEvent(this.app.vault.on('modify', handler));

// ✅ Intervals
this.registerInterval(window.setInterval(fn, 5000));

// ❌ Never use bare addEventListener / setInterval — leaks on unload
document.addEventListener('paste', handler);
setInterval(fn, 5000);
```

### Editor (CodeMirror 6) extensions
```ts
// Register CM6 extensions — auto-unregistered on unload
this.registerEditorExtension(myViewPlugin);
this.registerEditorExtension(myStateField);
```

### File operations — always use Vault API
```ts
// ✅
await this.app.vault.read(file);
await this.app.vault.modify(file, content);
await this.app.vault.create(path, content);
await this.app.fileManager.trashFile(file); // respects user's trash setting

// ❌ Never use Node.js fs directly — breaks mobile and sandboxing
import * as fs from 'fs';
```

Rule enforced: `prefer-file-manager-trash-file`

### DOM helpers — prefer Obsidian's over native
```ts
// ✅ Obsidian helpers (auto-namespaced, popout-window safe)
const div = createDiv({ cls: 'better-edit-wrapper' });
const span = createSpan({ text: 'Caption' });
const el = createEl('figure');

// ❌ Avoid native — breaks popout windows
document.createElement('div');
```

Rule enforced: `prefer-create-el`

### Document / window references
```ts
// ✅ Popout-window safe
activeDocument.querySelector(...)
activeWindow.setTimeout(...)

// ❌ Breaks popout windows
document.querySelector(...)
window.setTimeout(...)
```

Rules enforced: `prefer-active-doc`, `prefer-active-window-timers`

### Platform detection
```ts
// ✅
import { Platform } from 'obsidian';
if (Platform.isDesktop) { ... }
if (Platform.isMobile) { ... }

// ❌
navigator.platform   // banned by `platform` rule
```

### User notifications
```ts
// ✅ Use Obsidian's Notice (non-blocking)
new Notice('Image inserted.');

// ❌ Never use browser dialogs
alert('...');
confirm('...');
```

### Settings
```ts
async onload() {
  this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
}
async saveSettings() {
  await this.saveData(this.settings);
}
```

### Type checks for vault files
```ts
// ✅ Use instanceof
if (file instanceof TFile) { ... }
if (file instanceof TFolder) { ... }

// ❌ Never cast
const f = file as TFile;
```

Rule enforced: `no-tfile-tfolder-cast`

---

## Editor Drop/Paste Handlers

Relevant for our paste-to-insert-image feature.

```ts
// ✅ Must check defaultPrevented AND call preventDefault
this.registerEvent(
  this.app.workspace.on('editor-paste', (evt, editor) => {
    if (evt.defaultPrevented) return;  // required check
    evt.preventDefault();              // required claim
    // ... handle paste
  })
);
```

Rule enforced: `editor-drop-paste`

---

## Forbidden DOM Elements

Do not attach these elements to the DOM:
- `<script>`
- `<iframe>` (unless sandboxed)
- `<object>`, `<embed>`
- `<link rel="stylesheet">` injected dynamically

Rule enforced: `no-forbidden-elements`

---

## Do Not Use Static Style Assignment

```ts
// ❌ Banned — sets styles directly on DOM elements
el.style.width = '300px';
el.style.color = 'red';

// ✅ Use CSS classes defined in styles.css
el.addClass('better-edit-resized');

// ✅ Exception for plugin-written document content (our HTML images)
// The image HTML we write to .md files uses inline styles intentionally
// for portability — this is content, not plugin UI.
```

Rule enforced: `no-static-styles-assignment`

> **Important distinction for this plugin:** The `no-static-styles-assignment` rule
> applies to *plugin UI elements* (modals, settings tabs, widgets). It does NOT
> apply to the HTML content we write into `.md` files — those inline styles are
> intentional and are the whole point of the portability design.

---

## Memory Leak Prevention

```ts
// ❌ Never store a view reference directly in the plugin class
export default class MyPlugin extends Plugin {
  private myView: MyCustomView;  // memory leak — view may be destroyed
}

// ✅ Always look up views dynamically
const view = this.app.workspace.getLeavesOfType('my-view')[0]?.view;
```

Rule enforced: `no-view-references-in-plugin`

```ts
// ❌ Never pass `this` (the Plugin) as the `component` arg to MarkdownRenderer
MarkdownRenderer.render(this.app, md, el, '/', this);

// ✅ Use a Component or the leaf's view
MarkdownRenderer.render(this.app, md, el, '/', new Component());
```

Rule enforced: `no-plugin-as-component`

---

## Node.js Module Usage

```ts
// ❌ Importing Node built-ins without platform guard
import * as path from 'path';

// ✅ Guard with Platform check or set isDesktopOnly: true
import { Platform } from 'obsidian';
if (Platform.isDesktop) {
  const path = require('path');
}
```

Rule enforced: `no-nodejs-modules`

---

## Settings Tab UX

```ts
// ❌ No raw HTML headings in settings
containerEl.createEl('h2', { text: 'General' });

// ✅ Use the Setting API with heading
new Setting(containerEl).setName('General').setHeading();
```

Rules enforced: `settings-tab/no-manual-html-headings`, `settings-tab/no-problematic-settings-headings`

---

## UI Text (Sentence Case)

All user-visible strings must be sentence case — only the first word and proper nouns are capitalised.

```ts
// ✅
new Notice('Image inserted successfully.');
{ name: 'Insert image' }
setName('Default image width')

// ❌
new Notice('Image Inserted Successfully.');
{ name: 'Insert Image' }
setName('Default Image Width')
```

Rule enforced: `ui/sentence-case`

---

## No Default Hotkeys

Do not ship with pre-assigned hotkeys for commands. Let users configure their own.

```ts
// ❌
this.addCommand({
  id: 'insert-image',
  name: 'Insert image',
  hotkeys: [{ modifiers: ['Mod'], key: 'i' }],  // banned
});

// ✅ No hotkeys field
this.addCommand({
  id: 'insert-image',
  name: 'Insert image',
  callback: () => { ... }
});
```

Rule enforced: `commands/no-default-hotkeys`

---

## Security & Privacy

- **No remote code execution.** Never fetch and `eval()` scripts.
- **No telemetry without opt-in.** Any analytics requires explicit user consent + documentation in README.
- **Scope to vault only.** Never read/write files outside the vault.
- **No hidden network calls.** All network requests must be visible to the user.
- **No hardcoded paths.** Never assume `.obsidian/` location — use `app.vault.configDir`.

Rule enforced: `hardcoded-config-path`

---

## Performance

- Keep `onload()` fast. Defer heavy work — lazy-init on first use.
- Debounce/throttle file system event handlers.
- Avoid scanning the entire vault to find a single file.

```ts
// ❌ Slow — iterates all files
const file = this.app.vault.getFiles().find(f => f.path === targetPath);

// ✅ Fast — O(1) lookup
const file = this.app.vault.getFileByPath(targetPath);
```

Rule enforced: `vault/iterate`

---

## Regex

Do not use lookbehind assertions — not supported on some iOS versions.

```ts
// ❌
const re = /(?<=foo)bar/;

// ✅
const re = /foo(bar)/;
```

Rule enforced: `regex-lookbehind`

---

## Releasing

1. Bump `version` in `manifest.json` (SemVer, no `v` prefix).
2. Update `versions.json`: `{ "1.0.1": "0.15.0" }`.
3. Run `npm run build` — produces `main.js`.
4. Create a GitHub release with tag exactly matching the version string.
5. Attach `main.js`, `manifest.json`, `styles.css` as release assets.

---

## ESLint Rule Summary

All rules from `eslint-plugin-obsidianmd` recommended config. Run `npm run lint` to check.

| Category | Rule | What it catches |
|---|---|---|
| Commands | `no-command-in-command-id` | "command" word in command ID |
| Commands | `no-command-in-command-name` | "command" word in name |
| Commands | `no-default-hotkeys` | Pre-assigned hotkeys |
| Commands | `no-plugin-id-in-command-id` | Plugin ID prefix in command ID |
| Commands | `no-plugin-name-in-command-name` | Plugin name prefix in name |
| Lifecycle | `detach-leaves` | Detaching leaves in onunload (auto-fix) |
| Paste/Drop | `editor-drop-paste` | Missing defaultPrevented check or preventDefault call |
| Manifest | `validate-manifest` | Manifest.json field errors |
| Manifest | `hardcoded-config-path` | Hardcoded `.obsidian/` paths |
| DOM | `no-forbidden-elements` | script/iframe/etc attached to DOM |
| DOM | `no-static-styles-assignment` | `el.style.x =` in plugin UI |
| DOM | `prefer-create-el` | `document.createElement` over `createEl` (auto-fix) |
| DOM | `prefer-active-doc` | `document` over `activeDocument` (auto-fix) |
| Window | `prefer-active-window-timers` | `setTimeout` over `activeWindow.setTimeout` (auto-fix) |
| Platform | `platform` | `navigator.platform` for OS detection |
| Mobile | `no-nodejs-modules` | Node built-ins without platform guard |
| Mobile | `regex-lookbehind` | Lookbehind assertions |
| Types | `no-tfile-tfolder-cast` | Casting to TFile/TFolder |
| Memory | `no-view-references-in-plugin` | View refs stored in plugin class |
| Memory | `no-plugin-as-component` | Plugin passed as MarkdownRenderer component |
| Settings | `settings-tab/no-manual-html-headings` | `createEl('h2')` in settings (auto-fix) |
| Settings | `settings-tab/no-problematic-settings-headings` | Bad heading patterns (auto-fix) |
| UI | `ui/sentence-case` | Title-case UI strings (auto-fix) |
| Vault | `vault/iterate` | `getFiles().find()` instead of `getFileByPath()` |
| Code | `object-assign` | `Object.assign` with two args |
| Code | `prefer-instanceof` | Cross-window safe type checks (auto-fix) |
| Code | `prefer-abstract-input-suggest` | Copied TextInputSuggest pattern |
| Code | `prefer-get-language` | localStorage language detection |
| Code | `no-sample-code` | Leftover sample plugin code (auto-fix) |
| Code | `sample-names` | Unrenamed sample class names |
| API | `no-unsupported-api` | APIs above minAppVersion |
| License | `validate-license` | LICENSE file structure |
