# Slash Commands

Slash commands provide a fast menu for common Markdown blocks, Better Edit templates, and Obsidian command actions. Users type `/` at a valid insertion point, choose a command, and Better Edit either inserts a Markdown/HTML template or executes a registered Obsidian command.

![Slash command menu in Obsidian](./assets/slash-command-menu.png)

## What users see

Typical workflow:

1. Start on a fresh line in Live Preview.
2. Type `/`.
3. A command menu opens near the cursor.
4. Search or choose an item such as Heading 1, Bullet list, Checkbox, Quote, Code block, Math block, Image, or Divider.
5. Better Edit runs the selected action.

For template actions, Better Edit replaces the slash trigger with the selected block template and places the cursor where the user should continue typing. For execute-command actions, Better Edit clears the slash trigger and runs the selected Obsidian command without inserting template content.

The menu uses readable command names, icons, and a short right-side hint for the Markdown shape that will be inserted.

## Sub-features

### Command menu

The command menu is the main slash-command surface. It is designed to feel like a native Obsidian menu:

- opens near the editor cursor;
- supports keyboard selection;
- highlights the active item;
- closes when the user chooses a command or presses Escape;
- avoids covering more of the note than needed.

### Built-in block commands

The first-release command set covers common Markdown structures:

- **Heading 1** inserts `# {{cursor}}`.
- **Heading 2** inserts `## {{cursor}}`.
- **Heading 3** inserts `### {{cursor}}`.
- **Bullet list** starts an unordered list.
- **Numbered list** starts an ordered list.
- **Checkbox** starts a task item.
- **Quote** inserts a blockquote.
- **Code block** inserts a fenced code block.
- **Math block** inserts a display math block.
- **Image placeholder** inserts a Better Edit image placeholder HTML block.
- **Divider** inserts a horizontal rule.

The image placeholder command is especially useful because it connects slash commands to the image arrangement feature: `/image` can create a visible slot now, and the user can fill it later.

### Search and filtering

Users can narrow the command list by typing after the slash trigger. For example, typing `/head` focuses heading-related commands, and typing `/check` makes the checkbox command easy to choose.

Search matches command names and aliases, so users can keep commands discoverable even when they prefer short names.

### Keyboard flow

Slash commands are intended to support writing without leaving the keyboard:

- Arrow keys move through results.
- Enter inserts or executes the selected command.
- Escape closes the menu.
- The cursor returns to the inserted block's editable position when a template is inserted.

### Custom commands

Users can enable, disable, reorder, and customize slash commands in Better Edit settings. Custom commands support two action modes.

#### Insert template

Insert template writes configured Markdown or HTML text. Users can include `{{cursor}}` to control where the cursor lands after insertion.

Examples of useful custom commands:

- a meeting-note template;
- a lab-note section;
- a reading-note scaffold;
- a reusable callout or warning block;
- a project-status checklist;
- a custom HTML image/layout snippet that remains portable.

#### Execute command

Execute command lets a slash command call any registered Obsidian command, including commands from Obsidian core or other enabled plugins.

The edit-command modal separates the action configuration into two tabs:

- **Insert template** keeps the template textarea and cursor-token behavior.
- **Execute command** provides a searchable input for available Obsidian commands.

When a slash command is configured as Execute command, Better Edit only executes the selected command. It does not insert a template, apply `{{cursor}}`, or perform any Better Edit-specific text transformation after the command runs.

### Context boundaries

Slash commands are intended for normal block insertion in Live Preview. V1 intentionally avoids promising every command in every Markdown context, such as table cells, where many block-level outputs would produce invalid or surprising Markdown.

## Native-note promise

Template commands insert plain Markdown or visible HTML snippets. Execute-command entries delegate to registered Obsidian commands. Better Edit does not add proprietary storage for slash-command output.
