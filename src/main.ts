import { Plugin } from 'obsidian';
import { BetterEditSettings, DEFAULT_SETTINGS, BetterEditSettingTab } from './settings';
import { initImageFeature, createImageExtension } from './features/image/index';
import { createBlocksExtension } from './features/blocks/index';

export default class BetterEditPlugin extends Plugin {
	settings: BetterEditSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new BetterEditSettingTab(this.app, this));

		initImageFeature(this);
		this.registerEditorExtension(createImageExtension(this));
		if (this.settings.blocks.enabled) {
			this.registerEditorExtension(createBlocksExtension(this));
		}
	}

	onunload() {}

	async loadSettings() {
		const raw = await this.loadData() as Record<string, unknown> | null;
		if (!raw) {
			this.settings = structuredClone(DEFAULT_SETTINGS);
			return;
		}

		// Migrate flat settings shape from v1
		if ('imageArrangementEnabled' in raw || 'handlePastedImages' in raw) {
			this.settings = structuredClone(DEFAULT_SETTINGS);
			const img = this.settings.image;
			if (typeof raw.imageArrangementEnabled === 'boolean') img.enabled = raw.imageArrangementEnabled;
			if (typeof raw.handlePastedImages === 'boolean')      img.handlePastedImages = raw.handlePastedImages;
			if (typeof raw.handleDroppedImages === 'boolean')     img.handleDroppedImages = raw.handleDroppedImages;
			if (typeof raw.overrideImagePaste === 'boolean')      img.handlePastedImages = raw.overrideImagePaste;
			if (typeof raw.overrideVaultImageDrag === 'boolean')  img.handleDroppedImages = raw.overrideVaultImageDrag;
			if (typeof raw.defaultImageWidth === 'string')        img.defaultImageWidth = raw.defaultImageWidth;
			if (typeof raw.defaultImageAlignment === 'string')    img.defaultImageAlignment = raw.defaultImageAlignment as typeof img.defaultImageAlignment;
			if (typeof raw.minImageWidthPx === 'number')          img.minImageWidthPx = raw.minImageWidthPx;
			if (typeof raw.minImageHeightPx === 'number')         img.minImageHeightPx = raw.minImageHeightPx;
			return;
		}

		// Current shape: deep merge each feature namespace
		this.settings = {
			image: Object.assign({}, DEFAULT_SETTINGS.image, (raw.image as Partial<typeof DEFAULT_SETTINGS.image>) ?? {}),
			blocks: Object.assign({}, DEFAULT_SETTINGS.blocks, (raw.blocks as Partial<typeof DEFAULT_SETTINGS.blocks>) ?? {}),
		};
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
