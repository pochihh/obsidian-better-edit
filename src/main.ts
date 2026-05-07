import { Plugin } from 'obsidian';
import { BetterEditSettings, DEFAULT_SETTINGS, BetterEditSettingTab } from './settings';
import { initImageFeature, createImageExtension } from './features/image/index';

export default class BetterEditPlugin extends Plugin {
	settings: BetterEditSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new BetterEditSettingTab(this.app, this));

		if (this.settings.imageArrangementEnabled) {
			initImageFeature(this);
			this.registerEditorExtension(createImageExtension(this));
		}
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<BetterEditSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
