import { App, getIconIds, Modal, Plugin, PluginSettingTab, Setting, setIcon } from 'obsidian';
import { ImageSettings, IMAGE_DEFAULT_SETTINGS } from './features/image/settings';
import { BlocksSettings, BLOCKS_DEFAULT_SETTINGS } from './features/blocks/settings';
import {
	createCustomSlashCommand,
	SlashCommandDefinition,
	SlashCommandSettings,
	SLASH_COMMAND_DEFAULT_SETTINGS,
} from './features/slash-command/settings';
import { TextStylingSettings, TEXT_STYLING_DEFAULT_SETTINGS } from './features/text-styling/settings';
import { refreshImageDecorations } from './features/image/index';
import { refreshBlockControls } from './features/blocks/index';

export interface BetterEditSettings {
	image: ImageSettings;
	blocks: BlocksSettings;
	slashCommand: SlashCommandSettings;
	textStyling: TextStylingSettings;
}

export const DEFAULT_SETTINGS: BetterEditSettings = {
	image: IMAGE_DEFAULT_SETTINGS,
	blocks: BLOCKS_DEFAULT_SETTINGS,
	slashCommand: SLASH_COMMAND_DEFAULT_SETTINGS,
	textStyling: TEXT_STYLING_DEFAULT_SETTINGS,
};

type PluginWithSettings = Plugin & {
	settings: BetterEditSettings;
	saveSettings: () => Promise<void>;
};

export class BetterEditSettingTab extends PluginSettingTab {
	plugin: PluginWithSettings;

	constructor(app: App, plugin: PluginWithSettings) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass('be-settings-root');

