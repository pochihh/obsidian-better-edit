# Feature 04 - Text Styling

## Status

| Area | Status |
|---|---|
| Selection toolbar | First pass |
| Markdown toggle actions | First pass |
| Toolbar positioning | First pass |
| Code/math suppression | First pass |
| HTML styling (`<u>`, color) | Later |

---

## Goal

Provide a lightweight inline formatting toolbar for Live Preview selections.

Phase one only operates on native Markdown inline syntax. It does not attempt to
override Obsidian's selected-text source display while a selection is active.

---

## Phase One Scope

Supported actions:

- Bold
- Italic
- Strikethrough
- Inline code
- Inline equation
- Highlight
- Link

Not included in phase one:

- Underline
- Text color
- Selection rendering overrides
- Caret-only toolbar

---

## Trigger and Visibility

- Show after the current non-collapsed selection stabilizes for about `200ms`.
- Position centered above the selection.
- Flip below if there is not enough room above.
- Hide on:
  - selection collapse
  - `Escape`
  - click outside
  - editor blur
- Suppress inside fenced code blocks and math blocks.

---

## Formatting Rules

Each action is an independent toggle.

| Action | Syntax |
|---|---|
| Bold | `**text**` |
| Italic | `*text*` |
| Strikethrough | `~~text~~` |
| Inline code | `` `text` `` |
| Inline equation | `$text$` |
| Highlight | `==text==` |
| Wiki link | `[[Page]]` or `[[Page|text]]` |
| Markdown link | `[text](https://example.com)` |

Behavior:

- If the current selection is fully wrapped in the target syntax, remove one
  logical layer of that syntax.
- If the selection overlaps raw source markers for the same syntax, normalize
  those markers before applying a new wrapper.
- If the selection contains multiple spans of the same syntax, applying that
  syntax again should merge them into one outer wrapper instead of duplicating
  markers and breaking Markdown structure.
- Nesting is allowed.
- After applying/removing a format, keep the transformed inner region selected.

Inline code is single-line only in phase one.
Inline equation is also single-line only.

### Link modes

The link action is split by syntax, not by destination type.

- `[[Page]]` mode:
  - internal wiki links only
  - searches notes in the vault
  - if no note matches, pressing Enter inserts an unresolved wiki link such as
    `[[New Note]]`
- `[text](...)` mode:
  - generic markdown link syntax
  - supports URLs and typed paths

### Delimiter-run normalization

The toolbar must not treat visible raw source markers as ordinary selected text.
Before toggling a format, the formatter normalizes the selection against that
format's delimiter family.

Examples:

- Bold must not be reported as italic for `**text**`.
- Italic applied to `**text**` becomes `***text***`.
- Bold applied to `**text** more` becomes `**text more**`.
- Bold removed from `***text***` becomes `*text*`.

Implementation rules:

- `*` and `**` share one delimiter family and must be interpreted together.
- For the star family:
  - `**text**` means bold only
  - `*text*` means italic only
  - `***text***` means bold + italic
- When applying bold or italic, first strip one logical layer of that exact
  action from star runs already present inside the normalized selection, then
  add one fresh outer wrapper.
- For `~~` and `==`, strip one matching layer from contiguous runs before
  re-wrapping.
- For inline code, only exact single-backtick wrappers are supported in phase
  one. If the selection already contains backticks internally, the code action
  should no-op rather than guess.

### Wrapper precedence

Highlight should remain the outermost inline wrapper when mixed with other
inline styles.

Examples:

- bold then highlight -> `==**text**==`
- highlight then bold -> `==**text**==`
- italic inside highlight -> `==*text*==`
- highlight around bold+italic -> `==***text***==`

Implementation rule:

- `==...==` is treated as an outer wrapper layer.
- If a non-highlight action is applied inside an existing highlight span, the
  formatter rewrites the inner content and preserves the outer highlight
  wrapper.

### Integrity over cleverness

The formatter should prefer structurally valid Markdown over preserving the
exact raw source arrangement. If a selection overlaps existing syntax for the
same action, the plugin may rewrite that syntax into a cleaner equivalent form.

---

## UI Direction

- Reuse the image toolbar's visual language:
  - same surface
  - same border, radius, and shadow
  - same button sizing and hover treatment
- Use compact hover tooltips for button labels.

---

## Future Work

- Underline and color, likely backed by inline HTML
- Rendering layer to reduce raw-source noise during active selection
- Optional keyboard customization
