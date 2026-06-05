# Block Drag and Drop

Block controls make Obsidian Live Preview feel easier to rearrange without changing the underlying note format.

## What users see

- Hover a block to reveal left-gutter controls.
- Drag the handle to move a block or list item.
- Click the handle to open a block operation menu.
- Use the menu to delete, create a copy, or turn simple blocks into another type.

## Block operation menu

The V1 menu intentionally stays small:

- **Delete** removes the current block or selected simple block range.
- **Create copy** duplicates the current block or selected simple block range.
- **Turn into** converts simple Markdown blocks line-by-line.

Supported Turn into targets:

- Paragraph
- Heading 1
- Heading 2
- Heading 3
- Bullet list
- Numbered list
- Checkbox
- Code block

## Turn into behavior

Better Edit uses a conservative transformation rule:

1. Strip the source block marker.
2. Preserve indentation and text.
3. Apply the target marker line-by-line.

Example: a nested numbered list can become nested checkboxes while keeping indentation intact.

```md
1. Plan release
   1. Run tests
   2. Capture screenshots
```

becomes:

```md
- [ ] Plan release
   - [ ] Run tests
   - [ ] Capture screenshots
```

## Stability boundaries

For the first release, Better Edit refuses risky transformations instead of guessing. Turn into is disabled/refused for mixed or structurally complex selections such as:

- Tables
- Images and embeds
- Callouts and blockquotes
- HTML blocks
- Horizontal rules
- Dataview, Mermaid, or other special fenced blocks

Normal fenced code blocks and math blocks are treated as code-like text and can be transformed when the selection is unambiguous.

## Native-note promise

Drag and drop moves existing source ranges. Turn into rewrites plain Markdown markers. Better Edit does not add custom block IDs or plugin-only syntax.
