# Feature 01 — Image Arrangement

## Status

| Area | Status |
|---|---|
| Paste / drop → vault file | ✅ Done |
| Live Preview widget | ✅ Done |
| Resize handle | ✅ Done |
| Alignment (left / center / right) | ✅ Done |
| Caption inline editing | ✅ Done |
| Crop modal | ✅ Done |
| Circle crop | ✅ Done |
| Compact toolbar (small images) | ✅ Done |
| Modular action registry | ⬜ Planned |
| Replace (import panel) | ✅ Done |
| Alt text (popover + badge) | ✅ Done |
| Copy block | ✅ Done |
| Duplicate block | ✅ Done |
| Delete block | ✅ Done |
| Export cropped image | ⬜ Later (complexity: format handling) |
| Multi-image flex row | 🚧 In progress |
| Row drag and drop polish | 🚧 In progress |

---

## Toolbar & Action System

### Modular Action Registry

All toolbar actions are defined as a flat list of `ImageToolAction` descriptors. The toolbar builder and More-menu builder both consume this list — adding a new action means adding one entry, nothing else.

```ts
interface ImageToolAction {
  id: string;
  icon: ImageIconName;          // icon for toolbar button
  label: string;                // tooltip + menu item title
  toolbar: boolean;             // true → appears as button in full toolbar
  isActive?: (block: SingleImageBlock) => boolean;   // for toggle highlight
  execute: (ctx: ActionContext) => void;
}

interface ActionContext {
  view: EditorView;
  block: SingleImageBlock;
  from: number;
  to: number;
  plugin: BetterEditPlugin;
  frameEl: HTMLElement;
}
```

### Default Action List (in order)

| id | toolbar | label |
|---|---|---|
| `align-left` | ✅ | Align left |
| `align-center` | ✅ | Align center |
| `align-right` | ✅ | Align right |
| `caption` | ✅ | Caption |
| `crop` | ✅ | Crop |
| `replace` | ✅ | Replace |
| `alt-text` | ❌ | Alt text |
| `copy` | ❌ | Copy |
| `duplicate` | ❌ | Duplicate |
| `delete` | ❌ | Delete |

`toolbar: true` actions render as icon buttons in the full toolbar (left → right in order). All actions appear in the More context menu regardless of `toolbar` value. In compact mode (image < 220px wide), only the More button is shown.

Separator groups in the More menu:
1. Align left / center / right
2. Caption, Crop, Replace
3. Alt text
4. Copy, Duplicate, Delete

---

## HTML File Format

All HTML uses inline styles only — no classes, no plugin CSS. Renders correctly without the plugin.

### Plain image

Width is always on the outer `<div>`. The `<img>` always uses `width: 100%` relative to the frame.

```html
<!-- center (default) -->
<div data-better-edit-image="filled" style="width: 320px; text-align: center;">
  <img src="attachments/photo.png" style="width: 100%; max-width: 100%;" />
</div>

<!-- with caption -->
<div data-better-edit-image="filled" style="width: 320px; text-align: center;">
  <img src="attachments/photo.png" style="width: 100%; max-width: 100%;" />
  <p style="font-size: 0.85em; color: #888; margin: 4px 0 0;">Caption text</p>
</div>
```

> **Migration note**: Old HTML written before this was unified has `width` on the `<img>` and no `width` on the outer `<div>`. The parser handles both shapes — outer div width takes precedence when present.

### Cropped image

`overflow: hidden` on the wrapper, negative margins on the img.

```html
<div data-better-edit-image="filled" style="width: 300px; overflow: hidden; height: 200px; margin: 0 auto;">
  <img src="attachments/photo.png" style="width: 500px; max-width: none; margin-left: -80px; margin-top: -40px; display: block;" />
</div>
```

### Circle crop

Same as cropped, with `border-radius: 50%` on the wrapper and equal width/height.

```html
<div data-better-edit-image="filled" style="width: 240px; overflow: hidden; height: 240px; border-radius: 50%; margin: 0 auto;">
  <img src="attachments/photo.png" style="width: 400px; max-width: none; margin-left: -80px; margin-top: -80px; display: block;" />
</div>
```

### Alt text

Written as the `alt` attribute on the `<img>` tag.

```html
<div data-better-edit-image="filled" style="width: 320px; text-align: center;">
  <img src="attachments/photo.png" style="width: 100%; max-width: 100%;" alt="A cat sitting on a chair" />
</div>
```

---

## Live Preview Widget

### DOM Structure

```
.be-image-widget          (full-width block; alignment class)
  .be-image-frame         (inline-block; position context; width = block.width)
    .be-image-crop-clip   (position:absolute inset:0; overflow:hidden — crop only)
      img
    .be-image-caption     (figcaption; contenteditable — when caption exists)
    .be-image-alt-badge   (bottom-right badge "[ALT]" — when alt exists)
    .be-resize-handle     (right edge pill)
    .be-image-toolbar     (top-right card)
```

### Resize

Crop images use `aspect-ratio` + percentage-based `img` sizing so the browser scales everything proportionally when `max-width: 100%` constrains the frame. Scale base for saved crop values is `parseInt(block.width)`, not `frameEl.offsetWidth`, preventing drift across multiple resizes.

