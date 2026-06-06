/* eslint-disable obsidianmd/prefer-active-window-timers */
import fs from 'node:fs/promises';

const notePath = 'Better Edit Image Row Add Regression.md';
const vaultNotePath = process.platform === 'win32'
	? 'D:/Projects/test_vault/Better Edit Image Row Add Regression.md'
	: '/mnt/d/Projects/test_vault/Better Edit Image Row Add Regression.md';
const outPath = 'test-results/e2e/image-row-add-menu-live-check.json';

const seed = `# Better Edit image row add regression

<div data-better-edit-image-row style="display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-start; justify-content: flex-start;">
<div data-better-edit-image="filled" style="width: 240px; max-width: 100%; flex: 0 0 auto; text-align: center;">
  <img src="demo-canyon.svg" style="width: 100%; max-width: 100%; display: block; border-radius: 4px;" />
</div>
</div>
`;

await fs.writeFile(vaultNotePath, seed, 'utf8');

const targets = await fetch('http://127.0.0.1:9222/json/list').then(r => r.json());
const pageTarget = targets.find(t => t.type === 'page' && String(t.url).includes('obsidian.md'));
if (!pageTarget) throw new Error('No Obsidian page target on http://127.0.0.1:9222. Start Windows Obsidian with CDP enabled.');

const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = event => {
	const msg = JSON.parse(event.data);
	if (msg.id && pending.has(msg.id)) {
		const { resolve, reject } = pending.get(msg.id);
		pending.delete(msg.id);
		msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg);
	}
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

async function mouseClick(x, y) {
	const ix = Math.round(x);
	const iy = Math.round(y);
	await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: ix, y: iy, button: 'none', pointerType: 'mouse' });
	await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: ix, y: iy, button: 'left', clickCount: 1, pointerType: 'mouse' });
	await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: ix, y: iy, button: 'left', clickCount: 1, pointerType: 'mouse' });
}

try {
	await cdp('Runtime.enable');
	await cdp('Page.enable');

	await ev(`(async () => {
		let plugin = app.plugins.plugins['better-edit'];
		if (!plugin) throw new Error('better-edit plugin is not loaded');
		plugin.settings.image.enabled = true;
		plugin.settings.image.imageRows = true;
		await plugin.saveSettings();
		await app.plugins.disablePlugin('better-edit');
		await app.plugins.enablePlugin('better-edit');
		plugin = app.plugins.plugins['better-edit'];
		plugin.syncBodyClasses?.();
		document.querySelectorAll('.menu').forEach(menu => menu.remove());
		const file = app.vault.getAbstractFileByPath(${JSON.stringify(notePath)});
		if (!file) throw new Error('Missing test note: ${notePath}');
		await app.workspace.getLeaf(false).openFile(file);
		await app.commands.executeCommandById('markdown:edit');
		await new Promise(r => setTimeout(r, 1500));
		return true;
	})()`);

	const rowInfo = await ev(`(() => {
		const row = document.querySelector('.workspace-leaf.mod-active .be-image-row-widget .be-image-row') || document.querySelector('.be-image-row-widget .be-image-row');
		const rect = row?.getBoundingClientRect();
		return {
			rowRect: rect && { x: rect.left, y: rect.top, w: rect.width, h: rect.height },
			itemCount: row?.querySelectorAll(':scope > .be-image-row-item').length ?? 0,
		};
	})()`);
	if (!rowInfo.rowRect || rowInfo.rowRect.w === 0 || rowInfo.itemCount !== 1) {
		throw new Error(`Initial row not visible/valid: ${JSON.stringify(rowInfo)}`);
	}

	await cdp('Input.dispatchMouseEvent', {
		type: 'mouseMoved',
		x: Math.round(rowInfo.rowRect.x + 10),
		y: Math.round(rowInfo.rowRect.y + 20),
		button: 'none',
		pointerType: 'mouse',
	});
	await new Promise(r => setTimeout(r, 700));

	let moreInfo = null;
	let addInfo = null;
	for (let attempt = 0; attempt < 5 && addInfo === null; attempt++) {
		await ev(`(() => { document.querySelectorAll('.menu').forEach(menu => menu.remove()); })()`);
		await cdp('Input.dispatchMouseEvent', {
			type: 'mouseMoved',
			x: Math.round(rowInfo.rowRect.x + 10),
			y: Math.round(rowInfo.rowRect.y + 20),
			button: 'none',
			pointerType: 'mouse',
		});
		await new Promise(r => setTimeout(r, 500));

		moreInfo = await ev(`(() => {
			const buttons = Array.from(document.querySelectorAll('.be-image-row-toolbar.is-visible button, .be-image-row-toolbar button'));
			const more = buttons.find(b => (b.getAttribute('aria-label') || b.getAttribute('data-tooltip') || '').trim() === 'More');
			if (!more) return null;
			const rect = more.getBoundingClientRect();
			if (rect.width <= 0 || rect.height <= 0) return null;
			return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, rect: { x: rect.left, y: rect.top, w: rect.width, h: rect.height } };
		})()`);
		if (!moreInfo) continue;

		await mouseClick(moreInfo.x, moreInfo.y);
		await new Promise(r => setTimeout(r, 800));

		addInfo = await ev(`(() => {
			const add = Array.from(document.querySelectorAll('.menu-item')).find(el => el.textContent.trim().replace(/\\s+/g, ' ') === 'Add image');
			if (!add) return null;
			const rect = add.getBoundingClientRect();
			return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, rect: { x: rect.left, y: rect.top, w: rect.width, h: rect.height }, text: add.textContent.trim() };
		})()`);
	}
	if (!moreInfo) throw new Error(`Collapsed row More button not visible: ${JSON.stringify({ rowInfo, moreInfo })}`);
	if (!addInfo) throw new Error('Row More menu did not expose Add image');

	await mouseClick(addInfo.x, addInfo.y);
	await new Promise(r => setTimeout(r, 3000));

	const after = await ev(`(async () => {
		const view = app.workspace.activeLeaf.view;
		const editorValue = view.editor?.getValue?.() ?? '';
		const file = app.workspace.getActiveFile();
		const disk = await app.vault.read(file);
		const row = document.querySelector('.be-image-row-widget .be-image-row');
		return {
			domItems: row?.querySelectorAll(':scope > .be-image-row-item').length ?? 0,
			domPlaceholders: row?.querySelectorAll('.be-image-row-placeholder').length ?? 0,
			editorPlaceholderCount: (editorValue.match(/data-better-edit-image="placeholder"/g) || []).length,
			editorRowCount: (editorValue.match(/data-better-edit-image-row/g) || []).length,
			editorFilledCount: (editorValue.match(/data-better-edit-image="filled"/g) || []).length,
			diskPlaceholderCount: (disk.match(/data-better-edit-image="placeholder"/g) || []).length,
			editorValue,
			disk,
		};
	})()`);

	const result = {
		ok: after.domItems === 2 && after.domPlaceholders === 1 && after.editorPlaceholderCount === 1 && after.editorRowCount === 1 && after.editorFilledCount === 1 && after.diskPlaceholderCount === 1,
		rowInfo,
		moreInfo,
		addInfo,
		after,
	};
	await fs.mkdir('test-results/e2e', { recursive: true });
	await fs.writeFile(outPath, JSON.stringify(result, null, 2));
	console.log(JSON.stringify(result));
	if (!result.ok) process.exitCode = 2;
} finally {
	ws.close();
}
