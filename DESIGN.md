# obsidian-better-edit — Design Document

## Overview

**obsidian-better-edit** is a Notion-inspired editing toolbox for Obsidian. It adds
a rich editing layer on top of Obsidian's native Live Preview — drag-and-drop blocks,
a floating text formatting toolbar, a slash command menu, and rich image arrangement —
without changing how files are stored or how Obsidian renders them.

### Features

| # | Feature | Status |
|---|---|---|
| 01 | Image Arrangement | Designed, implementing first |
| 02 | Blocks Drag and Drop | Designed |
| 03 | Slash Command | Designed |
| 04 | Text Styling | Designed |

Implementation order: 01 → shared block model → 03 → 02 → 04

---

## Core Philosophy

### The file is the product. The plugin is the lens.

Every feature follows one rule: **the `.md` file must work perfectly without the plugin
installed**. Open the file in VS Code, push it to GitHub, remove the plugin — content
renders correctly. The plugin enhances how you *interact* with content; it never holds
content hostage in proprietary syntax.

### Native syntax only. No new Markdown extensions.

All features write standard Markdown or standard HTML to files. No custom fenced block
types, no frontmatter magic, no plugin-specific markers. The one exception is
`data-placeholder` attributes on image placeholders — these degrade gracefully to a
visible div without the plugin.

### Inline styles only. No external CSS. No classes.

All HTML written to files uses inline styles exclusively. No class names. No plugin
stylesheets. The HTML is self-describing and portable across any renderer.

### Source mode is always honest.

In Live Preview, the plugin renders rich interactive widgets. In Source mode, the user
always sees and can directly edit the underlying Markdown/HTML. No hidden syntax.

### Non-destructive. Additive only.

Features add editing affordances on top of Obsidian's native behavior. They do not
suppress, replace, or override Obsidian's own rendering or interactions unless
absolutely necessary.

---

## Shared Architecture

### Block Model

A **block** is the atomic unit of content. The block model is defined once in
`src/shared/block-model.ts` and consumed by both Blocks Drag and Drop and Slash
Command.

**Block types:**

| Type | Source pattern | Notes |
|---|---|---|
| Paragraph | plain text, blank-line separated | Most common block |
| Heading | `# `, `## `, `### ` etc. | Each heading is one block |
| List item | `- `, `* `, `1. `, `- [ ] ` | Individual items are blocks |
| Fenced code block | ` ``` ``` ` | Entire fence is one block |
| Blockquote / Callout | `> ` prefix lines | Entire quote is one block |
| HTML block | block-level `<div>`, `<img>` etc. | Our image output is a block |
| Horizontal rule | `---`, `***`, `___` | Single-line block |
| Table | `\| col \|` lines | Entire table is one block |
| Unknown / malformed | unclosed fences, custom ` ```sp-bar ` | Treat as lines of text, safe to move |

Block boundaries are detected using the Lezer syntax tree exposed by CM6:
`syntaxTree(view.state)`. The tree gives precise start/end positions for each
block type in the document.

### CodeMirror 6 Extension Pattern

Each feature registers its own CM6 extension via `this.registerEditorExtension()`.
Extensions are independent — disabling one does not affect others.

```ts
// In each feature's index.ts
export function createFeatureExtension(plugin: BetterEditPlugin): Extension {
  return [myViewPlugin, myStateField];
}

