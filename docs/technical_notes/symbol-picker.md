# Feature 05 - Symbol Picker

## Status

| Area | Status |
|---|---|
| Picker panel | First pass |
| Math symbol set | First pass |
| Emoji set | First pass |
| Recent history | First pass |
| Context-menu entry | First pass |
| Plugin-managed shortcut | First pass |
| Obsidian command entry | First pass |

---

## Goal

Provide a fast insertion panel for math symbols, Greek letters, arrows, and
emoji without leaving the editor.

---

## Entry Points

- Editor context menu: `Insert symbol or emoji`
- Plugin-managed keyboard shortcut
- Obsidian command: `Insert symbol or emoji`

The plugin-managed shortcut is separate from Obsidian Hotkeys so the plugin can
ship a default shortcut without occupying an Obsidian command hotkey.

---

## Panel Behavior

- Opens near the active editor
- Starts on the math tab by default
- Includes a search field
- Includes a recent-history section
- Supports tab switching between `Math` and `Emoji`
- Inserts directly at the current cursor position

---

## Settings

The settings section currently exposes:

- master feature toggle
- right-click menu toggle
- plugin-managed shortcut toggle
- shortcut recorder badge
- reset-to-default shortcut button
- Obsidian command toggle

Shortcut settings are stored as:

```ts
interface ShortcutDef {
  modKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  key: string;
}
```

On macOS, `modKey` means `⌘`. On Windows/Linux, it means `Ctrl`.

---

## Future Work

- keyboard navigation inside the picker panel
- category filtering beyond math / emoji
- richer emoji browsing
- automated tests for shortcut matching and history updates
