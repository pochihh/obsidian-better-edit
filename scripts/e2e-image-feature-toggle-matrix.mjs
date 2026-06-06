import fs from 'node:fs/promises';

const notePath = 'Better Edit Feature Toggle Portability Regression.md';
const vaultNotePath = process.platform === 'win32'
	? 'D:/Projects/test_vault/Better Edit Feature Toggle Portability Regression.md'
	: '/mnt/d/Projects/test_vault/Better Edit Feature Toggle Portability Regression.md';
const outPath = process.platform === 'win32'
	? 'D:/Projects/obsidian-better-edit/test-results/e2e/image-feature-toggle-matrix.json'
	: 'test-results/e2e/image-feature-toggle-matrix.json';

const seed = `# Better Edit feature toggle portability regression

Single filled image:

<div data-better-edit-image="filled" style="width: 240px; max-width: 100%; margin: 0 auto; text-align: center;">
  <img src="demo-canyon.svg" style="width: 100%; max-width: 100%; display: block; border-radius: 4px;" />
  <p style="font-size: 0.85em; color: #888; margin: 4px 0 0;">Portable single image</p>
</div>

Single placeholder:

<div data-better-edit-image="placeholder" style="border: 2px dashed #ccc; border-radius: 4px; padding: 32px 16px; text-align: center; color: #999; font-size: 0.9em; min-height: 80px; box-sizing: border-box; max-width: 100%;">
  Paste or drop an image here
</div>

Image row:

<div data-better-edit-image-row style="display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-start; justify-content: flex-start;">
<div data-better-edit-image="filled" style="width: 220px; max-width: 100%; flex: 0 0 auto; text-align: center;">
  <img src="demo-canyon.svg" style="width: 100%; max-width: 100%; display: block; border-radius: 4px;" />
</div>
<div data-better-edit-image="placeholder" style="border: 2px dashed #ccc; border-radius: 4px; padding: 32px 16px; text-align: center; color: #999; font-size: 0.9em; min-height: 80px; box-sizing: border-box; width: 160px; max-width: 100%; flex: 0 0 auto;">
  Add an image
</div>
</div>
`;

await fs.writeFile(vaultNotePath, seed, 'utf8');

const targets = await fetch('http://127.0.0.1:9222/json/list').then(r => r.json());
const pageTarget = targets.find(t => t.type === 'page' && String(t.url).includes('obsidian.md'));
if (!pageTarget) throw new Error('No Obsidian CDP page target at http://127.0.0.1:9222/json/list');

const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = event => {
	const msg = JSON.parse(event.data);
	if (!msg.id || !pending.has(msg.id)) return;
	const callbacks = pending.get(msg.id);
	pending.delete(msg.id);
	if (msg.error) callbacks.reject(new Error(JSON.stringify(msg.error)));
	else callbacks.resolve(msg);
};
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

async function cdp(method, params = {}) {
	const cid = ++id;
	ws.send(JSON.stringify({ id: cid, method, params }));
	return await new Promise((resolve, reject) => pending.set(cid, { resolve, reject }));
}

async function ev(expression) {
	const response = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
	if (response.result?.exceptionDetails) {
		throw new Error(response.result.exceptionDetails.exception?.description || response.result.exceptionDetails.text);
	}
	return response.result?.result?.value;
}

const booleans = [false, true];
const cases = [];
for (const imageEnabled of booleans) {
	for (const imageRows of booleans) {
		for (const blocksEnabled of booleans) {
			for (const slashEnabled of booleans) {
				for (const textEnabled of booleans) {
					for (const symbolEnabled of booleans) {
						cases.push({ imageEnabled, imageRows, blocksEnabled, slashEnabled, textEnabled, symbolEnabled });
					}
				}
			}
		}
	}
}

async function applyCase(testCase) {
	return await ev(`(async () => {
		let plugin = app.plugins.plugins['better-edit'];
		plugin.settings.image.enabled = ${JSON.stringify(testCase.imageEnabled)};
		plugin.settings.image.imageRows = ${JSON.stringify(testCase.imageRows)};
		plugin.settings.blocks.enabled = ${JSON.stringify(testCase.blocksEnabled)};
		plugin.settings.slashCommand.enabled = ${JSON.stringify(testCase.slashEnabled)};
		plugin.settings.textStyling.enabled = ${JSON.stringify(testCase.textEnabled)};
		plugin.settings.symbolPicker.enabled = ${JSON.stringify(testCase.symbolEnabled)};
		await plugin.saveSettings();
		await app.plugins.disablePlugin('better-edit');
		await app.plugins.enablePlugin('better-edit');
		plugin = app.plugins.plugins['better-edit'];
		const file = app.vault.getAbstractFileByPath(${JSON.stringify(notePath)});
		if (!file) throw new Error('Missing matrix note');
		await app.workspace.getLeaf(false).openFile(file);
		await app.commands.executeCommandById('markdown:edit');
		await new Promise(r => setTimeout(r, 650));
		return {
			imageEnabled: plugin.settings.image.enabled,
			imageRows: plugin.settings.image.imageRows,
			blocksEnabled: plugin.settings.blocks.enabled,
			slashEnabled: plugin.settings.slashCommand.enabled,
			textEnabled: plugin.settings.textStyling.enabled,
			symbolEnabled: plugin.settings.symbolPicker.enabled,
			bodyImageClass: document.body.classList.contains('be-image-arrangement-active'),
			bodyRowsClass: document.body.classList.contains('be-image-rows-active'),
		};
	})()`);
}

