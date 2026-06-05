# Better Edit Feature List

Better Edit adds a small, native-first editing layer to Obsidian Live Preview. The plugin focuses on common writing actions that usually require awkward Markdown editing, while keeping every note readable as normal Markdown or HTML when the plugin is disabled.

## Feature overview

| Feature | What it improves | Native-note promise |
|---|---|---|
| [Image arrangement](./image-arrangement.md) | Paste/drop images, resize, align, crop, caption, replace, set alt text, and arrange image rows. | Stores images as regular Markdown or HTML image blocks in the note. |
| [Block drag and drop](./block-drag-and-drop.md) | Hover blocks to reveal left-gutter controls, reorder content, duplicate/delete blocks, and turn simple blocks into other Markdown block types. | Moves or transforms source text directly; no proprietary block IDs. |
| [Slash commands](./slash-commands.md) | Type `/` at the start of a line to insert headings, lists, checkboxes, quotes, code, math, images, dividers, or custom templates. | Inserts plain Markdown/HTML templates. |
| [Text styling toolbar](./text-styling-toolbar.md) | Select text and apply inline formatting without remembering Markdown wrappers. | Writes standard Markdown inline syntax. |
| [Symbol and emoji picker](./symbol-and-emoji-picker.md) | Insert math symbols, Greek letters, arrows, and emoji from command, shortcut, or context menu. | Inserts normal Unicode characters. |

## Recommended first-release positioning

Better Edit is best described as a **Live Preview editing toolbox** rather than a complete block editor. The first public release should promise stable, useful editing helpers and avoid implying complete Notion parity.

Use language like:

> Better Edit brings Notion-inspired editing affordances to Obsidian while keeping your notes local, portable, and Markdown-first.

Avoid language like:

> Turns Obsidian into Notion.

## Screenshot

![Better Edit demo screenshot](../assets/better-edit-demo.png)

## Screenshots and demo

A static user-facing demo page lives at [`../demo/index.html`](../demo/index.html). Screenshot assets generated from that page live under [`../assets/`](../assets/) when prepared for release.
