# Feature 03 - Slash Command

## Status

| Area | Status |
|---|---|
| Command data model | First pass |
| Built-in command seed list | First pass |
| Custom command settings | First pass |
| Slash menu UI | First pass |
| Empty-line hint | First pass |
| Image-specific import behavior | Later, owned by Image Arrangement |

---

## Goal

Provide a `/` menu for inserting reusable Markdown/HTML templates without adding
custom syntax to notes.

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
  aliases: string[];
  template: string;
}
```

Rules:

- `id` is stable identity only. It does not control menu order.
- `commands[]` array order is the exact `/` menu order.
- `enabled: true` commands appear in the menu.
- `enabled: false` commands stay in settings but do not appear in the menu.
- `builtIn: true` commands cannot be deleted.
- Built-in aliases can be customized.
- Custom commands can edit name, aliases, and template.

Templates may include `{{cursor}}` to control cursor placement after insertion.
If omitted, the cursor lands at the end of the inserted template.

---

## Trigger Behavior

- Show `Press '/' for commands` on a focused empty line.
- Open the menu when `/` is typed on an empty line.
- Leave list item behavior alone in the first pass.
- Search matches command name and aliases.
- `Enter` inserts the selected command.
- `Escape` closes the menu.
- Arrow up/down changes the selected command.
- Clicking outside closes the menu.

The slash query line is fully replaced by the selected command template.

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
| Divider | `hr`, `line` | `---` |

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
- Edit custom name, aliases, and template.

The enabled list order is the menu order.