async function measure() {
	return await ev(`(() => {
		const root = document.querySelector('.workspace-leaf.mod-active') || document;
		const isVisible = el => {
			const r = el.getBoundingClientRect();
			const cs = getComputedStyle(el);
			return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
		};
		const nativeSingle = Array.from(root.querySelectorAll('.cm-html-embed')).filter(el => el.querySelector('[data-better-edit-image="filled"]') && !el.querySelector('[data-better-edit-image-row]'));
		const nativeRows = Array.from(root.querySelectorAll('.cm-html-embed')).filter(el => el.querySelector('[data-better-edit-image-row]'));
		return {
			beImageWidgets: root.querySelectorAll('.be-image-widget').length,
			beRowWidgets: root.querySelectorAll('.be-image-row-widget').length,
			visibleNativeSingle: nativeSingle.filter(isVisible).length,
			visibleNativeRows: nativeRows.filter(isVisible).length,
			visibleRenderedImages: Array.from(root.querySelectorAll('img[src$="demo-canyon.svg"], img[src*="demo-canyon.svg"]')).filter(isVisible).length,
		};
	})()`);
}

function expectation(testCase, settings, snapshot) {
	const failures = [];
	if (settings.bodyImageClass !== testCase.imageEnabled) failures.push('body image active class mismatch');
	if (settings.bodyRowsClass !== (testCase.imageEnabled && testCase.imageRows)) failures.push('body rows active class mismatch');

	if (testCase.imageEnabled) {
		if (snapshot.beImageWidgets < 2) failures.push('expected enhanced single image + placeholder widgets');
		if (testCase.imageRows) {
			if (snapshot.beRowWidgets < 1) failures.push('expected enhanced row widget when imageRows enabled');
		} else {
			if (snapshot.beRowWidgets !== 0) failures.push('expected no row widget when imageRows disabled');
			if (snapshot.visibleNativeRows < 1) failures.push('expected raw/native row visible when imageRows disabled');
		}
	} else {
		if (snapshot.beImageWidgets !== 0) failures.push('expected no image widgets when image feature disabled');
		if (snapshot.beRowWidgets !== 0) failures.push('expected no row widgets when image feature disabled');
		if (snapshot.visibleNativeSingle < 1) failures.push('expected raw/native single image visible when image feature disabled');
		if (snapshot.visibleNativeRows < 1) failures.push('expected raw/native image row visible when image feature disabled');
	}

	if (snapshot.visibleRenderedImages < 2) failures.push('expected both demo images visible');
	return failures;
}

const results = [];
try {
	await cdp('Runtime.enable');
	await cdp('Page.enable');
	for (const testCase of cases) {
		const settings = await applyCase(testCase);
		const snapshot = await measure();
		const failures = expectation(testCase, settings, snapshot);
		results.push({ case: testCase, settings, snapshot, failures });
	}
	const failed = results.filter(result => result.failures.length > 0);
	await fs.mkdir(outPath.replace(/[\\/][^\\/]*$/, ''), { recursive: true });
	await fs.writeFile(outPath, JSON.stringify({ total: results.length, failed: failed.length, results }, null, 2), 'utf8');
	console.log(JSON.stringify({ total: results.length, failed: failed.length, outPath }));
	if (failed.length > 0) {
		console.error(JSON.stringify(failed.slice(0, 5), null, 2));
		process.exitCode = 2;
	}
} finally {
	await ev(`(async () => {
		const plugin = app.plugins.plugins['better-edit'];
		if (plugin) {
			plugin.settings.image.enabled = true;
			plugin.settings.image.imageRows = true;
			plugin.settings.blocks.enabled = true;
			plugin.settings.slashCommand.enabled = true;
			plugin.settings.textStyling.enabled = true;
			plugin.settings.symbolPicker.enabled = true;
			await plugin.saveSettings();
			plugin.syncBodyClasses?.();
		}
		return true;
	})()`).catch(() => undefined);
	ws.close();
}