---

## Crop Modal

Full-screen modal (max 860×700px). Top bar: ratio/shape dropdown (left), "Crop image" title (center), Cancel + Save (right). Image area: image at up to 740px wide, SVG mask dims outside the selection, 8 resize handles on the draggable crop box.

### Ratio options

| Label | Ratio | Shape |
|---|---|---|
| Free | unconstrained | rect |
| Square | 1:1 | rect |
| 16 : 9 | 16/9 | rect |
| 4 : 3 | 4/3 | rect |
| 3 : 2 | 3/2 | rect |
| Circle | 1:1 | circle |

---

## Replace Panel

Triggered from toolbar or More menu. A floating panel anchored below the image, closes on outside click (not a modal).

### Import tab

- "Upload file" button → OS file picker.
- Drag and drop a file onto the panel.
- File **outside vault** → copies into vault attachment folder (same as paste), updates `src` to relative path.
- File **inside vault** → updates `src` to the relative vault path, no copy.
- `src` format is always a relative path for cross-platform compatibility.

### Link tab

- Single text field pre-filled with the current `src` value.
- User pastes any relative path or URL. Applied on confirm (Enter or button).

*(Unsplash / GIPHY tabs: not included.)*

---

## Image rows

Rows are stored as one HTML block with `data-better-edit-image-row` on the outer
wrapper and individual Better Edit image / placeholder blocks nested inside it.

Rows are normalized to represent multi-item layouts only:

- `0` items left: the row disappears
- `1` item left: the remaining item becomes a standalone image or placeholder block
- `2+` items left: the row remains a row

New rows default to `flex-wrap: wrap` so oversized rows stay reachable in the
editor. Users can switch a row back to `nowrap` from the row toolbar menu.

### Current row interactions

Supported drag-and-drop cases:

1. Standalone → standalone
   - Drag one standalone image onto another standalone image.
   - Better Edit rewrites both blocks into one row block.

2. Standalone → row
   - Drag a standalone image into an existing row.
   - Better Edit inserts it at the hovered slot.

3. Row item → same row reorder
   - Drag an item left/right within its own row.
   - Better Edit rewrites the row HTML with the new order.

4. Row item → standalone
   - Drag a row item onto a standalone image.
   - Better Edit rewrites the standalone target into a new row and removes the
     item from the source row.

5. Row item → different row
   - Drag a row item into another row.
   - Better Edit inserts it at the hovered slot and removes it from the source row.

6. Row item → outside row
   - Drop a row item with no row/standalone target.
   - Better Edit pops it out into a standalone block directly after the source row.

### Current limits

Not supported yet:

- row → row merges

### Placeholder behavior

For row drag/drop logic, placeholders are treated the same as normal image items.

That means placeholders:

- can be reordered within a row
- can participate in standalone → row insertion
- can participate in standalone → standalone row creation

### Drag UI rules

- Pointer events drive the drag lifecycle; Better Edit does not use the browser's
  native HTML5 drag API.
- During drag, normal image hover toolbars and resize affordances are suppressed.
- A lightweight drag ghost follows the pointer.
- Row targets show a vertical insertion line.
- Standalone → standalone row creation shows a left/right half overlay on the
  hovered target image.

### Source rewrite rule

Drop targets are decided from widget DOM, but the final document change always
re-parses the current source block(s) from the live editor document before
dispatching changes.

### Row toolbar architecture

The visible row toolbar is not owned by each row widget. Better Edit keeps one
persistent floating row-toolbar shell per editor view and points it at the
currently active row.

That avoids toolbar flicker during row re-renders:

- row widgets own row content only
- the controller owns one floating toolbar shell
- button state and actions are refreshed from the live row block before use

---

## Alt Text

### Trigger points

1. "Alt text" item in the More menu.
2. `[ALT]` badge on the bottom-right corner of the image frame (shown when alt text exists, on hover).

### UI

A dark popover card anchored to the badge / menu item:

```
┌──────────────────────────────────┐  ×
│ Add alt text to describe this    │
│ image. This makes your page more │
│ accessible to people who are     │
│ vision-impaired or blind.        │
│                                  │
│ [ current alt text...          ] │
└──────────────────────────────────┘
```

- Text input pre-filled with existing `alt` value (empty if none).
- Changes applied on blur or Enter.
- Clearing the field removes the `alt` attribute.

### Badge

`.be-image-alt-badge` — positioned absolute at bottom-right of the frame. Shown only when `block.alt` is non-empty. Clicking opens the same popover.

---

## Copy, Duplicate, Delete

| Action | Behavior |
|---|---|
| Copy | Copies the raw HTML block string to the system clipboard. |
| Duplicate | Inserts an identical HTML block immediately below the current one, with the cursor placed after it. |
| Delete | Removes the entire block from the document. |

---

## Export (Deferred)

Export the crop region as a new image file. Deferred: format handling is complex (GIF, JPEG, PNG, WebP all behave differently when rendered to canvas). Will revisit as a later iteration.
