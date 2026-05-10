import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { ImageSettings, IMAGE_DEFAULT_SETTINGS } from './features/image/settings';
import { BlocksSettings, BLOCKS_DEFAULT_SETTINGS } from './features/blocks/settings';
import { refreshImageDecorations } from './features/image/index';

export interface BetterEditSettings {
	image: ImageSettings;
	blocks: BlocksSettings;
}

export const DEFAULT_SETTINGS: BetterEditSettings = {
	image: IMAGE_DEFAULT_SETTINGS,
	blocks: BLOCKS_DEFAULT_SETTINGS,
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

		this.renderImageSettings(containerEl);
		this.renderBlocksSettings(containerEl);
	}

	private renderImageSettings(containerEl: HTMLElement): void {
		const s = () => this.plugin.settings.image;
		const save = () => this.plugin.saveSettings();

		new Setting(containerEl)
			.setName('Image arrangement')
			.setHeading();

		new Setting(containerEl)
			.setName('Enable image arrangement')
			.setDesc('Intercept image paste and drop to insert rich HTML image blocks. Existing image blocks become regular HTML when disabled.')
			.addToggle(toggle => toggle
				.setValue(s().enabled)
				.onChange(async (value) => {
					s().enabled = value;
					await save();
					refreshImageDecorations(this.plugin.app);
				}));

		new Setting(containerEl)
			.setName('Handle pasted images')
			.setDesc('Save pasted image data and insert better edit HTML image blocks.')
			.addToggle(toggle => toggle
				.setValue(s().handlePastedImages)
				.onChange(async (value) => {
					s().handlePastedImages = value;
					await save();
				}));

		new Setting(containerEl)
			.setName('Handle dropped images')
			.setDesc('Handle image drops from the file system or vault as better edit HTML image blocks.')
			.addToggle(toggle => toggle
				.setValue(s().handleDroppedImages)
				.onChange(async (value) => {
					s().handleDroppedImages = value;
					await save();
				}));

		new Setting(containerEl)
			.setName('Minimum image width')
			.setDesc('Smallest allowed image width when resizing, in pixels.')
			.addText(text => text
				.setPlaceholder('80')
				.setValue(String(s().minImageWidthPx))
				.onChange(async (value) => {
					const parsed = parseInt(value.trim(), 10);
					if (Number.isNaN(parsed)) return;
					s().minImageWidthPx = Math.max(1, parsed);
					await save();
				}));

		new Setting(containerEl)
			.setName('Minimum image height')
			.setDesc('Smallest allowed rendered image height when resizing, in pixels.')
			.addText(text => text
				.setPlaceholder('56')
				.setValue(String(s().minImageHeightPx))
				.onChange(async (value) => {
					const parsed = parseInt(value.trim(), 10);
					if (Number.isNaN(parsed)) return;
					s().minImageHeightPx = Math.max(1, parsed);
					await save();
				}));

		new Setting(containerEl)
			.setName('Compact toolbar threshold')
			.setDesc('Image frame width (px) below which the toolbar collapses to a single more button.')
			.addText(text => text
				.setPlaceholder('220')
				.setValue(String(s().compactToolbarThresholdPx))
				.onChange(async (value) => {
					const parsed = parseInt(value.trim(), 10);
					if (Number.isNaN(parsed)) return;
					s().compactToolbarThresholdPx = Math.max(1, parsed);
					await save();
				}));

		new Setting(containerEl)
			.setName('Image corner radius')
			.setDesc('Border-radius applied to image corners in pixels. Set to 0 for sharp corners. Applied to the saved HTML on next edit.')
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
	}

	private renderBlocksSettings(containerEl: HTMLElement): void {
		const s = () => this.plugin.settings.blocks;
		const save = () => this.plugin.saveSettings();

		new Setting(containerEl)
			.setName('Blocks drag and drop')
			.setHeading();

		new Setting(containerEl)
			.setName('Enable block drag handles')
			.setDesc('Show Notion-style block controls in live preview.')
			.addToggle(toggle => toggle
				.setValue(s().enabled)
				.onChange(async (value) => {
					s().enabled = value;
					await save();
				}));

		new Setting(containerEl)
			.setName('Show add button')
			.setDesc('Show the plus button beside hovered blocks.')
			.addToggle(toggle => toggle
				.setValue(s().showAddButton)
				.onChange(async (value) => {
					s().showAddButton = value;
					await save();
				}));

		new Setting(containerEl)
			.setName('Enable list item drag')
			.setDesc('Allow list items to be treated as movable blocks.')
			.addToggle(toggle => toggle
				.setValue(s().enableListItemDrag)
				.onChange(async (value) => {
					s().enableListItemDrag = value;
					await save();
				}));

		new Setting(containerEl)
			.setName('Enable drag for HTML blocks')
			.setDesc('Allow complete HTML blocks to be treated as movable blocks.')
			.addToggle(toggle => toggle
				.setValue(s().enableHtmlBlockDrag)
				.onChange(async (value) => {
					s().enableHtmlBlockDrag = value;
					await save();
				}));
	}
}
