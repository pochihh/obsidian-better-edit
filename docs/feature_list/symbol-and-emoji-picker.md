# Symbol and Emoji Picker

The symbol and emoji picker helps users insert characters that are hard to remember or type directly. It is useful for math notes, research notes, technical writing, and quick emoji insertion without leaving Obsidian.

![Symbol picker in Obsidian](./assets/symbol-picker.png)

## What users see

Users open the picker from an enabled entry point, search or browse the available characters, and insert one at the cursor.

Typical workflow:

1. Place the cursor where the symbol should go.
2. Open the picker from the editor context menu, Better Edit command, or configured shortcut.
3. Search for a symbol name, category, or common alias.
4. Choose the symbol.
5. Better Edit inserts the Unicode character into the note.

## Sub-features

### Search box

The search box filters symbols and emoji by name or label. In the screenshot, searching for `alpha` shows the normal Latin `A` entry and the Greek alpha `α` entry.

Search should support quick lookup for common writing needs such as:

- Greek letters;
- arrows;
- math operators;
- comparison symbols;
- emoji names.

### Category tabs

The picker groups characters into browsable categories. Current first-release categories include:

- **Math & arrows** for technical symbols, operators, arrows, and Greek letters;
- **Emoji** for common emoji insertion.

The category tabs let users browse when they do not remember the exact symbol name.

### Math symbols and Greek letters

This group is intended for research and technical notes. Examples include:

- Greek letters such as `α`, `β`, `γ`, `Δ`, and `Ω`;
- math operators such as `≈`, `≠`, `≤`, `≥`, `∑`, and `∞`;
- arrows such as `→`, `←`, `↔`, and `⇒`.

### Emoji insertion

Emoji insertion supports lightweight annotation and visual markers in notes. The picker inserts standard Unicode emoji rather than plugin-specific image assets.

### Context-menu entry

When enabled, users can open the picker from the editor context menu. This is useful for mouse-driven editing or when a user notices they need a symbol while revising text.

### Command entry

The picker can be opened from an Obsidian command. This makes it discoverable through Obsidian's command palette and allows users to bind it through Obsidian's normal hotkey system.

### Configurable shortcut

Users can assign a shortcut for fast symbol insertion. This is the best workflow for frequent math or technical writing.

### Cursor and selection behavior

The picker inserts at the current cursor position. When text is selected, Better Edit should avoid surprising replacement unless the selected insertion mode explicitly supports it.

## Native-note promise

The picker inserts ordinary Unicode text. Notes remain portable and readable without Better Edit.
