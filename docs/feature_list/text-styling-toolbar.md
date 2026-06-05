# Text Styling Toolbar

The text styling toolbar makes common inline Markdown formatting available from a small selection menu. It is designed for writers who know what style they want but do not want to type Markdown delimiters manually every time.

![Text styling toolbar in Obsidian](./assets/text-styling-toolbar.png)

## What users see

Typical workflow:

1. Select text in Live Preview.
2. A floating toolbar appears near the selection.
3. Click a formatting action.
4. Better Edit wraps or unwraps the selected text with standard Markdown syntax.

The toolbar stays compact and close to the selected text. It should help the user continue writing rather than pull them into a large formatting panel.

## Sub-features

### Floating selection toolbar

The toolbar appears when Better Edit detects a usable text selection. It contains common inline formatting actions and hides when the selection is cleared.

Expected behavior:

- appears near the selected text;
- avoids covering the selection when possible;
- hides after the action is complete or when the user moves away;
- works with normal Live Preview editing, not only Source mode.

### Bold

Bold wraps the selection in Markdown bold markers.

```md
**selected text**
```

Use for emphasis, important terms, and section-level highlights inside normal paragraphs.

### Italic

Italic wraps the selection in Markdown italic markers.

```md
*selected text*
```

Use for light emphasis, titles, or terminology.

### Strikethrough

Strikethrough wraps the selection with Markdown strikethrough markers.

```md
~~selected text~~
```

Use for revisions, crossed-out alternatives, or visible edits in planning notes.

### Highlight

Highlight wraps the selection with Obsidian/Markdown highlight syntax.

```md
==selected text==
```

Use for study notes, important statements, or review markers.

### Inline code

Inline code wraps the selection in backticks.

```md
`selected text`
```

Use for commands, filenames, identifiers, or short code fragments.

### Inline equation

Inline equation wraps the selection in math delimiters.

```md
$selected text$
```

Use for variables, formulas, and mathematical notation inside a sentence.

### Wiki link

Wiki link turns the selection into an Obsidian wikilink.

```md
[[selected text]]
```

Use for connecting notes without manually typing brackets.

### Markdown link

Markdown link turns the selection into link text and prepares the URL portion.

```md
[selected text](url)
```

Use for standard Markdown links, especially when notes need to remain portable outside Obsidian.

### Toggle behavior

Where possible, toolbar actions should be reversible. If the selected text already has the target formatting, clicking the same action should remove that formatting instead of nesting duplicate markers.

## Native-note promise

The toolbar writes standard Markdown inline markers such as `**bold**`, `==highlight==`, `` `code` ``, `$math$`, and `[[wiki links]]`.