// In main.ts onload
this.registerEditorExtension(createImageExtension(this));
this.registerEditorExtension(createBlocksExtension(this));
```

### Feature Toggle System

Each feature is a module that can be fully toggled off. When disabled, its CM6
extension is not registered and its event handlers are not attached — zero overhead.

### File Structure

```
src/
  main.ts                      # Lifecycle only (onload, onunload, feature init)
  settings.ts                  # Settings interface + defaults + SettingTab
  shared/
    block-model.ts             # Block detection + boundary utilities (CM6 syntax tree)
    cm6-utils.ts               # Shared CM6 helpers (coords, transactions, etc.)
  features/
    image/
      index.ts                 # Registers paste handler + CM6 extension
      paste-handler.ts         # Intercepts paste/drop, saves file, inserts HTML
      widget.ts                # Live Preview widget (image + resize handles + toolbar)
      html-schema.ts           # Generates and parses canonical HTML structures
      flex-layout.ts           # Multi-image flex row logic
    blocks/
      index.ts                 # Registers CM6 ViewPlugin
      drag-handle.ts           # Hover detection, handle widget, drag initiation
      drop-zone.ts             # Drop indicator rendering, document reorder transaction
    slash-command/
      index.ts                 # Registers keydown handler for '/'
      menu.ts                  # Floating menu DOM, keyboard navigation
      templates.ts             # Built-in block templates + user-defined templates
    text-styling/
      index.ts                 # Registers CM6 ViewPlugin
      toolbar.ts               # Floating toolbar DOM, screen-space positioning
      toggle-format.ts         # Bold/italic/etc toggle logic, smart range expansion
  types.ts                     # Shared TypeScript interfaces
```

---

## Feature 01 — Image Arrangement

### Goals

| Principle | Implementation |
|---|---|
| Zero friction | Paste/drop → image appears immediately, stored per user's attachment settings |
| Placeholder support | Slash command creates a draggable placeholder; image filled in later |
| Full flexibility | Drag-resize, alignment, flex rows, non-destructive crop, captions |
| Full compatibility | Raw HTML with inline styles — renders correctly everywhere |

---

### Image States

An image block has two states: **placeholder** and **filled**.

#### Placeholder HTML

Created by the slash command when no image has been selected yet. Immediately
draggable as a block.

```html
<div data-placeholder="image" style="border: 2px dashed #ccc; border-radius: 4px; padding: 32px 16px; text-align: center; color: #999; font-size: 0.9em; min-height: 80px;">
  Paste or drop an image here
</div>
```

Without the plugin: renders as a visible dashed box with hint text.
With the plugin: renders as an interactive drop zone with paste/upload affordances.

When the user pastes or drops an image onto the placeholder, the plugin replaces the
entire `<div>` with the filled image HTML.

#### Filled: Single image, no caption

Always wrapped in a `<div>` so Lezer parses the block as `HTMLBlock` (not inline HTML).
Alignment is controlled by `text-align` on the wrapper for normal flow, or `float` for
text-wrap variants.

```html
<!-- center (default) -->
<div style="text-align: center;">
  <img src="attachments/photo.png" style="width: 320px; max-width: 100%;" />
</div>

<!-- left -->
<div style="text-align: left;">
  <img src="attachments/photo.png" style="width: 320px; max-width: 100%;" />
</div>

<!-- right -->
<div style="text-align: right;">
  <img src="attachments/photo.png" style="width: 320px; max-width: 100%;" />
</div>

<!-- float left (text wraps around image) -->
<div style="float: left; margin: 0 16px 12px 0;">
  <img src="attachments/photo.png" style="width: 320px; max-width: 100%;" />
</div>

<!-- float right -->
<div style="float: right; margin: 0 0 12px 16px;">
  <img src="attachments/photo.png" style="width: 320px; max-width: 100%;" />
</div>
```

The `<div>` wrapper degrades gracefully in any HTML renderer without the plugin.

#### Filled: Image with caption

Width moves to the outer `<div>` so the caption stays pinned to the image width.

```html
<div style="width: 320px; text-align: center; margin: 0 auto;">
  <img src="attachments/photo.png" style="width: 100%; max-width: 100%;" />
  <p style="font-size: 0.85em; color: #888; margin: 4px 0 0;">Caption text</p>
</div>
```

#### Filled: Multiple images in a flex row

```html
<div style="display: flex; gap: 8px; align-items: flex-start;">
  <img src="attachments/img1.png" style="flex: 1; min-width: 0;" />
  <img src="attachments/img2.png" style="flex: 1; min-width: 0;" />