		this.renderImageSection(containerEl);
		containerEl.createEl('hr', { cls: 'be-settings-divider' });
		this.renderBlocksSection(containerEl);
		containerEl.createEl('hr', { cls: 'be-settings-divider' });
		this.renderSlashCommandSection(containerEl);
		containerEl.createEl('hr', { cls: 'be-settings-divider' });
		this.renderTextStylingSection(containerEl);
	}

	// ---------------------------------------------------------------------------
	// Section builder
	// ---------------------------------------------------------------------------

	private featureSection(
		containerEl: HTMLElement,
		name: string,
		desc: string,
		getEnabled: () => boolean,
		setEnabled: (v: boolean) => Promise<void>,
		buildBody: ((el: HTMLElement) => void) | null,
	): void {
		new Setting(containerEl)
			.setName(name)
			.setDesc(desc)
			.setClass('be-settings-feature-header')
			.addToggle(toggle => toggle
				.setValue(getEnabled())
				.onChange(async (value) => {
					await setEnabled(value);
					if (bodyEl) bodyEl.toggleClass('is-disabled', !value);
				}));

		if (!buildBody) return;

		const bodyEl = containerEl.createDiv({ cls: 'be-settings-feature-body' });
		if (!getEnabled()) bodyEl.addClass('is-disabled');
		buildBody(bodyEl);
	}

	// ---------------------------------------------------------------------------
	// Image Arrangement
	// ---------------------------------------------------------------------------

	private renderImageSection(containerEl: HTMLElement): void {
		const s = () => this.plugin.settings.image;
		const save = () => this.plugin.saveSettings();

		this.featureSection(
			containerEl,
			'Image Arrangement',
			'Intercept image paste and drop to insert resizable, croppable HTML image blocks.',
			() => s().enabled,
			async (v) => { s().enabled = v; await save(); refreshImageDecorations(this.plugin.app); },
			(body) => {
				new Setting(body)
					.setName('Handle pasted images')
					.setDesc('Save pasted image data and insert image blocks.')
					.addToggle(toggle => toggle
						.setValue(s().handlePastedImages)
						.onChange(async (value) => { s().handlePastedImages = value; await save(); }));

				new Setting(body)
					.setName('Handle dropped images')
					.setDesc('Handle image drops from the file system or vault as image blocks.')
					.addToggle(toggle => toggle
						.setValue(s().handleDroppedImages)
						.onChange(async (value) => { s().handleDroppedImages = value; await save(); }));

				new Setting(body)
					.setName('Minimum image width')
					.setDesc('Smallest allowed image width when resizing (px).')
					.addText(text => text
						.setPlaceholder('80')
						.setValue(String(s().minImageWidthPx))
						.onChange(async (value) => {
							const parsed = parseInt(value.trim(), 10);
							if (Number.isNaN(parsed)) return;
							s().minImageWidthPx = Math.max(1, parsed);
							await save();
						}));

				new Setting(body)
					.setName('Minimum image height')
					.setDesc('Smallest allowed image height when resizing (px).')
					.addText(text => text
						.setPlaceholder('56')
						.setValue(String(s().minImageHeightPx))
						.onChange(async (value) => {
							const parsed = parseInt(value.trim(), 10);
							if (Number.isNaN(parsed)) return;
							s().minImageHeightPx = Math.max(1, parsed);
							await save();
						}));

				new Setting(body)
					.setName('Compact toolbar threshold')
					.setDesc('Image width (px) below which the toolbar collapses to a single button.')
					.addText(text => text
						.setPlaceholder('220')
						.setValue(String(s().compactToolbarThresholdPx))
						.onChange(async (value) => {
							const parsed = parseInt(value.trim(), 10);
							if (Number.isNaN(parsed)) return;
							s().compactToolbarThresholdPx = Math.max(1, parsed);
							await save();
						}));

				new Setting(body)
					.setName('Image corner radius')
					.setDesc('Border-radius on image corners, in pixels. Use 0 for sharp corners. Takes effect on next edit.')
					.addText(text => text
						.setPlaceholder('4')
						.setValue(String(s().imageCornerRadiusPx))
						.onChange(async (value) => {
							const parsed = parseInt(value.trim(), 10);
							if (Number.isNaN(parsed)) return;
							s().imageCornerRadiusPx = Math.max(0, parsed);
							await save();
							refreshImageDecorations(this.plugin.app);
						}));
			},
		);
	}

	// ---------------------------------------------------------------------------
	// Blocks Drag and Drop
	// ---------------------------------------------------------------------------

	private renderBlocksSection(containerEl: HTMLElement): void {
		const s = () => this.plugin.settings.blocks;
		const save = () => this.plugin.saveSettings();

		this.featureSection(
			containerEl,
			'Blocks Drag and Drop',
			'Show Notion-style drag handles and block controls in live preview.',
			() => s().enabled,
			async (v) => { s().enabled = v; await save(); refreshBlockControls(this.plugin.app); },
			(body) => {
				new Setting(body)
					.setName('Show add button')
					.setDesc('Show the plus button beside hovered blocks.')
					.addToggle(toggle => toggle
						.setValue(s().showAddButton)
						.onChange(async (value) => { s().showAddButton = value; await save(); }));

				new Setting(body)
					.setName('Enable list item drag')
					.setDesc('Allow list items to be treated as movable blocks.')
					.addToggle(toggle => toggle
						.setValue(s().enableListItemDrag)
						.onChange(async (value) => { s().enableListItemDrag = value; await save(); }));

				new Setting(body)
					.setName('Enable drag for HTML blocks')
					.setDesc('Allow complete HTML blocks to be treated as movable blocks.')
					.addToggle(toggle => toggle
						.setValue(s().enableHtmlBlockDrag)
						.onChange(async (value) => { s().enableHtmlBlockDrag = value; await save(); }));
			},
		);
	}

	// ---------------------------------------------------------------------------
	// Slash Commands
	// ---------------------------------------------------------------------------

	private renderSlashCommandSection(containerEl: HTMLElement): void {
		const s = () => this.plugin.settings.slashCommand;
		const save = () => this.plugin.saveSettings();

		this.featureSection(
			containerEl,
			'Slash Commands',
			'Quick-insert blocks and formatting via / commands.',
			() => s().enabled,
			async (v) => { s().enabled = v; await save(); },
			(body) => this.renderSlashCommandList(body),
		);
	}

	private renderSlashCommandList(containerEl: HTMLElement): void {
		containerEl.createDiv({
			cls: 'be-command-settings-note',
			text: 'Commands appear in the / menu in this exact order. Drag commands between enabled and disabled sections.',
		});

		this.renderSlashCommandZone(containerEl, true);
		this.renderSlashCommandZone(containerEl, false);

		const addButton = containerEl.createEl('button', {
			cls: 'be-command-add-button',
			text: 'Add command',
			attr: { type: 'button' },
		});
		this.plugin.registerDomEvent(addButton, 'click', async () => {
			this.plugin.settings.slashCommand.commands.push(createCustomSlashCommand());
			await this.plugin.saveSettings();
			this.display();
		});
	}

	private renderSlashCommandZone(containerEl: HTMLElement, enabled: boolean): void {
		const commands = this.plugin.settings.slashCommand.commands.filter(command => command.enabled === enabled);
		const zoneEl = containerEl.createDiv({ cls: 'be-command-zone' });
		zoneEl.createDiv({ cls: 'be-command-zone-title', text: enabled ? 'Enabled commands' : 'Disabled commands' });

		const listEl = zoneEl.createDiv({ cls: 'be-command-list' });
		listEl.setAttribute('data-command-zone-enabled', String(enabled));
		const dropLineEl = listEl.createDiv({ cls: 'be-command-drop-line' });
		let activeDropIndex: number | null = null;
		const updateDropLine = (index: number): void => {
			const rows = Array.from(listEl.querySelectorAll<HTMLElement>('.be-command-row'));
			activeDropIndex = index;
			if (rows.length === 0) {
				listEl.prepend(dropLineEl);
				dropLineEl.addClass('is-visible');
				return;
			}

			const clampedIndex = Math.max(0, Math.min(index, rows.length));
			const anchorRow = rows[clampedIndex];
			if (anchorRow === undefined) {
				listEl.appendChild(dropLineEl);
			} else {
				listEl.insertBefore(dropLineEl, anchorRow);
			}
			dropLineEl.addClass('is-visible');
		};
		const hideDropLine = (): void => {
			activeDropIndex = null;
			dropLineEl.removeClass('is-visible');
		};
		const getDropIndexFromY = (clientY: number): number => {
			const rows = Array.from(listEl.querySelectorAll<HTMLElement>('.be-command-row'));
			if (rows.length === 0) return 0;

			for (let index = 0; index < rows.length; index += 1) {
				const rect = rows[index]?.getBoundingClientRect();
				if (rect === undefined) continue;
				if (clientY < rect.top + rect.height / 2) return index;
			}

			return rows.length;
		};
		this.plugin.registerDomEvent(listEl, 'dragleave', (event: DragEvent) => {
			if (!listEl.contains(event.relatedTarget as Node | null)) hideDropLine();
		});
		this.plugin.registerDomEvent(listEl, 'dragover', (event: DragEvent) => {
			event.preventDefault();
			const index = getDropIndexFromY(event.clientY);
			updateDropLine(index);
		});
		this.plugin.registerDomEvent(listEl, 'drop', (event: DragEvent) => {
			event.preventDefault();
			const id = event.dataTransfer?.getData('text/plain') ?? '';
			const index = activeDropIndex ?? getDropIndexFromY(event.clientY);
			hideDropLine();
			void this.moveSlashCommand(id, enabled, index);
		});
		this.plugin.registerDomEvent(listEl, 'dragend', hideDropLine);

		for (const command of commands) {
			this.renderSlashCommandRow(listEl, command, enabled);
		}
	}

	private renderSlashCommandRow(
		listEl: HTMLElement,
		command: SlashCommandDefinition,
		enabled: boolean,
	): void {
		const rowEl = listEl.createDiv({ cls: 'be-command-row' });
		rowEl.setAttribute('draggable', 'true');
		rowEl.setAttribute('data-command-id', command.id);

		rowEl.createSpan({ cls: 'be-command-row-handle', text: '⠿' });
		const metaEl = rowEl.createDiv({ cls: 'be-command-row-meta' });
		metaEl.createDiv({ cls: 'be-command-row-title', text: command.name });
		metaEl.createDiv({ cls: 'be-command-row-subtitle', text: command.description });

		const actionsEl = rowEl.createDiv({ cls: 'be-command-row-actions' });
		const editButton = actionsEl.createEl('button', { text: 'Edit', attr: { type: 'button' } });
		const toggleButton = actionsEl.createEl('button', { text: enabled ? 'Disable' : 'Enable', attr: { type: 'button' } });

		this.plugin.registerDomEvent(rowEl, 'dragstart', (event: DragEvent) => {
			event.dataTransfer?.setData('text/plain', command.id);
			event.dataTransfer?.setDragImage(rowEl, 12, 12);
		});
		this.plugin.registerDomEvent(editButton, 'click', () => {
			new SlashCommandEditModal(this.app, this.plugin, command, () => this.display()).open();
		});
		this.plugin.registerDomEvent(toggleButton, 'click', async () => {
			await this.moveSlashCommand(command.id, !enabled, this.commandsInSection(!enabled).length);
		});

		if (!command.builtIn) {
			const deleteButton = actionsEl.createEl('button', { text: 'Delete', attr: { type: 'button' } });
			this.plugin.registerDomEvent(deleteButton, 'click', async () => {
				this.plugin.settings.slashCommand.commands = this.plugin.settings.slashCommand.commands.filter(item => item.id !== command.id);
				await this.plugin.saveSettings();
				this.display();
			});
		}
	}

	private commandsInSection(enabled: boolean): SlashCommandDefinition[] {
		return this.plugin.settings.slashCommand.commands.filter(command => command.enabled === enabled);
	}

	private async moveSlashCommand(commandId: string, enabled: boolean, sectionIndex: number): Promise<void> {
		const commands = this.plugin.settings.slashCommand.commands;
		const moving = commands.find(command => command.id === commandId);
		if (moving === undefined) return;

		const remaining = commands.filter(command => command.id !== commandId);
		const nextEnabled = remaining.filter(command => command.enabled);
		const nextDisabled = remaining.filter(command => !command.enabled);
		moving.enabled = enabled;

		const targetSection = enabled ? nextEnabled : nextDisabled;
		targetSection.splice(Math.max(0, Math.min(sectionIndex, targetSection.length)), 0, moving);

		this.plugin.settings.slashCommand.commands = enabled
			? [...targetSection, ...nextDisabled]
			: [...nextEnabled, ...targetSection];
		await this.plugin.saveSettings();
		this.display();
	}

	// ---------------------------------------------------------------------------
	// Text Styling
	// ---------------------------------------------------------------------------

	private renderTextStylingSection(containerEl: HTMLElement): void {
		const s = () => this.plugin.settings.textStyling;
		const save = () => this.plugin.saveSettings();

		this.featureSection(
			containerEl,
			'Text Styling',
			'Rich inline formatting shortcuts and text style controls.',
			() => s().enabled,
			async (v) => { s().enabled = v; await save(); },
			(body) => {
				body.createDiv({
					cls: 'be-command-settings-note',
					text: 'Show a floating formatting toolbar for Live Preview text selections.',
				});
			},
		);
	}
}

