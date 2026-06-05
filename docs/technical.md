# Technical Notes

This document covers implementation structure, build-time conventions, and
project-level technical decisions that do not belong in the product design docs.

## Architecture

Better Edit keeps feature logic under `src/features/<feature>/`. Each feature is
responsible for its own CodeMirror extensions, Obsidian integration, settings,
and feature-local styling.

```
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

`main.ts` should stay lifecycle-focused: load settings, register feature
extensions, and add the setting tab.

## CSS structure

The plugin must ship a single root `styles.css` file because that is the
artifact Obsidian loads for plugin styling.

Source CSS is split by ownership:

- `src/features/<feature>/styles.css` for feature-local rules
- `src/styles/shared.css` for shared UI primitives
- `src/styles/settings.css` for the setting tab layout

The root `styles.css` is generated from those source files and should not be
edited directly.

## CSS build flow

The build script `scripts/build-styles.mjs` concatenates the source CSS files
into the root `styles.css`.

Package scripts:

- `npm run styles:build` regenerates `styles.css`
- `npm run dev` regenerates `styles.css` before starting the JS build watch
- `npm run build` regenerates `styles.css` before the production build

This avoids relying on runtime `@import` inside plugin CSS, which is not a
reliable delivery mechanism for Obsidian plugin styles.

## Runtime data

The plugin uses Obsidian's `loadData()` and `saveData()` APIs for persisted
settings. The resulting local runtime file is `data.json`, which should remain
gitignored.

Defaults and schema shape belong in TypeScript settings modules, not in
committed runtime data files.

## Documentation split

Use the docs this way:

- `README.md`: short public project entrypoint
- `docs/feature_list/`: user-facing feature explanations
- `docs/feature_list/assets/`: actual Obsidian screenshots used by the feature list
- `docs/technical_notes/project-architecture.md`: design principles and cross-feature architecture
- `docs/technical_notes/`: detailed implementation notes and edge cases
- `docs/technical.md`: implementation structure and build conventions
- `docs/guidelines.md`: development rules and lint/API guidance

Historical long-form feature implementation docs were moved from `docs/features/`
to `docs/technical_notes/` so the public feature list can stay product-facing.
The original `DESIGN.md` implementation plan has been extracted into technical notes and removed.
