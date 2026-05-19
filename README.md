# Better Edit

Better Edit is an Obsidian plugin that adds a Notion-like editing layer to Live
Preview while keeping notes native-first. It improves editing UX without
introducing proprietary storage formats or changing how notes render without the
plugin.

## Features

- Block drag and drop with left-gutter controls
- Slash commands for fast block insertion
- Selection toolbar for inline formatting and linking
- Image arrangement with resize, alignment, crop, caption, replace, and alt text
- Symbol and emoji picker with context-menu, shortcut, and command-palette entry

## Installation

### Community Plugins

Community Plugins installation will be available after the plugin is accepted
into the official Obsidian directory.

### Manual install

1. Download `manifest.json`, `main.js`, and `styles.css` from a release.
2. Create `<vault>/.obsidian/plugins/better-edit/`.
3. Copy those three files into that folder.
4. Reload Obsidian and enable **Better Edit** in Community Plugins.

## Usage

### Block drag and drop

- Hover a block to reveal the left-gutter add button and drag handle.
- Drag vertically to reorder blocks while preserving Markdown/HTML source.
- Tables, code blocks, HTML blocks, and image blocks move as whole blocks.

### Slash commands

- Type a fresh `/` at the beginning of a line to open the slash menu.
- Built-in commands cover headings, lists, checkboxes, quotes, code blocks,
  math blocks, image placeholders, and dividers.
- Commands are reorderable and customizable in settings.

### Text styling

- Select text to open the inline formatting toolbar.
- Supports bold, italic, strikethrough, highlight, inline code, inline equation,
  wiki links, and markdown links.

### Image arrangement

- Paste or drop images into the note.
- Resize, align, crop, add captions, replace the source, and set alt text
  directly in Live Preview.

### Symbol and emoji picker

- Insert math symbols, Greek letters, arrows, and emoji at the cursor.
- Available from the editor context menu, a plugin-managed shortcut, and an
  Obsidian command.

## Compatibility

- Obsidian Live Preview is the primary editing target.
- `manifest.json` currently declares `minAppVersion: 1.5.7`.
- Desktop support is expected.
- Mobile support is not fully verified yet even though the manifest is not
  desktop-only; this should be treated as provisional until tested.

## Disclosures

- No account required
- No telemetry
- No ads
- No paid feature gating
- No network access required for core features
- Edits local note content in the current vault only

## Known limitations

- The plugin is optimized for Live Preview, not Reading View.
- Some interactions depend on current Obsidian editor internals and should be
  regression-tested against new Obsidian releases.
- Automated tests are still being expanded; current coverage relies heavily on
  fixture-driven manual testing.

## Documentation

- Product and feature design: [`DESIGN.md`](./DESIGN.md)
- Technical architecture and build notes: [`docs/technical.md`](./docs/technical.md)
- Release checklist: [`docs/release-checklist.md`](./docs/release-checklist.md)
- Testing notes and fixtures: [`docs/testing.md`](./docs/testing.md)
- Feature docs: [`docs/features/`](./docs/features/)
- Development rules and Obsidian guidance: [`docs/guidelines.md`](./docs/guidelines.md)

## Development

```bash
npm install
npm run dev
```

Useful commands:

- `npm run build`
- `npm run lint`
- `npm run styles:build`

## License

MIT
