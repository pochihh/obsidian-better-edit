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
		const loaded = await this.loadData() as Partial<BetterEditSettings> & {
			overrideImagePaste?: boolean;
			overrideVaultImageDrag?: boolean;
		};
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
		this.settings.handlePastedImages = loaded.handlePastedImages ?? loaded.overrideImagePaste ?? DEFAULT_SETTINGS.handlePastedImages;
		this.settings.handleDroppedImages = loaded.handleDroppedImages ?? loaded.overrideVaultImageDrag ?? DEFAULT_SETTINGS.handleDroppedImages;
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
