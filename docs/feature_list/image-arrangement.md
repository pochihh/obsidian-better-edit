# Image Arrangement

Image arrangement provides direct image editing controls in Live Preview so users can work with images visually instead of repeatedly editing Markdown or HTML by hand.

![Image toolbar and overflow menu in Obsidian](./assets/image-toolbar-menu.png)

## What users see

When Better Edit recognizes an image block, it adds a compact floating toolbar near the image. The toolbar exposes the most common image actions directly and keeps secondary actions in an overflow menu.

Typical workflow:

1. Paste, drop, or insert an image in a note.
2. Click or hover the image to reveal Better Edit controls.
3. Use the toolbar to resize, align, crop, caption, replace, or organize the image.
4. Continue writing; the image remains part of the normal note content.

## Sub-features

### Image placeholders

Better Edit can show an **Add an image** placeholder for image insertion points. This gives users a visible target for adding an image without needing to remember Markdown image syntax.

The placeholder is useful when:

- a slash command inserts an image slot;
- a user wants a visual drop/click target;
- a note layout needs images added later.

### Resize handles

Images can be resized visually. Better Edit updates the rendered image size while preserving the image as note content rather than storing layout in a hidden project database.

Expected behavior:

- resizing should feel immediate in Live Preview;
- the visible image updates in place;
- the saved note remains inspectable and portable.

### Alignment controls

The toolbar supports common alignment choices:

- **Align left** for text-leading or narrow images;
- **Align center** for standalone figures;
- **Align right** for side-positioned images when the note layout supports it.

The overflow menu shows the current alignment with a checkmark, so users can see which alignment is active.

### Caption

The caption action lets users add or edit descriptive text attached to an image. Captions are intended for screenshots, diagrams, research images, and visual examples where the image needs context.

Captions should stay visible and understandable even if Better Edit is disabled.

### Crop

The crop action opens a focused editing workflow for changing the visible region of an image. This is meant for quick screenshot cleanup and visual note polish without leaving Obsidian.

### Replace

Replace lets users keep the image block and its layout/caption context while swapping the underlying image source. This is useful when replacing a draft screenshot with a final screenshot.

### Alt text

Alt text gives the image a text description for accessibility and for readers who inspect the raw note. Better Edit should treat alt text as first-class image metadata, not only as visual decoration.

### Copy, duplicate, and delete

The overflow menu includes maintenance actions:

- **Copy** copies the image block or source reference.
- **Duplicate** creates another copy of the image block.
- **Delete** removes the image block from the note.

These actions are grouped away from the main toolbar so the most common layout controls stay visible without making the toolbar too dense.

### Add to row

Add to row helps arrange multiple images side by side. It is intended for screenshot comparisons, before/after examples, and visual research notes where images should be scanned together.

### Compact toolbar behavior

When an image or pane is narrow, Better Edit collapses less-common controls into a compact menu instead of letting a dense toolbar overflow. The main toolbar should stay usable even on smaller panes.

## Native-note promise

Better Edit stores image state in standard Markdown image syntax or visible HTML image blocks. HTML image blocks may include Better Edit data attributes and inline styles so the plugin can reopen the editing controls, but the image remains visible without Better Edit.
