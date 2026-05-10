# Feature 02 - Blocks Drag and Drop

## Status

| Area | Status |
|---|---|
| Block taxonomy | Draft |
| Boundary detection rules | Draft |
| Drag handle UI | Draft |
| Drop target logic | Draft |
| Move transaction logic | Draft |
| Slash command integration | Not started |

---

## Goal

Provide a Notion-like block editing layer in Live Preview:

- Hover a block to reveal a left-gutter handle and add button.
- Drag the handle to reorder the block.
- Drop between blocks to move source text without changing its syntax.
- Preserve native Markdown and HTML so the file remains portable without the plugin.

The feature is an editing affordance only. It must not introduce custom block syntax.

---

## Core Principles

### Native first

The plugin moves existing Markdown/HTML source ranges. It does not wrap content in plugin-owned markers.

### Conservative detection

If a source region is ambiguous, treat it as a plain text block or do not expose a drag handle. Moving the wrong range is worse than not moving a range.

### Source-preserving moves

Move exact source slices, including indentation and internal newlines. Do not reformat block contents during drag and drop.

### Theme-native UI

All block affordances must use Obsidian theme variables and native interaction patterns. Avoid hardcoded colors, shadows, or opaque custom surfaces unless they reference theme tokens such as `--text-faint`, `--background-modifier-hover`, `--background-modifier-border`, `--interactive-accent`, and `--shadow-s`.

### Code-safe behavior

Do not expose block handles inside fenced code, inline code, raw HTML internals, math blocks, or other regions where the visible text is not normal Markdown structure.

---

## MVP Scope

### In scope

| Block kind | Detection | Move behavior |
|---|---|---|
| Paragraph | One or more non-empty text lines separated by blank lines | Move whole paragraph |
| Heading | Single ATX heading line (`# Heading`) | Move heading line only |
| Setext heading | Text line plus `---`/`===` underline | Move both lines as one heading |
| Horizontal rule | `---`, `***`, `___` on its own line | Move single line |
| List item | Markdown list marker line plus nested child lines | Move item subtree |
| Task item | Same as list item | Move item subtree |
| Blockquote | Consecutive `>` lines | Move whole quote block |
| Callout | Consecutive `>` lines starting with `[!type]` | Move whole callout block |
| Fenced code block | Opening fence through closing fence | Move whole fence block |
| Table | Consecutive table-looking lines | Move whole table |
| HTML block | Complete block-level HTML region | Move whole HTML block |
| Better Edit image | HTML block containing `data-better-edit-image` | Move whole image block |
| Native Obsidian image | Single-line `![[image.png]]` embed | Move image embed line |

### Out of scope for first pass

| Area | Reason |
|---|---|
| Multi-block selection drag | More complex selection semantics; can come later |
| Dragging partial paragraph text | Native text editing should handle this |
| Reparenting list items by horizontal drag | Requires indentation UX; start with vertical reorder only |
| Horizontal drag behavior | Too ambiguous; this feature is vertical reorder only |
| Moving blocks across files | Needs file-level drop model; later |
| Column / grid layouts | Not part of native Markdown |
| Block database semantics | Not a native-first goal |

---

## Block Boundary Rules

Block detection should use `syntaxTree(view.state)` as the primary source, with text-line fallback where Lezer is too coarse.

### Range model

Every detected block produces:

```ts
interface BlockRange {
  kind: BlockKind;
  from: number;
  to: number;
  contentFrom: number;
  contentTo: number;
  lineFrom: number;
  lineTo: number;
  parent?: BlockRange;
}
```

`from` and `to` include the source slice that will move. For most blocks this includes trailing newline handling decided by the move algorithm.

### Trailing newline policy

When moving a block:

- Prefer moving exactly the block plus one trailing newline if present.
- If the block is the final block in the document, include the preceding newline only when needed to avoid leaving extra blank lines.
- Preserve one blank line around paragraph-like blocks when dropping between two paragraph-like blocks.
- Do not add or remove blank lines inside fenced code, HTML, tables, lists, or callouts.

This needs dedicated tests because most visual bugs will come from newline handling.

---

## Detailed Handling Logic

### Paragraphs

A paragraph is one or more source lines that are not another recognized block type and are separated from neighboring paragraphs by blank lines.

Rules:

- Move all paragraph lines together.
- Do not expose handles for individual soft-wrapped visual lines.
- If a paragraph contains inline Markdown, move it unchanged.

### Headings

Move only the heading line.

Setext headings are atomic: `text` followed by `---` or `===` moves as one heading block. Do not expose a drop boundary between the heading text and underline.

### Lists

List item is the first complex case.

Rules:

- Dragging a top-level list item moves that item plus all nested child lines.
- Dragging a nested list item moves only that nested item plus its children.
- Drop targets inside the same list should preserve indentation level.
- First pass should not support horizontal reparenting by drag. The item keeps its original indentation.

Fallback:

- If list indentation is malformed, expose a handle only for the line under hover, or skip handle.

### Blockquotes and callouts

Treat consecutive `>` prefixed lines as one block.

Rules:

