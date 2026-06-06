# Better Edit Feature List

Better Edit adds a native-first editing layer to Obsidian Live Preview. It focuses on common writing and layout actions that usually require awkward Markdown editing, while keeping every note readable as normal Markdown or visible HTML when the plugin is disabled.

This folder is the user-facing feature reference. Each feature page explains the feature, its sub-features, expected user workflow, screenshots, and what Better Edit writes back to the note.

## Feature overview

| Feature | What it improves | Native-note promise |
|---|---|---|
| [Image arrangement](./image-arrangement.md) | Paste/drop images, image placeholders, toolbar actions, resize, align, crop, caption, replace, alt text, copy/duplicate/delete, and multi-image rows. | Stores images as regular Markdown or visible portable HTML image blocks and rows. |
| [Block drag and drop](./block-drag-and-drop.md) | Hover blocks to reveal left-gutter controls, add nearby blocks, reorder content, duplicate/delete blocks, and turn simple blocks into other Markdown block types. | Moves or transforms source text directly; no proprietary block IDs. |
| [Slash commands](./slash-commands.md) | Type `/` at the start of a line to insert headings, lists, checkboxes, quotes, code, math, image placeholders, dividers, custom templates, or registered Obsidian commands. | Inserts plain Markdown/HTML templates or delegates to Obsidian commands. |
| [Text styling toolbar](./text-styling-toolbar.md) | Select text and apply inline formatting without remembering Markdown wrappers. | Writes standard Markdown inline syntax. |
| [Symbol and emoji picker](./symbol-and-emoji-picker.md) | Insert math symbols, Greek letters, arrows, and emoji from command, shortcut, or context menu. | Inserts normal Unicode characters. |

## Release highlights

### Portable HTML for visual editing

Better Edit's image features deliberately use visible HTML instead of hidden plugin state. A rich image block or image row may include `data-better-edit-image` / `data-better-edit-image-row` attributes so Better Edit can reopen controls, but the important content is still ordinary HTML: `<div>`, `<img>`, `alt`, caption text, and inline layout styles.

That means an image-heavy note remains useful in Obsidian without the plugin, in Source mode, in Git diffs, and in other Markdown/HTML renderers.

### Image rows are first-class

Image rows are not just a menu detail. They are a core layout feature for comparing screenshots, grouping figures, and building visual notes. Better Edit supports creating rows from standalone images, adding images/placeholders to rows, reordering row items, moving images between rows, and popping a row image back out as a standalone block.

### Conservative source rewriting

For block movement, row operations, and Turn into conversions, Better Edit favors valid Markdown/HTML over clever guessing. Complex structures move as whole source ranges, while risky conversions are refused instead of corrupting the note.

## Screenshot coverage

The screenshots in these pages are real Obsidian screenshots captured from Better Edit running in a local test vault. They are cropped for documentation focus; they are not generated mockups.

| Asset | Used for |
|---|---|
| [Image toolbar and menu](./assets/image-toolbar-menu.png) | Focused image toolbar and overflow menu. |
| [Image overflow menu](./assets/image-overflow-menu.png) | Full image action list. |
| [Image row placeholders](./assets/image-row-placeholders.png) | Multi-image row layout. |
| [Image placeholder stress case](./assets/image-placeholder-stress.png) | Placeholder behavior across wider row-like layouts. |
| [Block controls](./assets/block-controls.png) | Left-gutter add and drag controls. |
| [Slash command menu](./assets/slash-command-menu.png) | `/` command picker. |
| [Text styling toolbar](./assets/text-styling-toolbar.png) | Floating inline-formatting toolbar. |
| [Symbol picker](./assets/symbol-picker.png) | Searchable symbol/emoji picker. |

## Recommended first-release positioning

Better Edit is best described as a **Live Preview editing toolbox** rather than a complete block editor. The first public release should promise stable, useful editing helpers and avoid implying complete Notion parity.

Use language like:

> Better Edit brings Notion-inspired editing affordances to Obsidian while keeping your notes local, portable, and Markdown/HTML-first.

Avoid language like:

> Turns Obsidian into Notion.
