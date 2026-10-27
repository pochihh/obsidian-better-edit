/* eslint-disable obsidianmd/no-nodejs-modules */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import type { SettingDefinitionRender } from 'obsidian';
import type BetterEditPlugin from '../src/main';

class ElementStub {
	visible = true;
	dataset = {};
	empty(): void {}
	addClass(): void {}
	removeClass(): void {}
	setAttribute(): void {}
	createDiv(): ElementStub { return new ElementStub(); }
	createEl(): ElementStub { return new ElementStub(); }
	createSpan(): ElementStub { return new ElementStub(); }
	toggle(value: boolean): void { this.visible = value; }
}

class ControlStub {
	value: unknown;
	change: (value: unknown) => Promise<void> = async () => {};
	setValue(value: unknown): this { this.value = value; return this; }
	setPlaceholder(): this { return this; }
	addOptions(): this { return this; }
	setIcon(): this { return this; }
	setTooltip(): this { return this; }
	onClick(): this { return this; }
	onChange(callback: ControlStub['change']): this { this.change = callback; return this; }
}

class SettingStub {
	settingEl = new ElementStub();
	controlEl = new ElementStub();
	name = '';
	controls: ControlStub[] = [];
	setName(name: string): this { this.name = name; return this; }
	setDesc(): this { return this; }
	setClass(): this { return this; }
	addToggle(callback: (control: ControlStub) => void): this { return this.addControl(callback); }
	addText(callback: (control: ControlStub) => void): this { return this.addControl(callback); }
	addDropdown(callback: (control: ControlStub) => void): this { return this.addControl(callback); }
	addExtraButton(callback: (control: ControlStub) => void): this { return this.addControl(callback); }
	private addControl(callback: (control: ControlStub) => void): this {
		const control = new ControlStub();
		this.controls.push(control);
		callback(control);
		return this;
	}
}

void test('settings are searchable without rendering; callbacks save and refresh on both API versions', async () => {
	const rows: SettingStub[] = [];
	class SettingGroupStub {
		addSetting(callback: (setting: SettingStub) => void): void {
			const row = new SettingStub();
			rows.push(row);
			callback(row);
		}
	}
	class SettingTabStub {
		containerEl = new ElementStub();
		updates = 0;
		update(): void { this.updates += 1; }
	}
	const require = createRequire(import.meta.url);
	const { build } = require('esbuild') as typeof import('esbuild');
	const result = await build({
		entryPoints: ['src/settings.ts'], bundle: true, platform: 'node', format: 'cjs', write: false,
		plugins: [{
			name: 'settings-test',
			setup(builder) {
				builder.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', external: true }));
				builder.onResolve({ filter: /features\/(image|blocks)\/index$/ }, () => ({ path: 'refresh', namespace: 'stub' }));
				builder.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
					contents: 'export function refreshImageDecorations() {} export function refreshBlockControls() {}',
				}));
			},
		}],
	});
	const module = { exports: {} as typeof import('../src/settings') };
	let modernApi = true;
	const code = result.outputFiles[0]?.text;
	assert.ok(code);
	runInNewContext(code, {
		module, exports: module.exports,
		require: () => ({ PluginSettingTab: SettingTabStub, SettingGroup: SettingGroupStub, Modal: class {}, Platform: { isMacOS: true }, requireApiVersion: () => modernApi }),
	});
	const { BetterEditSettingTab, DEFAULT_SETTINGS } = module.exports;
	let saves = 0;
	let bodyRefreshes = 0;
	const plugin = {
		settings: structuredClone(DEFAULT_SETTINGS),
		saveSettings: async () => { saves += 1; },
		syncBodyClasses: () => { bodyRefreshes += 1; },
		registerDomEvent: () => {},
	} as unknown as BetterEditPlugin;
	const tab = new BetterEditSettingTab({} as BetterEditPlugin['app'], plugin);
	const definitions = tab.getSettingDefinitions();
	assert.equal(definitions.length, 5);
	const items = definitions.flatMap(group => group.items ?? []);
	for (const name of ['Image rows', 'Handle pasted images', 'Minimum image width', 'Image corner radius', 'Show add button', 'Commands', 'Keyboard shortcut', 'Obsidian command']) {
		assert.ok(items.some(item => item.name === name), name);
	}
	assert.equal(rows.length, 0, 'search registration must not create DOM controls');
	assert.equal(saves, 0);
	const render = (name: string): SettingStub => {
		const item = items.find(item => item.name === name) as SettingDefinitionRender;
		const row = new SettingStub();
		item.render(row as unknown as Parameters<typeof item.render>[0], {} as Parameters<typeof item.render>[1]);
		return row;
	};
	await render('Minimum image width').controls[0]?.change('invalid');
	assert.equal(saves, 0);
	await render('Minimum image width').controls[0]?.change('-5');
	assert.equal(plugin.settings.image.minImageWidthPx, 1);
	await render('Image rows').controls[0]?.change(false);
	assert.equal(plugin.settings.image.imageRows, false);
	assert.equal(bodyRefreshes, 1);
	await render('Image Arrangement').controls[0]?.change(false);
	assert.equal(plugin.settings.image.enabled, false);
	assert.equal((tab as unknown as SettingTabStub).updates, 1);
	assert.equal(render('Image rows').settingEl.visible, false);
	// Older Obsidian has no update(); it must render the same controls imperatively.
	modernApi = false;
	Object.defineProperty(tab, 'update', { value: undefined });
	await render('Image Arrangement').controls[0]?.change(true);
	assert.ok(rows.some(row => row.name === 'Image rows'));
	assert.ok(rows.some(row => row.name === 'Keyboard shortcut'));
	assert.equal(saves, 4);
});
