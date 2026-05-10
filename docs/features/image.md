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
| Multi-image flex row | ⬜ Later iteration |

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