</div>
```

---

### Behavior: Paste & Drop

1. User pastes or drops an image (or onto a placeholder).
2. Plugin intercepts `editor-paste` / `editor-drop` before Obsidian's default handler.
3. Image file saved to vault using the user's configured attachment folder settings.
4. Plugin inserts (or replaces placeholder with) the filled image HTML block.
5. Cursor is advanced to the line after the inserted block (matching Obsidian's native
   `![[img]]` behavior) so Live Preview renders the widget immediately.

---

### Live Preview Widget

The CM6 `ViewPlugin` replaces all image HTML blocks (both placeholder and filled) with
interactive widgets in Live Preview:

**Placeholder widget:** dashed border, "Paste or drop an image here" message, click
to open file picker.

**Filled image widget:**
- Renders the image
- Corner/edge resize handles on hover/selection
- Floating alignment toolbar on selection (align left/center/right, float, caption, crop)
- Hidden raw HTML underneath (source mode always shows it)

Every interaction (resize, align, caption edit) rewrites the underlying HTML in the
document. The widget re-renders from updated HTML.

---

### Interactions

**Resize:** Drag corner handles (proportional) or edge handles (width only). Minimum
80px. Updates `width` in inline style on drag end.

**Alignment toolbar:** Appears on selection. Buttons: align left / center / right /
float left / float right / add caption / crop.

**Captions:** "Add caption" wraps `<img>` in a `<div>` and adds a `<p>`. Caption text
is inline-editable in the widget. Clearing the caption removes the wrapper.

**Non-destructive crop:** CSS-based. Wraps image in `overflow: hidden` container,
uses negative margins to shift visible region. Does not modify the source file.

```html
<div style="width: 300px; height: 200px; overflow: hidden; margin: 0 auto;">
  <img src="attachments/photo.png" style="width: 400px; margin-top: -40px; margin-left: -30px; display: block;" />
</div>
```

**Multi-image flex layout** *(later iteration):* Drag an image to the left/right edge
of another image to create a flex row. Drag out to unwrap. Divider between images is
draggable to adjust relative sizing.

---

### Settings

| Setting | Default | Description |
|---|---|---|
| Enable image arrangement | On | Master toggle |
| Default image width | 100% | Width for newly pasted images |
| Default alignment | Center | Alignment for newly pasted images |

---

## Feature 02 — Blocks Drag and Drop

### Goal

Notion-like block reordering. Every block in the document can be dragged to a new
position using a gutter handle. No new syntax — purely reorders existing content.

---

### Visual Design (Notion-style)

- **Hover** over any block → a `⠿` drag handle appears in the left gutter, and a `+`
  button appears for adding a new block below
- **Drag** the `⠿` handle → the block gets a semi-transparent drag ghost; horizontal
  drop-zone lines appear between other blocks
- **Drop** → block moves to the new position; file is updated

---

### Block Detection

Uses `syntaxTree(view.state)` from the Lezer parser to find block boundaries.
`block-model.ts` exposes:

```ts
interface Block {
  type: BlockType;
  from: number;   // document offset of first character
  to: number;     // document offset after last character (including trailing newline)
  line: number;   // line number of the first line
}