class SlashCommandEditModal extends Modal {
	private readonly plugin: PluginWithSettings;
	private readonly command: SlashCommandDefinition;
	private readonly onSave: () => void;

	constructor(app: App, plugin: PluginWithSettings, command: SlashCommandDefinition, onSave: () => void) {
		super(app);
		this.plugin = plugin;
		this.command = command;
		this.onSave = onSave;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('be-command-modal');
		contentEl.createEl('h2', { text: 'Edit command' });

		const nameInput = this.createTextInput('Name', this.command.name, this.command.builtIn);
		const iconInput = this.createIconSelect('Icon', this.command.icon, this.command.builtIn);
		const descriptionInput = this.createTextArea('Description', this.command.description, this.command.builtIn);
		const aliasesInput = this.createTextInput('Aliases', this.command.aliases.join(', '), false);
		const templateInput = this.createTextArea('Template', this.command.template, this.command.builtIn);
		contentEl.createDiv({
			cls: 'be-command-modal-help',
			text: 'Use {{cursor}} where the cursor should land after insertion.',
		});

		const actionsEl = contentEl.createDiv({ cls: 'be-command-modal-actions' });
		const cancelButton = actionsEl.createEl('button', { text: 'Cancel', attr: { type: 'button' } });
		const saveButton = actionsEl.createEl('button', { text: 'Save', cls: 'mod-cta', attr: { type: 'button' } });

		this.plugin.registerDomEvent(cancelButton, 'click', () => this.close());
		this.plugin.registerDomEvent(saveButton, 'click', async () => {
			if (!this.command.builtIn) {
				this.command.name = nameInput.value.trim() || 'Custom command';
				this.command.icon = iconInput.dataset.iconValue ?? this.command.icon;
				this.command.description = descriptionInput.value.trim() || 'Custom command.';
				this.command.template = templateInput.value;
			}
			this.command.aliases = aliasesInput.value
				.split(',')
				.map(alias => alias.trim())
				.filter(alias => alias.length > 0);
			await this.plugin.saveSettings();
			this.onSave();
			this.close();
		});
	}

