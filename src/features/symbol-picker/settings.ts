import { Platform } from 'obsidian';

export interface ShortcutDef {
	modKey: boolean;   // Ctrl on Win/Linux, Cmd on Mac
	shiftKey: boolean;
	altKey: boolean;
	key: string;       // KeyboardEvent.key value
}

export interface SymbolPickerSettings {
	enabled: boolean;
	contextMenuEnabled: boolean;
	shortcutEnabled: boolean;
	shortcut: ShortcutDef;
	commandEnabled: boolean;
	history: string[];
}

export const SYMBOL_PICKER_DEFAULT_SETTINGS: SymbolPickerSettings = {
	enabled: true,
	contextMenuEnabled: true,
	shortcutEnabled: true,
	shortcut: { modKey: true, shiftKey: true, altKey: false, key: '.' },
	commandEnabled: true,
	history: [],
};

export function matchesShortcut(event: KeyboardEvent, shortcut: ShortcutDef): boolean {
	const isMac = Platform.isMacOS;
	const modPressed = isMac ? event.metaKey : event.ctrlKey;
	const otherMod = isMac ? event.ctrlKey : event.metaKey;
	if (otherMod) return false;
	return (
		event.key === shortcut.key &&
		modPressed === shortcut.modKey &&
		event.shiftKey === shortcut.shiftKey &&
		event.altKey === shortcut.altKey
	);
}

export function formatShortcut(shortcut: ShortcutDef): string {
	const isMac = Platform.isMacOS;
	const parts: string[] = [];
	if (shortcut.modKey) parts.push(isMac ? '⌘' : 'Ctrl');
	if (shortcut.altKey) parts.push(isMac ? '⌥' : 'Alt');
	if (shortcut.shiftKey) parts.push(isMac ? '⇧' : 'Shift');
	const keyLabel = shortcut.key.length === 1 ? shortcut.key : shortcut.key;
	parts.push(keyLabel);
	return isMac ? parts.join('') : parts.join('+');
}
