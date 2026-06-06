# Symbol and Emoji Picker

The symbol and emoji picker helps users insert characters that are awkward to remember, search for, or type directly. It is useful for math notes, research notes, technical writing, annotation, and lightweight emoji marking without leaving Obsidian.

The picker is deliberately simple: open it from the context menu, command palette, or a shortcut; search or browse; choose a symbol; and Better Edit inserts ordinary Unicode text at the cursor. That keeps the feature useful outside the plugin because the saved note contains the actual character, not an image asset or plugin-specific token.

## Demo

<a href="./assets/emoji.gif"><img src="./assets/emoji.gif" alt="Symbol and emoji picker demo" width="900"></a>

The demo shows quick lookup and insertion for symbols and emoji. It is meant to cover both technical writing, where characters like `α`, `→`, or `≈` should be easy to insert, and general note-taking, where emoji can act as compact visual markers.

## What users see

Users open the picker from an enabled entry point, search or browse the available characters, and insert one at the cursor.

Typical workflow:

1. Place the cursor where the symbol should go.
2. Open the picker from the editor context menu, Better Edit command, or configured shortcut.
3. Search for a symbol name, category, or common alias.
4. Choose the symbol.
5. Better Edit inserts the Unicode character into the note.

![Symbol picker in Obsidian](./assets/symbol-picker.png)

## Sub-features

### Search box

The search box filters symbols and emoji by name or label. Searching for `alpha`, for example, makes Greek alpha `α` easy to find without remembering how to type it.

Search supports quick lookup for common writing needs such as:

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

Users can assign a Better Edit shortcut for fast symbol insertion. This is the best workflow for frequent math or technical writing.

### Cursor and selection behavior

The picker inserts at the current cursor position. When text is selected, Better Edit avoids surprising replacement unless the selected insertion mode explicitly supports it.

## Native-note promise

The picker inserts ordinary Unicode text. Notes remain portable and readable without Better Edit, and the characters work in Markdown, HTML, Git diffs, PDFs, and exported notes wherever the chosen font supports them.
