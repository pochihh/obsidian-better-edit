import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';

export interface BetterEditSettings {
	// Image arrangement
	imageArrangementEnabled: boolean;
	handlePastedImages: boolean;
	handleDroppedImages: boolean;
	defaultImageWidth: string;
	defaultImageAlignment: 'left' | 'center' | 'right';
	minImageWidthPx: number;
	minImageHeightPx: number;
}

export const DEFAULT_SETTINGS: BetterEditSettings = {
	imageArrangementEnabled: true,
	handlePastedImages: true,
	handleDroppedImages: true,
	defaultImageWidth: '100%',
	defaultImageAlignment: 'center',
	minImageWidthPx: 80,
	minImageHeightPx: 56,
};

export class BetterEditSettingTab extends PluginSettingTab {
	plugin: Plugin;

	constructor(app: App, plugin: Plugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Image arrangement')
			.setHeading();

		new Setting(containerEl)
			.setName('Enable image arrangement')
			.setDesc('Intercept image paste and drop to insert rich HTML image blocks.')
			.addToggle(toggle => toggle
				.setValue((this.plugin as unknown as { settings: BetterEditSettings }).settings.imageArrangementEnabled)
				.onChange(async (value) => {
					(this.plugin as unknown as { settings: BetterEditSettings }).settings.imageArrangementEnabled = value;
					await (this.plugin as unknown as { saveSettings: () => Promise<void> }).saveSettings();
				}));

		new Setting(containerEl)
			.setName('Handle pasted images')
			.setDesc('Save pasted image data and insert better edit HTML image blocks.')
			.addToggle(toggle => toggle
				.setValue((this.plugin as unknown as { settings: BetterEditSettings }).settings.handlePastedImages)
				.onChange(async (value) => {
					(this.plugin as unknown as { settings: BetterEditSettings }).settings.handlePastedImages = value;
					await (this.plugin as unknown as { saveSettings: () => Promise<void> }).saveSettings();
				}));

		new Setting(containerEl)
			.setName('Handle dropped images')
			.setDesc('Handle image drops from the file system or vault as better edit HTML image blocks.')
			.addToggle(toggle => toggle
				.setValue((this.plugin as unknown as { settings: BetterEditSettings }).settings.handleDroppedImages)
				.onChange(async (value) => {
					(this.plugin as unknown as { settings: BetterEditSettings }).settings.handleDroppedImages = value;
					await (this.plugin as unknown as { saveSettings: () => Promise<void> }).saveSettings();
				}));

		new Setting(containerEl)
			.setName('Minimum image width')
			.setDesc('Smallest allowed image width when resizing, in pixels.')
			.addText(text => text
				.setPlaceholder('80')
				.setValue(String((this.plugin as unknown as { settings: BetterEditSettings }).settings.minImageWidthPx))
				.onChange(async (value) => {
					const parsed = parseInt(value.trim(), 10);
					if (Number.isNaN(parsed)) return;
					(this.plugin as unknown as { settings: BetterEditSettings }).settings.minImageWidthPx = Math.max(1, parsed);
					await (this.plugin as unknown as { saveSettings: () => Promise<void> }).saveSettings();
				}));

		new Setting(containerEl)
			.setName('Minimum image height')
			.setDesc('Smallest allowed rendered image height when resizing, in pixels.')
			.addText(text => text
				.setPlaceholder('56')
				.setValue(String((this.plugin as unknown as { settings: BetterEditSettings }).settings.minImageHeightPx))
				.onChange(async (value) => {
					const parsed = parseInt(value.trim(), 10);
					if (Number.isNaN(parsed)) return;
					(this.plugin as unknown as { settings: BetterEditSettings }).settings.minImageHeightPx = Math.max(1, parsed);
					await (this.plugin as unknown as { saveSettings: () => Promise<void> }).saveSettings();
				}));
	}
}
