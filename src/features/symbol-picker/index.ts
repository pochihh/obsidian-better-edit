import { EditorView } from '@codemirror/view';
import { MarkdownView } from 'obsidian';
import type BetterEditPlugin from '../../main';
import { EMOJI_SYMBOLS, MATH_SYMBOLS } from './symbol-data';
import { matchesShortcut } from './settings';
import { SymbolPickerPanel } from './symbol-picker';

let activePanel: SymbolPickerPanel | null = null;

function getActiveEditorView(plugin: BetterEditPlugin): EditorView | null {
	const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	if (!view) return null;
	return (view.editor as unknown as { cm: EditorView }).cm ?? null;
}

function openPanel(view: EditorView, plugin: BetterEditPlugin, initialTab: 'math' | 'emoji'): void {
	if (activePanel) {
		activePanel.close();
		return;
	}
	activePanel = new SymbolPickerPanel({
		mathSymbols: MATH_SYMBOLS,
		emojiSymbols: EMOJI_SYMBOLS,
		getHistory: () => plugin.settings.symbolPicker.history,
		setHistory: async (h) => {
			plugin.settings.symbolPicker.history = h;
			await plugin.saveSettings();
		},
		maxHistory: 10,
		view,
		onClose: () => { activePanel = null; },
	});
	activePanel.open(initialTab);
}

export function initSymbolPickerFeature(plugin: BetterEditPlugin): void {
	// Context menu
	plugin.registerEvent(plugin.app.workspace.on('editor-menu', (menu) => {
		if (!plugin.settings.symbolPicker.enabled) return;
		if (!plugin.settings.symbolPicker.contextMenuEnabled) return;
		menu.addItem(item => {
			item
				.setTitle('Insert symbol or emoji')
				.setIcon('smile-plus')
				.setSection('insert')
				.onClick(() => {
					const view = getActiveEditorView(plugin);
					if (!view) return;
					openPanel(view, plugin, 'math');
				});
		});
	}));

	// Keyboard shortcut (plugin-managed, separate from Obsidian command hotkeys)
	plugin.registerDomEvent(plugin.app.workspace.containerEl.ownerDocument, 'keydown', (event: KeyboardEvent) => {
		if (!plugin.settings.symbolPicker.enabled) return;
		if (!plugin.settings.symbolPicker.shortcutEnabled) return;
		if (!matchesShortcut(event, plugin.settings.symbolPicker.shortcut)) return;
		const view = getActiveEditorView(plugin);
		if (!view?.hasFocus) return;
		event.preventDefault();
		openPanel(view, plugin, 'math');
	});

	// Obsidian command (no default hotkey — avoids conflict with shortcut trigger above)
	plugin.addCommand({
		id: 'open-symbol-picker',
		name: 'Insert symbol or emoji',
		editorCallback: () => {
			if (!plugin.settings.symbolPicker.enabled) return;
			if (!plugin.settings.symbolPicker.commandEnabled) return;
			const view = getActiveEditorView(plugin);
			if (!view) return;
			openPanel(view, plugin, 'math');
		},
	});
}
