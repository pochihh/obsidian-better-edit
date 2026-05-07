import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';

export interface BetterEditSettings {
	// Image arrangement
	imageArrangementEnabled: boolean;
	defaultImageWidth: string;
	defaultImageAlignment: 'left' | 'center' | 'right';
}

export const DEFAULT_SETTINGS: BetterEditSettings = {
	imageArrangementEnabled: true,
	defaultImageWidth: '100%',
	defaultImageAlignment: 'center',
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
	}
}