function getBlockAtPos(state: EditorState, pos: number): Block | null
function getAllBlocks(state: EditorState): Block[]
```

Malformed or unknown blocks (unclosed fences, custom block types) default to
`type: 'unknown'` and are treated as text — still draggable, no data loss.

---

### CM6 Implementation

A single `ViewPlugin` handles the entire feature:

1. **Hover tracking:** `mousemove` on `view.dom` → `view.posAtCoords()` → `getBlockAtPos()`.

2. **Handle rendering:** When a block is hovered, a `Decoration.widget` is placed at
   the block's first line start position. The widget renders into the gutter margin
   using absolute positioning relative to the editor.

3. **Drag initiation:** `mousedown` on the `⠿` handle → record `draggedBlock`,
   apply a `.better-edit-dragging` class to the block's DOM lines.

4. **Drop zone rendering:** During drag, `mousemove` → find the nearest block
   boundary → render a 2px horizontal line indicator between blocks.

5. **Drop:** `mouseup` → calculate source and destination positions →
   dispatch a CM6 transaction that:
   - Deletes the block from its original position
   - Inserts it at the destination
   - Preserves cursor position

6. **Cancel:** `keydown Escape` or `mouseup` outside editor → cancel drag, remove
   indicators.

---

### Edge Cases

- **Dragging a list item:** Moves only that item, not the whole list. Sub-items
  (indented) move with their parent item.
- **Dragging a multi-line block** (code block, callout): The entire block moves as
  one unit.
- **Image HTML blocks:** Detected as `type: 'html'`, treated as one block. The drag
  handle appears on the first line of the HTML block.
- **First/last block:** Cannot drag above the first position or below the last.

---

### Settings

| Setting | Default | Description |
|---|---|---|
| Enable blocks drag and drop | On | Master toggle |
| Show `+` button on hover | On | Add-block affordance |

---

## Feature 03 — Slash Command

### Goal

Type `/` at the start of a block (or at the start of a new line) to open a command
menu for inserting a new block type. Supports built-in templates and user-defined
custom templates.

---

### Trigger Conditions

The slash menu opens when:
- `/` is typed at the start of a line, OR
- `/` is typed after only whitespace on a line

It does NOT open when `/` is typed mid-word or mid-sentence.

---

### Menu Design (Notion-style)

A floating panel appears just below the cursor line, showing a searchable list of
block types. The user types to filter. Arrow keys navigate, Enter selects, Escape
dismisses. Clicking outside dismisses.

```
/ _______________
  📄 Text
  # Heading 1
  ## Heading 2
  ### Heading 3
  - Bullet list
  ☑ Checkbox
  1. Numbered list
  ``` Code block
  > Quote
  💬 Callout
  🖼 Image
  ─ Divider
  ─── Custom templates ───
  [user-defined items]
```

---

### Block Templates

On selection, the plugin:
1. Replaces the current line (which contains only `/` + any search text) with the
   template text.
2. Places the cursor at the designated edit position within the template.

**Built-in templates:**

| Name | Inserted text | Cursor position |
|---|---|---|
| Text | *(empty line)* | start of line |
| Heading 1 | `# ` | after `# ` |
| Heading 2 | `## ` | after `## ` |
| Heading 3 | `### ` | after `### ` |
| Bullet list | `- ` | after `- ` |
| Checkbox | `- [ ] ` | after `- [ ] ` |
| Numbered list | `1. ` | after `1. ` |
| Code block | ` ```\n\n``` ` | inside, line 2 |
| Quote | `> ` | after `> ` |
| Callout | `> [!info]\n> ` | after `> ` on line 2 |
| **Image** | *(see below)* | N/A |
| Divider | `---` | next line |

**Image template:** Inserts the image placeholder HTML block and positions the
cursor after it. The placeholder is immediately draggable via the block DnD system.

```html
<div data-placeholder="image" style="border: 2px dashed #ccc; border-radius: 4px; padding: 32px 16px; text-align: center; color: #999; font-size: 0.9em; min-height: 80px;">
  Paste or drop an image here
</div>
```

---

### User-Defined Custom Templates

In settings, users can define named templates with custom Markdown content:

```
Name:    Weekly review
Content: ## Weekly review — {{date}}\n\n### What went well\n\n### What to improve\n
```

Supported variables: `{{date}}` (current date), `{{time}}` (current time),
`{{title}}` (current note title).

Custom templates appear at the bottom of the slash menu, separated by a divider.

---

### CM6 Implementation

1. `EditorView.updateListener` detects when a `/` character is inserted at a valid
   position.
2. A floating `<div>` is appended to `view.dom` (not a CM6 decoration — direct DOM
   for reliable absolute positioning).
3. Menu position calculated from `view.coordsAtPos(cursorPos)`.
4. `keydown` handler on the menu: arrows navigate, Enter selects, Escape dismisses.
5. On selection: dispatch CM6 transaction replacing the current line with the template.
6. Menu is removed from DOM on dismiss or selection.

