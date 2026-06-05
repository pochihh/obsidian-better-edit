# Feature 03 - Slash Command

## Status

| Area | Status |
|---|---|
| Command data model | Supports template and execute-command actions |
| Built-in command seed list | First pass |
| Custom command settings | Action tabs for Insert template / Execute command |
| Slash menu UI | First pass |
| Empty-line hint | First pass |
| Explicit trigger model | First pass |
| Table / code / math suppression | First pass |
| Image-specific import behavior | Later, owned by Image Arrangement |

---

## Goal

Provide a `/` menu for inserting reusable Markdown/HTML templates or executing
registered Obsidian commands without adding custom syntax to notes.

The important design constraint is that built-in and user-created commands use the
same command structure. Built-ins are just seeded commands with protected identity.

---

## Command Model

```ts
interface SlashCommandDefinition {
  id: string;
  builtIn: boolean;
  enabled: boolean;
  name: string;
  icon: string;
  description: string;
  aliases: string[];
  actionType: 'insert-template' | 'execute-command';
  template: string;
  commandId: string;
}
```

Rules:

- `id` is stable identity only. It does not control menu order.
- `commands[]` array order is the exact `/` menu order.
- `enabled: true` commands appear in the menu.
- `enabled: false` commands stay in settings but do not appear in the menu.
- `builtIn: true` commands cannot be deleted.
- Built-in aliases can be customized.
- Built-in icon and description are fixed.
- Custom commands can edit name, icon, description, aliases, and action.

Templates may include `{{cursor}}` to control cursor placement after insertion.
If omitted, the cursor lands at the end of the inserted template.

Action rules:

- `insert-template` replaces the slash query line with `template` and applies
  `{{cursor}}` cursor placement.
- `execute-command` removes the slash query line and calls the selected
  registered Obsidian command by `commandId`.
- `execute-command` does not insert `template`, does not apply `{{cursor}}`, and
  does not run any additional Better Edit transformation after dispatching the
  Obsidian command.
- The command picker should list commands registered with Obsidian, including
  core commands and commands registered by enabled community plugins.

---

## Trigger Behavior

- Show `Press '/' for commands` on a focused empty line.
- Open the menu only when a fresh `/` is typed at the beginning of a line.
- If the line already contains content and the caret is at column `0`, typing `/`
  creates a new slash-command line above that content instead of deleting or
  replacing the original line.
- Typing `/` anywhere else behaves like normal text input.
- Search matches command name and aliases.
- `Enter` inserts the selected command.
- `Escape` closes the menu and disarms that line, so merely focusing the same
  `/...` line later does not reopen the menu.
- Arrow up/down changes the selected command.
- Clicking outside closes the menu.
- Suppress the menu and empty-line hint inside fenced code blocks, math blocks,
  and table editing contexts.

The slash query line is fully replaced by the selected template for
`insert-template` commands. For `execute-command` commands, the query line is
cleared before the selected Obsidian command is executed.

---

## Built-In Commands

No text command is included.

| Command | Aliases | Template |
|---|---|---|
| Heading 1 | `h1`, `title` | `# {{cursor}}` |
| Heading 2 | `h2`, `section` | `## {{cursor}}` |
| Heading 3 | `h3`, `subsection` | `### {{cursor}}` |
| Bullet list | `ul`, `bullet` | `- {{cursor}}` |
| Numbered list | `ol`, `number` | `1. {{cursor}}` |
| Checkbox | `todo`, `task` | `- [ ] {{cursor}}` |
| Quote | `blockquote` | `> {{cursor}}` |
| Code block | `code`, `fence` | fenced block with cursor inside |
| Math block | `math`, `latex`, `formula`, `equation` | `$$ ... $$` with cursor inside |
| Image | `img`, `media`, `picture` | Better Edit image placeholder HTML block |
| Divider | `hr`, `line` | `---` plus trailing newline |

Image-specific import behavior is not part of this feature. Users can create a
custom command with an image placeholder template, while the Image Arrangement
feature owns click-to-import behavior for placeholders.

---

## Settings UI

Settings contain two command lists:

- Enabled commands
- Disabled commands

Users can:

- Drag commands to reorder them.
- Drag commands between enabled and disabled sections.
- Add custom commands.
- Delete custom commands.
- Edit built-in aliases.
- Edit custom name, icon, description, aliases, and action.

Custom command action editing uses two tabs:

- **Insert template**: existing template textarea and `{{cursor}}` behavior.
- **Execute command**: searchable input for available registered Obsidian
  commands. Saving stores the selected command ID.

The enabled list order is the menu order.

## Menu Behavior

- The command list order is exactly the user-configured enabled-command order.
- The selected row should be visible during keyboard navigation.
- Mouse hover and keyboard navigation share one selected item model.
- The settings drag-and-drop list uses the same insertion-preview idea as block
  drag and drop.