- Callouts are just blockquotes with a special first line.
- Move all consecutive quote lines together.
- Include blank quoted lines (`>`) inside the block.
- Stop at the first non-quote line.
- Preserve one following blank separator line when present.
- If a quote has no following blank line, add one when moving it so the next block is not rendered as part of the quote.

### Fenced code blocks

Treat the opening fence through closing fence as one atomic block.

Rules:

- Do not show handles inside the code body.
- Show one handle for the whole fenced block.
- Custom fence languages like ````sp-bar` are still just fenced code blocks.
- If the fence is malformed or unclosed, fall back to line-based text handling.

### HTML blocks

Treat complete block-level HTML as atomic.

Rules:

- Better Edit image HTML moves as one block.
- Generic complete `<div>...</div>` moves as one block.
- Do not expose handles inside HTML internals.
- If HTML is malformed or incomplete, fall back to line-based text handling.

### Tables

Move the full table as one block.

Rules:

- Header, delimiter, and body rows move together.
- Do not expose handles per row in MVP. Table row/cell operations are a separate future feature, likely outside this plugin.
- If only some lines look like a table, require at least header + delimiter before classifying as table.

---

## UI Behavior

### Hover affordance

When hovering a block in Live Preview:

- Show a left-gutter drag handle.
- Show an add button above or beside the handle.
- Keep handles visually outside the content so they do not shift layout.
- Hide handles while typing, selecting text, or dragging image resize/crop handles.

### Drag behavior

During drag:

- The drag model is vertical only. Horizontal mouse position is ignored.
- Show a block-level selection highlight on the source block as soon as the handle is pressed.
- The highlight is visual only; it must not create native text selection.
- Show a drop line between valid block boundaries.
- Auto-scroll near editor top/bottom.
- Do not allow dropping inside the block being dragged.
- Do not allow dropping inside atomic blocks like code, HTML, image, or table.
- Do not reparent list items, change indentation, create columns, or infer side-by-side layout.

### Selection and drop visuals

Source selection:

- Use a subtle block overlay based on Obsidian theme variables.
- For single-line blocks, highlight the rendered line.
- For multi-line blocks such as code, HTML, table, blockquote, or image HTML, highlight the full rendered block region.

Drop indicator:

- Use one thin horizontal line at the insertion boundary.
- The line spans the editor content width, not the full app window.
- The line only means "insert here"; it never means indent, nest, or create a column.

### Add button behavior

MVP:

- Clicking `+` inserts a blank line below the current block and places the cursor there.
- Option-clicking `+` inserts a blank line above the current block and places the cursor there.
- Hovering the `+` button shows a tooltip after about 500ms: "Click to add below. Option-click to add above."

Later:

- Clicking `+` can open the Slash Command menu anchored at the insertion point.

### Markdown-safe drops

Dropping paragraph-like text directly above a standalone `---` can accidentally create a Setext heading. To preserve intent, this drop inserts a separating blank line:

```md
paragraph

---
```

instead of:

```md
paragraph
---
```

---

## Move Algorithm

High-level flow:

1. Detect block under hover.
2. On drag start, capture the block source range and normalized move slice.
3. During drag, compute the nearest valid drop boundary.
4. On drop, dispatch one CodeMirror transaction:
   - remove source range
   - insert moved source at adjusted target position
   - place cursor after moved block
5. Let Obsidian update the file through the normal editor transaction path.

Important:

- If target position is after the original block, adjust the target by the removed slice length.
- Keep undo as a single editor operation.
- Avoid direct `vault.modify`; use editor transactions.
- Treat horizontal pointer movement as irrelevant. The selected drop boundary is based only on vertical pointer position.

---

## Settings

Proposed settings for this feature:

| Setting | Default | Purpose |
|---|---|---|
| Enable block drag handles | On | Master toggle for this feature |
| Show add button | On | Allows users to disable Notion-like plus button |
| Enable list item drag | On | Allows disabling the riskiest block type if needed |
| Enable drag for HTML blocks | On | Allows compatibility escape hatch for custom HTML-heavy notes |

---

## Implementation Plan

### Phase 1 - Block model and detection

- Add `src/features/blocks/block-model.ts`.
- Implement pure detection helpers.
- Build fixtures for paragraph, heading, list, callout, code, HTML, table, and image HTML.

### Phase 2 - Read-only hover UI

- Add CM6 decorations/widgets for handles.
- Verify handles align with visual blocks.
- No moving yet.

### Phase 3 - Drag and drop move

- Implement drag state and drop-line decorations.
- Move source ranges with one transaction.
- Harden newline policy.

### Phase 4 - Add button

- Insert blank block below/above current block.
- Later connect to Slash Command.

---

## Open Questions

Resolved for MVP:

- Headings move only the heading line.
- Tables move as a whole table.
- Malformed fenced code and HTML fall back to line-based text handling.
- `+` adds below; Option-click adds above; tooltip appears after a short delay.
- Feature runs in Live Preview only.

Open for later:

- Whether heading-section movement should exist as an explicit advanced action.
- Whether table-specific editing should live in this plugin or a separate plugin.
