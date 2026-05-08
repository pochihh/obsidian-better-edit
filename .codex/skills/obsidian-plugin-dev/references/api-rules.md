# Obsidian Plugin API Rules & Reference

Full rule set for Obsidian community plugin development. Read this when working
with unfamiliar APIs, fixing lint errors, or preparing for submission.

## Table of Contents
1. Manifest rules
2. Naming conventions
3. Event & lifecycle registration
4. DOM helpers
5. File & vault operations
6. Editor (CodeMirror 6)
7. UI patterns
8. Platform & mobile
9. Security & compliance
10. ESLint rule index
11. Submission checklist

---

## 1. Manifest rules (`manifest.json`)

Required fields: `id`, `name`, `version`, `minAppVersion`, `description`, `isDesktopOnly`
Optional allowed: `author`, `authorUrl`, `fundingUrl`, `helpUrl`

- `id`: lowercase, alphanumeric + hyphens/underscores only. No `obsidian` or `plugin` substring. Never change after release.
- `version`: SemVer `x.y.z`, no leading `v`
- `minAppVersion`: set accurately — update when using newer APIs
- `description`: max 250 chars, ends with `.`, no "obsidian", no "this plugin", no emoji
- `isDesktopOnly`: must be `true` if you use any Node.js/Electron-only API
- `authorUrl`: must not point to `https://obsidian.md` or the plugin's own GitHub repo
- `fundingUrl`: remove if empty, must not point to `https://obsidian.md/pricing`

---

## 2. Naming conventions

### Command IDs
```ts
// ✅ Short verb-noun, no prefix, no "command" word
this.addCommand({ id: 'insert-image', name: 'Insert image', ... })

// ❌ Plugin ID prefix — Obsidian adds this automatically
this.addCommand({ id: 'better-edit:insert-image', ... })

// ❌ "command" in the ID
this.addCommand({ id: 'image-command', ... })
```

### Command names
```ts
// ✅ Sentence case, no plugin name, no "command" word
{ name: 'Insert image' }
{ name: 'Toggle image caption' }

// ❌
{ name: 'Insert Image' }              // title case
{ name: 'Better Edit: Insert image' } // plugin name prefix
{ name: 'Image insert command' }       // "command" word
```

### No default hotkeys
```ts
// ❌ Never ship pre-assigned hotkeys — users configure their own
this.addCommand({ hotkeys: [{ modifiers: ['Mod'], key: 'i' }], ... })
```

### UI strings — sentence case everywhere
```ts
new Notice('Image inserted.')      // ✅
new Notice('Image Inserted.')      // ❌
setName('Default image width')     // ✅
setName('Default Image Width')     // ❌
```

### CSS classes — plugin ID prefix
```css
.better-edit-image-wrapper { }   /* ✅ */
.image-wrapper { }               /* ❌ may conflict */
```

### Settings keys — camelCase, stable
```ts
interface Settings {
  defaultImageWidth: number;    // ✅
  default_image_width: number;  // ❌
}
```

---

## 3. Event & lifecycle registration

Always use `register*` helpers — they auto-clean up when the plugin unloads.

```ts
// DOM events
this.registerDomEvent(document, 'paste', handler);
this.registerDomEvent(containerEl, 'click', handler);

// Workspace / vault events
this.registerEvent(this.app.workspace.on('file-open', handler));
this.registerEvent(this.app.workspace.on('editor-paste', handler));
this.registerEvent(this.app.vault.on('modify', handler));

// Intervals
this.registerInterval(window.setInterval(fn, 5000));

// CodeMirror 6 extensions
this.registerEditorExtension(myViewPlugin);
this.registerEditorExtension(myStateField);
```

```ts
// ❌ These leak — Obsidian can't clean them up on unload
document.addEventListener('paste', handler);
setInterval(fn, 5000);
```

### Paste/drop handler pattern
```ts
this.registerEvent(
  this.app.workspace.on('editor-paste', (evt: ClipboardEvent, editor: Editor) => {
    if (evt.defaultPrevented) return;  // required — another handler claimed it
    evt.preventDefault();              // required — claim it before handling
    // ... your logic
  })
);
```

### Lifecycle
```ts
async onload() {
  await this.loadSettings();
  // register features, commands, settings tab
}

onunload() {
  // cleanup that register* helpers don't cover (rare)
}

// Never detach leaves in onunload — Obsidian handles this
```

---

## 4. DOM helpers

Prefer Obsidian's helpers over native DOM — they're popout-window safe and
integrate better with Obsidian's component lifecycle.

```ts
// ✅
const div = createDiv({ cls: 'better-edit-wrapper' });
const span = createSpan({ text: 'Caption', cls: 'better-edit-caption' });
const el = createEl('figure', { attr: { style: 'width:300px' } });
const frag = createFragment();

// ❌
document.createElement('div');
document.createDocumentFragment();
```