	private createTextInput(label: string, value: string, disabled: boolean): HTMLInputElement {
		const rowEl = this.contentEl.createDiv({ cls: 'be-command-modal-field' });
		rowEl.toggleClass('is-disabled', disabled);
		rowEl.createEl('label', { text: label });
		const inputEl = rowEl.createEl('input', { attr: { type: 'text' } });
		inputEl.value = value;
		inputEl.disabled = disabled;
		return inputEl;
	}

	private createTextArea(label: string, value: string, disabled: boolean): HTMLTextAreaElement {
		const rowEl = this.contentEl.createDiv({ cls: 'be-command-modal-field' });
		rowEl.toggleClass('is-disabled', disabled);
		rowEl.createEl('label', { text: label });
		const inputEl = rowEl.createEl('textarea');
		inputEl.value = value;
		inputEl.disabled = disabled;
		return inputEl;
	}

	private createIconSelect(label: string, value: string, disabled: boolean): HTMLButtonElement {
		const rowEl = this.contentEl.createDiv({ cls: 'be-command-modal-field' });
		rowEl.toggleClass('is-disabled', disabled);
		rowEl.createEl('label', { text: label });

		const controlEl = rowEl.createDiv({ cls: 'be-command-modal-icon-control' });
		const buttonEl = controlEl.createEl('button', { cls: 'mod-muted be-command-modal-icon-button', attr: { type: 'button' } });
		const iconSlot = buttonEl.createSpan({ cls: 'be-command-modal-icon-slot' });
		setIcon(iconSlot, value);
		buttonEl.setAttribute('aria-label', value);
		buttonEl.setAttribute('title', 'Choose icon');
		buttonEl.disabled = disabled;
		buttonEl.dataset.iconValue = value;
		this.plugin.registerDomEvent(buttonEl, 'click', (event: MouseEvent) => {
			if (disabled) return;
			event.preventDefault();
			new SlashIconPickerModal(this.app, value, (icon) => {
				iconSlot.empty();
				setIcon(iconSlot, icon);
				buttonEl.dataset.iconValue = icon;
				buttonEl.setAttribute('aria-label', icon);
			}).open();
		});
		return buttonEl;
	}
}

