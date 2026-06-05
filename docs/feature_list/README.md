# Better Edit Feature List

Better Edit adds a native-first editing layer to Obsidian Live Preview. It focuses on common writing and layout actions that usually require awkward Markdown editing, while keeping every note readable as normal Markdown or HTML when the plugin is disabled.

This folder is the user-facing feature reference. Each feature page explains the feature, its sub-features, expected user workflow, and what Better Edit writes back to the note.

## Feature overview

| Feature | What it improves | Native-note promise |
|---|---|---|
| [Image arrangement](./image-arrangement.md) | Paste/drop images, resize, align, crop, caption, replace, set alt text, copy/duplicate/delete, and arrange image rows. | Stores images as regular Markdown or visible HTML image blocks in the note. |
| [Block drag and drop](./block-drag-and-drop.md) | Hover blocks to reveal left-gutter controls, reorder content, duplicate/delete blocks, and turn simple blocks into other Markdown block types. | Moves or transforms source text directly; no proprietary block IDs. |
| [Slash commands](./slash-commands.md) | Type `/` at the start of a line to insert headings, lists, checkboxes, quotes, code, math, images, dividers, or custom templates. | Inserts plain Markdown/HTML templates. |
| [Text styling toolbar](./text-styling-toolbar.md) | Select text and apply inline formatting without remembering Markdown wrappers. | Writes standard Markdown inline syntax. |
| [Symbol and emoji picker](./symbol-and-emoji-picker.md) | Insert math symbols, Greek letters, arrows, and emoji from command, shortcut, or context menu. | Inserts normal Unicode characters. |

## Screenshot coverage

The screenshots in these pages are real Obsidian screenshots captured from Better Edit running in a local test vault. They are not generated mockups.

- [Image toolbar and menu screenshot](./assets/image-toolbar-menu.png)
- [Block controls screenshot](./assets/block-controls.png)
- [Slash command menu screenshot](./assets/slash-command-menu.png)
- [Text styling toolbar screenshot](./assets/text-styling-toolbar.png)
- [Symbol picker screenshot](./assets/symbol-picker.png)

## Recommended first-release positioning

Better Edit is best described as a **Live Preview editing toolbox** rather than a complete block editor. The first public release should promise stable, useful editing helpers and avoid implying complete Notion parity.

Use language like:

> Better Edit brings Notion-inspired editing affordances to Obsidian while keeping your notes local, portable, and Markdown-first.

Avoid language like:

> Turns Obsidian into Notion.