### Document and window references — popout safety
```ts
// ✅ Works in popout windows too
activeDocument.querySelector('.some-selector');
activeWindow.setTimeout(fn, 100);
activeWindow.requestAnimationFrame(fn);

// ❌ Only works in the main window
document.querySelector('.some-selector');
window.setTimeout(fn, 100);
```

### Do not set styles directly on plugin UI elements
```ts
// ❌ Banned for plugin UI DOM
el.style.width = '300px';
el.style.color = 'red';

// ✅ Use CSS classes in styles.css
el.addClass('better-edit-resized');
```

**Note:** Inline styles in `.md` file content (e.g. `<img style="width:300px">`) are
different — that's document content, not plugin UI. The `no-static-styles-assignment`
rule only applies to DOM elements your plugin creates.

### Forbidden elements
Never attach these to the DOM: `<script>`, unsandboxed `<iframe>`, `<object>`, `<embed>`.

---

## 5. File & vault operations

```ts
// Reading / writing
const content = await this.app.vault.read(file);
await this.app.vault.modify(file, newContent);
await this.app.vault.create('path/to/new.md', '');

// File lookup — fast O(1)
const file = this.app.vault.getFileByPath('some/path.md');  // ✅
const file = this.app.vault.getFiles().find(f => f.path === '...');  // ❌ slow

// Deletion — respects user's trash preference
await this.app.fileManager.trashFile(file);  // ✅
await this.app.vault.trash(file, true);      // ⚠️  warn-level
await this.app.vault.delete(file);           // ⚠️  warn-level

// Type checks
if (abstractFile instanceof TFile) { ... }    // ✅
if (abstractFile instanceof TFolder) { ... }  // ✅
const f = abstractFile as TFile;              // ❌ unsafe cast

// Never use Node.js fs directly
import * as fs from 'fs';  // ❌ breaks mobile
```

### Settings persistence
```ts
async onload() {
  this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
}
async saveSettings() {
  await this.saveData(this.settings);
}
// ❌ Never use localStorage directly
```

---

## 6. Editor (CodeMirror 6)

```ts
import { EditorView, ViewPlugin, Decoration, ViewUpdate } from '@codemirror/view';
import { StateField, StateEffect } from '@codemirror/state';

// Register extensions via plugin API (auto-unregistered on unload)
this.registerEditorExtension(myExtension);

// View plugin pattern
const myPlugin = ViewPlugin.fromClass(class {
  update(update: ViewUpdate) { ... }
}, { decorations: v => v.decorations });

// State field pattern
const myField = StateField.define({
  create() { return Decoration.none; },
  update(deco, tr) { return deco.map(tr.changes); },
  provide: f => EditorView.decorations.from(f),
});
```

### MarkdownRenderer — avoid memory leaks
```ts
// ❌ Passing `this` (the plugin) as component — memory leak
MarkdownRenderer.render(this.app, md, el, '/', this);

// ✅ Use a proper Component
const component = new Component();
MarkdownRenderer.render(this.app, md, el, '/', component);
component.load();
// remember to unload when done
```

### View references — avoid storing in plugin class
```ts
// ❌ View may be destroyed — storing reference leaks
class MyPlugin extends Plugin {
  private myView: MyView;
}

// ✅ Look up dynamically
const leaf = this.app.workspace.getLeavesOfType('my-view-type')[0];
const view = leaf?.view as MyView;
```

---

## 7. UI patterns

### Settings tab
```ts
display(): void {
  const { containerEl } = this;
  containerEl.empty();

  // ✅ Section headings via Setting API
  new Setting(containerEl).setName('Image arrangement').setHeading();

  // ❌ Raw HTML headings
  containerEl.createEl('h2', { text: 'Image arrangement' });
}
```

### Notifications
```ts
new Notice('Image inserted.');     // ✅ non-blocking
alert('Something happened.');      // ❌ blocking browser dialog
confirm('Are you sure?');          // ❌ blocking browser dialog
```

### Input suggestions — use built-in
```ts
// ✅ Use Obsidian's AbstractInputSuggest
import { AbstractInputSuggest } from 'obsidian';

// ❌ Don't copy the community TextInputSuggest pattern
```

### Language detection
```ts
// ✅
import { getLanguage } from 'obsidian';
const lang = getLanguage();

// ❌
localStorage.getItem('language');
```

---

## 8. Platform & mobile

```ts
import { Platform } from 'obsidian';

if (Platform.isDesktop) { /* Node.js APIs ok here */ }
if (Platform.isMobile) { /* mobile-specific behavior */ }

// ❌
navigator.platform  // banned
navigator.userAgent // unreliable for OS detection
```

### Node.js modules — guard or flag
```ts
// ❌ Unguarded Node import — crashes on mobile
import * as path from 'path';

// ✅ Option A: guard with Platform check
if (Platform.isDesktop) {
  const { join } = await import('path');
}

// ✅ Option B: set isDesktopOnly: true in manifest.json
```

