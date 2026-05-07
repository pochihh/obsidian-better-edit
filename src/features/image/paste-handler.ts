/**
 * paste-handler.ts
 *
 * Intercepts editor-paste and editor-drop events. When an image file is present:
 *  1. Saves it to the vault using the user's configured attachment folder.
 *  2. Inserts (or replaces a placeholder with) the canonical single-image HTML.
 */

import { Editor, MarkdownView, TFile } from 'obsidian';
import { singleImageHtml, placeholderHtml } from './html-schema';
import type BetterEditPlugin from '../../main';

// ---------------------------------------------------------------------------
// Public API — called from index.ts
// ---------------------------------------------------------------------------

/**
 * Registers the paste and drop handlers on the plugin.
 * Uses this.registerEvent so they're cleaned up on plugin unload.
 */
export function registerPasteDropHandlers(plugin: BetterEditPlugin): void {
	plugin.registerEvent(
		plugin.app.workspace.on('editor-paste', (evt: ClipboardEvent, editor: Editor, view: MarkdownView) => {
			if (!plugin.settings.imageArrangementEnabled) return;
			if (evt.defaultPrevented) return;

			const imageFile = getImageFromDataTransfer(evt.clipboardData);
			if (!imageFile) return;

			evt.preventDefault();
			void handleImageInsert(plugin, editor, view, imageFile);
		}),
	);

	plugin.registerEvent(
		plugin.app.workspace.on('editor-drop', (evt: DragEvent, editor: Editor, view: MarkdownView) => {
			if (!plugin.settings.imageArrangementEnabled) return;
			if (evt.defaultPrevented) return;

			const imageFile = getImageFromDataTransfer(evt.dataTransfer);
			if (!imageFile) return;

			evt.preventDefault();
			void handleImageInsert(plugin, editor, view, imageFile);
		}),
	);
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

async function handleImageInsert(
	plugin: BetterEditPlugin,
	editor: Editor,
	view: MarkdownView,
	imageFile: File,
): Promise<void> {
	const activeFile = view.file;
	if (!activeFile) return;

	// Save the image to the vault using Obsidian's attachment folder resolution
	const savedPath = await saveImageToVault(plugin, imageFile, activeFile);
	if (!savedPath) return;

	const { defaultImageWidth, defaultImageAlignment } = plugin.settings;
	const html = singleImageHtml(savedPath, defaultImageWidth, defaultImageAlignment);

	// Check if the cursor is inside a placeholder block and replace it; otherwise insert at cursor
	const cursorOffset = editor.posToOffset(editor.getCursor());
	const docText = editor.getValue();
	const replacedDoc = tryReplacePlaceholder(docText, cursorOffset, html);

	if (replacedDoc !== null) {
		editor.setValue(replacedDoc);
	} else {
		insertHtmlAtCursor(editor, html);
	}
}

/**
 * Saves a File object to the vault, honoring the user's attachment folder setting.
 * Returns the vault-relative path of the saved file, or null on failure.
 */
async function saveImageToVault(
	plugin: BetterEditPlugin,
	file: File,
	activeFile: TFile,
): Promise<string | null> {
	try {
		const arrayBuffer = await file.arrayBuffer();
		const fileName = sanitizeFilename(file.name || `image-${Date.now()}.png`);

		// Use Obsidian's getAvailablePathForAttachment to resolve the attachment folder
		// and avoid filename collisions
		const attachmentPath = await plugin.app.fileManager.getAvailablePathForAttachment(
			fileName,
			activeFile.path,
		);

		await plugin.app.vault.createBinary(attachmentPath, arrayBuffer);

		// Return the path relative to the vault root (suitable for use in <img src="...">)
		return attachmentPath;
	} catch (e) {
		console.error('[better-edit] Failed to save image to vault:', e);
		return null;
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extracts the first image File from a DataTransfer, or null. */
function getImageFromDataTransfer(transfer: DataTransfer | null): File | null {
	if (!transfer) return null;
	const files = Array.from(transfer.files ?? []);
	return files.find(f => f.type.startsWith('image/')) ?? null;
}

/**
 * Inserts `html` at the cursor position and advances the cursor past the block.
 * Mirrors Obsidian's native ![[img]] behavior: cursor lands on the line after insertion.
 */
function insertHtmlAtCursor(editor: Editor, html: string): void {
	const cursor = editor.getCursor();
	const lineText = editor.getLine(cursor.line);
	const isEmptyLine = lineText.trim() === '';

	// Build the insertion: if on an empty line replace it; otherwise start on a new line
	const prefix = isEmptyLine ? '' : '\n';
	const insertion = `${prefix}${html}\n`;
	const insertPos = { line: cursor.line, ch: isEmptyLine ? 0 : lineText.length };

	editor.replaceRange(insertion, insertPos);

	// Advance cursor to the line after the inserted block
	const htmlLineCount = html.split('\n').length;
	const targetLine = cursor.line + (isEmptyLine ? 0 : 1) + htmlLineCount;
	editor.setCursor({ line: targetLine, ch: 0 });
}

/**
 * If `cursorOffset` falls inside a `<div data-placeholder="image" …>` block,
 * replaces that placeholder with `replacement` in `docText` and returns the
 * new document string. Returns null if no placeholder was found at that offset.
 */
function tryReplacePlaceholder(
	docText: string,
	cursorOffset: number,
	replacement: string,
): string | null {
	const placeholderOpen = '<div data-placeholder="image"';
	let searchFrom = 0;

	while (true) {
		const start = docText.indexOf(placeholderOpen, searchFrom);
		if (start === -1) break;

		// Find the closing </div>
		const end = docText.indexOf('</div>', start);
		if (end === -1) break;

		const blockEnd = end + '</div>'.length;

		if (cursorOffset >= start && cursorOffset <= blockEnd) {
			return docText.slice(0, start) + replacement + docText.slice(blockEnd);
		}

		searchFrom = blockEnd;
	}

	return null;
}

/** Strips characters that are invalid in vault filenames. */
function sanitizeFilename(name: string): string {
	return name.replace(/[\\/:*?"<>|]/g, '_');
}

// Re-export placeholder so index.ts can use it without importing html-schema directly
export { placeholderHtml };
