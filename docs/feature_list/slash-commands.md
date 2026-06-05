# Slash Commands

Slash commands provide a fast insertion menu for common Markdown blocks.

## What users see

- Type `/` on a fresh line in Live Preview.
- Choose a command from the menu.
- Continue typing at the inserted cursor position.

## Built-in commands

- Heading 1
- Heading 2
- Heading 3
- Bullet list
- Numbered list
- Checkbox
- Quote
- Code block
- Math block
- Image placeholder
- Divider

## Customization

Users can enable, disable, reorder, and customize slash commands in Better Edit settings. Custom commands use templates and a cursor token so repetitive note patterns can be inserted quickly.

## Scope boundary

Slash commands are intended for normal block insertion in Live Preview. V1 intentionally avoids promising every command in every Markdown context, such as table cells, where many block-level outputs would produce invalid or surprising Markdown.

## Native-note promise

Commands insert plain Markdown or HTML snippets. No command output depends on proprietary storage.