---

### Settings

| Setting | Default | Description |
|---|---|---|
| Enable slash command | On | Master toggle |
| Custom templates | `[]` | User-defined template list |

---

## Feature 04 — Text Styling

### Goal

A floating formatting toolbar appears when the user selects text, offering quick
access to common Markdown formatting. Works *alongside* Obsidian's native behavior —
does not suppress the source reveal on selection.

---

### Toolbar Design

Appears above the selected text, anchored to the start of the selection.

```
[ B ] [ I ] [ S ] [ ` ] [ == ] [ 🔗 ]
Bold  Ital  Strike Code Highl  Link
```

Toolbar disappears when the selection is cleared or the cursor moves.

---

### Formatting Actions

All actions write standard Markdown syntax to the file.

| Button | Syntax | Example |
|---|---|---|
| Bold | `**text**` | `**hello**` |
| Italic | `_text_` | `_hello_` |
| Strikethrough | `~~text~~` | `~~hello~~` |
| Inline code | `` `text` `` | `` `hello` `` |
| Highlight | `==text==` | `==hello==` |
| Link | `[text](url)` | opens URL input |

---

### Smart Toggle Logic

When applying formatting to a selection:

1. **Selection is fully wrapped** in the target format → remove the format markers.
2. **Selection is partially wrapped** or unwrapped → wrap the entire selection.
3. **Selection spans multiple blocks** → apply to each block independently.

This is intentionally simple and predictable. Edge cases (e.g. selection starts
mid-marker) resolve by extending the format to cover the full selection.

---

### CM6 Implementation

1. `ViewPlugin` with `update(update)` checking `update.selectionSet`.
2. If selection is non-empty → compute toolbar position using
   `view.coordsAtPos(selection.from)`.
3. Floating `<div>` appended to `view.dom` (direct DOM, not a decoration).
4. Toolbar buttons dispatch CM6 transactions that wrap/unwrap the selected range.
5. On `selectionchange` with empty selection → remove toolbar from DOM.

---

### Settings

| Setting | Default | Description |
|---|---|---|
| Enable text styling | On | Master toggle |
| Toolbar buttons | All on | Toggle individual formatting buttons |

---

## Integration Points

These cross-feature behaviours emerge from the features working together:

| Scenario | Features involved |
|---|---|
| `/image` → draggable placeholder | Slash Command + Image + Blocks DnD |
| Paste onto placeholder → filled image | Image |
| Drag image block to new position | Blocks DnD (image HTML block = normal block) |
| Select text inside a block → toolbar | Text Styling |
| Drag handle + `+` button on image block | Blocks DnD |

---

## Future Features

| Feature | Notes |
|---|---|
| Table editor | No clean design yet. Existing plugins handle this. Revisit later. |
| Callout enhancements | Richer callout editing UI |
| Link card previews | Inline card preview for internal/external links |
| Typography | Drop caps, pull quotes |

---

## Technical Stack

| Concern | Approach |
|---|---|
| Language | TypeScript, strict mode |
| Editor API | CodeMirror 6 via Obsidian's API |
| Block detection | Lezer syntax tree (`syntaxTree` from `@codemirror/language`) |
| Build tool | esbuild |
| Linting | `eslint-plugin-obsidianmd` via `npm run lint` |
| Testing | Manual testing in `/Test Vault`; Jest for pure logic |
| Minimum Obsidian version | TBD — target latest stable |

---

## Implementation Order

1. **Feature 01: Image Arrangement** — most self-contained, establishes CM6 widget patterns
2. **Shared block model** (`src/shared/block-model.ts`) — built before features 02 and 03
3. **Feature 03: Slash Command** — first consumer of the block model; simpler than DnD
4. **Feature 02: Blocks Drag and Drop** — most complex; benefits from validated block model
5. **Feature 04: Text Styling** — independent of block model, can start after image
