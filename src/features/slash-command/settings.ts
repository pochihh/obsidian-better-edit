export interface SlashCommandSettings {
	enabled: boolean;
	commands: SlashCommandDefinition[];
}

export interface SlashCommandDefinition {
	id: string;
	builtIn: boolean;
	enabled: boolean;
	name: string;
	icon: string;
	description: string;
	aliases: string[];
	template: string;
}

export const SLASH_CURSOR_TOKEN = '{{cursor}}';

export const DEFAULT_SLASH_COMMANDS: SlashCommandDefinition[] = [
	{
		id: 'heading-1',
		builtIn: true,
		enabled: true,
		name: 'Heading 1',
		icon: 'heading-1',
		description: 'Large section heading.',
		aliases: ['h1', 'title'],
		template: `# ${SLASH_CURSOR_TOKEN}`,
	},
	{
		id: 'heading-2',
		builtIn: true,
		enabled: true,
		name: 'Heading 2',
		icon: 'heading-2',
		description: 'Medium section heading.',
		aliases: ['h2', 'section'],
		template: `## ${SLASH_CURSOR_TOKEN}`,
	},
	{
		id: 'heading-3',
		builtIn: true,
		enabled: true,
		name: 'Heading 3',
		icon: 'heading-3',
		description: 'Small section heading.',
		aliases: ['h3', 'subsection'],
		template: `### ${SLASH_CURSOR_TOKEN}`,
	},
	{
		id: 'bullet-list',
		builtIn: true,
		enabled: true,
		name: 'Bullet list',
		icon: 'list',
		description: 'Start an unordered list item.',
		aliases: ['ul', 'bullet'],
		template: `- ${SLASH_CURSOR_TOKEN}`,
	},
	{
		id: 'numbered-list',
		builtIn: true,
		enabled: true,
		name: 'Numbered list',
		icon: 'list-ordered',
		description: 'Start an ordered list item.',
		aliases: ['ol', 'number'],
		template: `1. ${SLASH_CURSOR_TOKEN}`,
	},
	{
		id: 'checkbox',
		builtIn: true,
		enabled: true,
		name: 'Checkbox',
		icon: 'check-square',
		description: 'Start a task list item.',
		aliases: ['todo', 'task'],
		template: `- [ ] ${SLASH_CURSOR_TOKEN}`,
	},
	{
		id: 'quote',
		builtIn: true,
		enabled: true,
		name: 'Quote',
		icon: 'quote',
		description: 'Insert a block quote.',
		aliases: ['blockquote'],
		template: `> ${SLASH_CURSOR_TOKEN}`,
	},
	{
		id: 'code-block',
		builtIn: true,
		enabled: true,
		name: 'Code block',
		icon: 'code',
		description: 'Insert a fenced code block.',
		aliases: ['code', 'fence'],
		template: `\`\`\`\n${SLASH_CURSOR_TOKEN}\n\`\`\``,
	},
	{
		id: 'math-block',
		builtIn: true,
		enabled: true,
		name: 'Math block',
		icon: 'sigma-square',
		description: 'Insert a block math formula.',
		aliases: ['math', 'latex', 'formula', 'equation'],
		template: `$$\n${SLASH_CURSOR_TOKEN}\n$$`,
	},
	{
		id: 'image',
		builtIn: true,
		enabled: true,
		name: 'Image',
		icon: 'image',
		description: 'Insert an image placeholder block.',
		aliases: ['img', 'media', 'picture'],
		template: `<div data-better-edit-image="placeholder" style="border: 2px dashed #ccc; border-radius: 4px; padding: 32px 16px; text-align: center; color: #999; font-size: 0.9em; min-height: 80px;">\n  Paste or drop an image here\n</div>\n`,
	},
	{
		id: 'divider',
		builtIn: true,
		enabled: true,
		name: 'Divider',
		icon: 'minus',
		description: 'Insert a horizontal divider.',
		aliases: ['hr', 'line'],
		template: '---\n',
	},
];

export const SLASH_COMMAND_DEFAULT_SETTINGS: SlashCommandSettings = {
	enabled: true,
	commands: DEFAULT_SLASH_COMMANDS,
};

export function normalizeSlashCommandSettings(raw: Partial<SlashCommandSettings> | undefined): SlashCommandSettings {
	const commands = Array.isArray(raw?.commands)
		? mergeCommandSettings(raw.commands)
		: DEFAULT_SLASH_COMMANDS.map(command => ({ ...command, aliases: [...command.aliases] }));

	return {
		enabled: raw?.enabled ?? SLASH_COMMAND_DEFAULT_SETTINGS.enabled,
		commands,
	};
}

export function createCustomSlashCommand(): SlashCommandDefinition {
	return {
		id: `custom-${Date.now()}`,
		builtIn: false,
		enabled: true,
		name: 'Custom command',
		icon: 'sparkles',
		description: 'Custom command.',
		aliases: [],
		template: SLASH_CURSOR_TOKEN,
	};
}

function mergeCommandSettings(rawCommands: SlashCommandDefinition[]): SlashCommandDefinition[] {
	const defaultsById = new Map(DEFAULT_SLASH_COMMANDS.map(command => [command.id, command]));
	const seen = new Set<string>();
	const merged: SlashCommandDefinition[] = [];

	for (const raw of rawCommands) {
		if (!isValidCommand(raw)) continue;
		const builtIn = defaultsById.get(raw.id);
		seen.add(raw.id);
		merged.push(builtIn ? mergeBuiltInCommand(builtIn, raw) : normalizeCustomCommand(raw));
	}

	for (const command of DEFAULT_SLASH_COMMANDS) {
		if (seen.has(command.id)) continue;
		merged.push({ ...command, aliases: [...command.aliases] });
	}

	return merged;
}

function mergeBuiltInCommand(defaultCommand: SlashCommandDefinition, raw: SlashCommandDefinition): SlashCommandDefinition {
	return {
		...defaultCommand,
		enabled: raw.enabled,
		aliases: Array.isArray(raw.aliases) ? raw.aliases.filter(alias => alias.trim().length > 0) : [...defaultCommand.aliases],
	};
}

function normalizeCustomCommand(raw: SlashCommandDefinition): SlashCommandDefinition {
	return {
		id: raw.id,
		builtIn: false,
		enabled: raw.enabled,
		name: raw.name,
		icon: typeof raw.icon === 'string' && raw.icon.trim().length > 0 ? raw.icon : 'sparkles',
		description: typeof raw.description === 'string' && raw.description.trim().length > 0 ? raw.description : 'Custom command.',
		aliases: Array.isArray(raw.aliases) ? raw.aliases.filter(alias => alias.trim().length > 0) : [],
		template: raw.template,
	};
}

function isValidCommand(command: SlashCommandDefinition): boolean {
	return (
		typeof command.id === 'string' &&
		typeof command.name === 'string' &&
		typeof command.enabled === 'boolean' &&
		typeof command.template === 'string'
	);
}