class SlashIconPickerModal extends Modal {
	private readonly onPick: (icon: string) => void;
	private readonly initialValue: string;
	private searchInput!: HTMLInputElement;
	private listEl!: HTMLElement;

	constructor(app: App, initialValue: string, onPick: (icon: string) => void) {
		super(app);
		this.initialValue = initialValue;
		this.onPick = onPick;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('be-icon-picker-modal');
		contentEl.createEl('h2', { text: 'Choose icon' });
		this.searchInput = contentEl.createEl('input', { attr: { type: 'search', placeholder: 'Search icons' } });
		this.listEl = contentEl.createDiv({ cls: 'be-icon-picker-grid' });
		this.searchInput.addEventListener('input', () => this.renderIcons());
		this.renderIcons();
	}

	private renderIcons(): void {
		this.listEl.empty();
		const query = this.searchInput.value.trim().toLowerCase();
		const icons = getIconIds().filter(icon => query.length === 0 || icon.toLowerCase().includes(query)).slice(0, 400);
		for (const icon of icons) {
			const button = this.listEl.createEl('button', { cls: 'be-icon-picker-item', attr: { type: 'button' } });
			button.toggleClass('is-selected', icon === this.initialValue);
			const iconSlot = button.createSpan({ cls: 'be-icon-picker-item-icon' });
			setIcon(iconSlot, icon);
			button.setAttribute('aria-label', icon);
			button.addEventListener('click', () => {
				this.onPick(icon);
				this.close();
			});
		}
	}
}
