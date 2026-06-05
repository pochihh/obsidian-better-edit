# Better Edit

Better Edit is an Obsidian plugin that adds a Notion-like editing layer to Live
Preview while keeping notes native-first. It improves editing UX without
introducing proprietary storage formats or changing how notes render without the
plugin.

## Features
- **Image arrangement**: resize, align, crop, caption, replace, set alt text, and arrange multi-image rows
- **Block controls**: drag and drop with left-gutter controls, plus a click menu for delete, duplicate, and simple Turn into actions
- **Slash commands**: customizable commands for fast block insertion
- **Text styling**: selection toolbar for inline formatting and linking
- **Symbol and emoji picker**: insert symbols and emoji from a context menu, shortcut, or command-palette entry

### Block drag and drop

- Hover a block to reveal the left-gutter add button and drag handle.
- Drag vertically to reorder blocks while preserving Markdown/HTML source.
- Click the drag handle to open a block menu with Delete, Create copy, and Turn into.
- Turn into supports conservative conversions from simple Markdown types such as paragraphs, headings, lists, checkboxes, normal code blocks, and math blocks into V1 targets like paragraphs, headings, lists, checkboxes, and code blocks.
- Tables, image blocks, HTML blocks, callouts, and other complex structures move as whole blocks but are excluded from V1 Turn into conversions.

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
  
## Installation

### Community Plugins

Community Plugins installation will be available after the plugin is accepted
into the official Obsidian directory.

### Manual install

1. Download `manifest.json`, `main.js`, and `styles.css` from a release.
2. Create `<vault>/.obsidian/plugins/better-edit/`.
3. Copy those three files into that folder.
4. Reload Obsidian and enable **Better Edit** in Community Plugins.

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
- Regression testing is performed locally before release.

## Documentation

- User-facing feature list: [`docs/feature_list/`](./docs/feature_list/)
- Demo page and release screenshots: [`docs/demo/`](./docs/demo/)
- Technical architecture and build notes: [`docs/technical.md`](./docs/technical.md)
- Design principles and implementation rationale: [`docs/technical_notes/project-architecture.md`](./docs/technical_notes/project-architecture.md)
- Feature implementation notes: [`docs/technical_notes/`](./docs/technical_notes/)
- Release checklist: [`docs/release-checklist.md`](./docs/release-checklist.md)
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
