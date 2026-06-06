# Text Styling Toolbar

The text styling toolbar makes common inline Markdown formatting available directly from the selection. Select a phrase, choose the style you want, and Better Edit writes the Markdown syntax back into the note.

Use it when you are revising prose, marking important ideas, linking notes, annotating research, writing technical notes, or cleaning up emphasis without manually typing pairs of Markdown delimiters.

## Why Use It?

Inline Markdown is portable, but it is easy to interrupt your writing flow when you need to wrap existing text in bold, highlight, inline code, math, or link syntax. The toolbar keeps those actions close to the selected text, so formatting feels visual while the saved file stays plain.

## Demo

<a href="./assets/text_styling.gif"><img src="./assets/text_styling.gif" alt="Text styling toolbar applying inline formatting and links in Obsidian" width="900"></a>

The demo shows the floating toolbar appearing near selected text, applying inline styles, and using the link workflow while the note remains normal Markdown.

## Toolbar Close-Up

<a href="./assets/text-styling-toolbar.png"><img src="./assets/text-styling-toolbar.png" alt="Floating text styling toolbar with bold, italic, strike, highlight, inline code, math, and link actions" width="650"></a>

The toolbar appears only when a useful text selection is active. It stays compact, follows the selection, and hides when the selection is cleared or the action is complete.

## What You Can Do

- Apply or remove bold.
- Apply or remove italic.
- Apply or remove strikethrough.
- Highlight selected text.
- Format short selections as inline code.
- Wrap variables or expressions as inline math.
- Turn selected text into an Obsidian wiki link.
- Create a standard Markdown link.

## Better For Revisions

The toolbar is most useful once text already exists. Select a term and make it bold, mark a sentence for review with highlight, convert a filename to inline code, or turn a phrase into a link without moving your hands through multiple delimiter pairs.

Where possible, actions behave like toggles. If the selected text already has the requested format, using the same action removes that wrapper instead of nesting another copy.

## Portable by Design

The toolbar writes standard inline Markdown markers: bold, italic, strikethrough, highlight, inline code, inline math, wiki links, and Markdown links. Source mode, Git diffs, exports, and Obsidian without Better Edit all see normal Markdown.

## Notes And Limits

Inline code is intended for short single-line selections. For larger code samples, use a fenced code block from Markdown or slash commands.