### Regex — no lookbehinds (iOS incompatibility)
```ts
// ❌ Lookbehind — unsupported on older iOS
const re = /(?<=foo)bar/;

// ✅
const re = /(foo)(bar)/;
```

---

## 9. Security & compliance

- No `eval()` or dynamic code execution
- No fetching and executing remote scripts
- No telemetry/analytics without explicit user opt-in (document in README + settings)
- No hardcoded `.obsidian/` path — use `app.vault.configDir`
- Scope all file operations to the vault — never access files outside it
- No `innerHTML` assignment with untrusted content (XSS risk)
- Plugin code must not auto-update outside normal GitHub releases
- Must include a `LICENSE` file in the repo root
- No email address in the `author` field of `manifest.json`

---

## 10. ESLint rule index (`eslint-plugin-obsidianmd`)

Run `npm run lint` to check all of these automatically.

| Rule | What it catches | Auto-fix |
|---|---|---|
| `validate-manifest` | Manifest field errors | |
| `hardcoded-config-path` | Hardcoded `.obsidian/` paths | |
| `commands/no-command-in-command-id` | "command" in command ID | |
| `commands/no-command-in-command-name` | "command" in command name | |
| `commands/no-default-hotkeys` | Pre-assigned hotkeys | |
| `commands/no-plugin-id-in-command-id` | Plugin ID prefix in command ID | |
| `commands/no-plugin-name-in-command-name` | Plugin name in command name | |
| `detach-leaves` | Detaching leaves in onunload | ✅ |
| `editor-drop-paste` | Missing `defaultPrevented` check or `preventDefault()` | |
| `no-forbidden-elements` | `<script>`, `<iframe>` etc in DOM | |
| `no-static-styles-assignment` | `el.style.x =` on plugin UI | |
| `no-nodejs-modules` | Unguarded Node.js imports | |
| `no-plugin-as-component` | Plugin passed to MarkdownRenderer | |
| `no-tfile-tfolder-cast` | `as TFile` / `as TFolder` casts | |
| `no-unsupported-api` | APIs above `minAppVersion` | |
| `no-view-references-in-plugin` | View refs in plugin class | |
| `no-sample-code` | Leftover sample plugin code | ✅ |
| `sample-names` | Unrenamed sample class names | |
| `object-assign` | `Object.assign` with two args | |
| `platform` | `navigator.platform` usage | |
| `prefer-abstract-input-suggest` | Copied TextInputSuggest pattern | |
| `prefer-active-doc` | `document` over `activeDocument` | ✅ |
| `prefer-active-window-timers` | `setTimeout` over `activeWindow.setTimeout` | ✅ |
| `prefer-create-el` | `document.createElement` over `createEl` | ✅ |
| `prefer-file-manager-trash-file` | `vault.delete()` over `fileManager.trashFile()` | |
| `prefer-get-language` | `localStorage` language detection | |
| `prefer-instanceof` | Cross-window unsafe type checks | ✅ |
| `regex-lookbehind` | Lookbehind assertions | |
| `settings-tab/no-manual-html-headings` | `createEl('h2')` in settings | ✅ |
| `settings-tab/no-problematic-settings-headings` | Bad heading patterns | ✅ |
| `ui/sentence-case` | Title-case UI strings | ✅ |
| `validate-license` | LICENSE file structure | |
| `vault/iterate` | `getFiles().find()` instead of `getFileByPath()` | ✅ |

---

## 11. Submission checklist (pre-PR)

Run through this before opening a PR to `obsidian-releases`:

**Code & manifest**
- [ ] `npm run lint` passes with zero errors
- [ ] `manifest.json` has all required fields, no forbidden values
- [ ] Plugin ID has no `obsidian` or `plugin` substring
- [ ] Description ≤250 chars, ends with `.`, no "obsidian", no "this plugin"
- [ ] `isDesktopOnly` is correct for the APIs used
- [ ] `authorUrl` does not point to obsidian.md or the plugin repo
- [ ] No sample code or unrenamed sample classes left in

**Repo**
- [ ] `LICENSE` file exists
- [ ] `README.md` explains purpose and usage clearly
- [ ] Issues are enabled on the GitHub repo

**Release**
- [ ] GitHub release exists, tagged exactly as `version` in `manifest.json` (no `v` prefix)
- [ ] Release assets include `main.js` and `manifest.json` as individual files
- [ ] `styles.css` attached if plugin uses custom styles

**PR**
- [ ] Entry added at the end of `community-plugins.json`
- [ ] PR `id`, `name`, `description` exactly match `manifest.json`
- [ ] PR body uses the Community Plugin template with all checkboxes filled (`[x]`)
- [ ] PR title is `Add plugin: <Plugin Name>`
