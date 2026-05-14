# obsidian-better-edit - Design Document

## Overview

`obsidian-better-edit` is a Notion-inspired editing layer for Obsidian Live Preview.
It improves image editing, block movement, slash insertion, and text formatting
without making notes depend on proprietary plugin syntax.

## Feature Status

| # | Feature | Status | Detail |
|---|---|---|---|
| 01 | Image Arrangement | Partially complete | `docs/features/image.md` |
| 02 | Blocks Drag and Drop | In progress | `docs/features/blocks.md` |
| 03 | Slash Command | In progress | `docs/features/slash-command.md` |
| 04 | Text Styling | In progress | `docs/features/text-styling.md` |

Current implementation focus: image arrangement and block drag-and-drop.

## Core Principles

### Native-first files

The `.md` file must remain useful without the plugin installed. The plugin may add
editing affordances, but content should still render as standard Markdown or
standard HTML in Obsidian, GitHub, VS Code, or another Markdown renderer.

### No proprietary content syntax

The plugin should not introduce custom fenced block types, hidden frontmatter state,
or file formats that only this plugin can understand. Better Edit image blocks use
standard HTML plus `data-better-edit-image` metadata and degrade to visible HTML.

### Source mode stays honest

Live Preview may show interactive widgets. Source mode should always expose the
real Markdown/HTML that is stored in the file.

### Conservative editing

When block boundaries, HTML, lists, or Markdown edge cases are ambiguous, prefer a
safe fallback over a clever move that can corrupt document structure.

### Theme-native UI

Editing affordances should fit Obsidian and community themes. Prefer Obsidian CSS
variables over hardcoded colors, shadows, or surfaces.

## Architecture

Each major feature lives under `src/features/<feature>/` and owns its own settings,
CodeMirror extension, DOM events, feature-specific helpers, and feature-local CSS.

Shared UI primitives that are reused across features, such as toolbar buttons or
replace-panel shells, live under `src/styles/`. The root `styles.css` remains the
single Obsidian entrypoint and should only import shared and feature stylesheets.

```
src/
  main.ts
  settings.ts
  styles/
    shared.css
    settings.css
  features/
    image/
      styles.css
    blocks/
      styles.css
    slash-command/
      styles.css
    text-styling/
      styles.css
```

`main.ts` should stay lifecycle-focused: load settings, register feature extensions,
and add the setting tab. Feature logic belongs in feature modules.

## Current Feature Docs

### Image Arrangement

Detailed design: `docs/features/image.md`

Implemented areas include paste/drop handling, Live Preview widgets, resize,
alignment, captions, crop/circle crop, replace, alt text, copy, duplicate, and
delete actions. Future work includes modular action registry cleanup and
multi-image flex rows.

### Blocks Drag and Drop

Detailed design: `docs/features/blocks.md`

Current scope is vertical-only block movement in Live Preview. It supports
single-block drag, selected multi-block drag, block handles, add-button insertion,
theme-native selection/drop visuals, markdown-safe drops, native image embeds,
HTML blocks, fenced code blocks, blockquotes, tables, headings, horizontal rules,
and nested list movement.

### Slash Command

Detailed design: `docs/features/slash-command.md`

Current scope is a customizable `/` menu backed by one reusable command structure
for built-in and custom template commands.

### Text Styling

Detailed design: `docs/features/text-styling.md`

Current scope is a Live Preview selection toolbar that writes native Markdown
inline formatting syntax.

## Integration Points

| Scenario | Features |
|---|---|
| Paste/drop image into note | Image Arrangement |
| Drag Better Edit image block | Image Arrangement + Blocks Drag and Drop |
| Drag native `![[image]]` block | Blocks Drag and Drop |
| Insert image placeholder from slash menu | Slash Command + Image Arrangement |
| Add block below/above from hover control | Blocks Drag and Drop |
| Format selected text | Text Styling |

## Technical Notes

| Concern | Approach |
|---|---|
| Language | TypeScript |
| Editor API | CodeMirror 6 through Obsidian |
| Feature settings | `src/settings.ts` plus per-feature settings modules |
| Build | `npm run build` |
| Lint | `npm run lint` or targeted ESLint during active work |
| Testing | Manual Obsidian vault testing for UI; pure tests should be added for parsing logic |

## Documentation Policy

Keep this file as the short product and architecture overview. Detailed behavior,
edge cases, and UI decisions belong in feature docs under `docs/features/`.
