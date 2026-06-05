# Project Architecture and Design Principles

This note preserves the useful implementation guidance from the original historical `DESIGN.md` plan. It is technical reference, not a release roadmap.

## Product intent

Better Edit is a Notion-inspired editing layer for Obsidian Live Preview. Its purpose is to improve common editing interactions — image arrangement, block controls, slash insertion, text formatting, and symbol insertion — while keeping notes useful without the plugin installed.

## Core principles

### Native-first files

Markdown files must remain readable and useful without Better Edit. The plugin can add editing affordances in Live Preview, but stored content should still render as standard Markdown or visible HTML in Obsidian, GitHub, VS Code, or another Markdown renderer.

### No proprietary content syntax

Do not introduce custom fenced block types, hidden frontmatter state, or plugin-only file formats for normal user content. When metadata is needed, prefer visible standard HTML that degrades reasonably without the plugin, such as Better Edit image HTML using `data-better-edit-image` attributes.

### Source mode stays honest

Live Preview can render interactive widgets. Source mode should always expose the actual Markdown or HTML stored in the file.

### Conservative editing

When block boundaries, HTML, lists, or Markdown edge cases are ambiguous, prefer a safe fallback over a clever transformation that could corrupt document structure. This especially applies to block movement and Turn into conversions.

### Theme-native UI

Editing affordances should fit Obsidian and community themes. Prefer Obsidian CSS variables over hardcoded colors, shadows, or surfaces.

## Architecture conventions

Each major feature lives under `src/features/<feature>/` and owns its CodeMirror extension, Obsidian integration, settings helpers, feature-specific utilities, and feature-local CSS.

Shared UI primitives that are reused across features live under `src/styles/`. The root `styles.css` remains the single Obsidian stylesheet entrypoint and is generated from source CSS.

```text
src/
  main.ts
  settings.ts
  styles/
    shared.css
    settings.css
  features/
    blocks/
      index.ts
      settings.ts
      styles.css
    image/
      index.ts
      settings.ts
      styles.css
    slash-command/
      index.ts
      settings.ts
      styles.css
    symbol-picker/
      index.ts
      settings.ts
      styles.css
    text-styling/
      index.ts
      settings.ts
      styles.css
```

`main.ts` should stay lifecycle-focused: load settings, register feature extensions, and add the setting tab. Feature logic belongs in feature modules.

## Cross-feature integration points

| Scenario | Primary features |
|---|---|
| Paste or drop image into note | Image Arrangement |
| Drag Better Edit image block | Image Arrangement + Block Controls |
| Drag native `![[image]]` block | Block Controls |
| Insert image placeholder from slash menu | Slash Commands + Image Arrangement |
| Add a block near the current block | Block Controls + Slash Commands |
| Format selected text | Text Styling |
| Insert symbols or emoji at the cursor | Symbol and Emoji Picker |

## Technical baseline

| Concern | Approach |
|---|---|
| Language | TypeScript |
| Editor API | CodeMirror 6 through Obsidian |
| Settings | `src/settings.ts` plus per-feature settings modules |
| Styles | Source CSS under `src/`; generated root `styles.css` |
| Build | `npm run build` |
| Lint | `npm run lint` |
| Release gate | `npm run check` |
| Testing | Local regression pass before release |

## Documentation ownership

- `README.md`: short public entrypoint.
- `docs/feature_list/`: user-facing feature explanations.
- `docs/feature_list/assets/`: actual Obsidian screenshots used by the feature list.
- `docs/technical.md`: project-level implementation structure and build conventions.
- `docs/technical_notes/`: detailed technical behavior, edge cases, and historical design rationale.
- `docs/guidelines.md`: development rules and Obsidian API guidance.
