/**
 * paste-handler.ts
 *
 * Intercepts editor-paste and editor-drop events. When an image file is present:
 *  1. Saves it to the vault using the user's configured attachment folder.
 *  2. Inserts (or replaces a placeholder with) the canonical single-image HTML.
 */

import { Editor, MarkdownFileInfo, MarkdownView, TFile } from 'obsidian';
import { singleImageHtml, placeholderHtml } from './html-schema';
import type BetterEditPlugin from '../../main';

const RECENT_DROP_MS = 1500;
const pendingNativeDropRewrite = new WeakMap<Editor, number>();
const suppressNativeDropRewrite = new WeakSet<Editor>();
let pendingNativeDropUntil = 0;

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
			if (!plugin.settings.handlePastedImages) return;
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
			if (!plugin.settings.handleDroppedImages) return;
			if (evt.defaultPrevented) return;

			const imageFile = getImageFromDataTransfer(evt.dataTransfer);
			if (imageFile) {
				evt.preventDefault();
				void handleImageInsert(plugin, editor, view, imageFile);
				return;
			}

			const existingImage = getExistingImageFromDataTransfer(plugin, evt.dataTransfer, view.file);
			if (!existingImage) {
				markPendingNativeDrop(editor);
				return;
			}

			evt.preventDefault();
			handleExistingImageInsert(plugin, editor, existingImage);
		}),
	);

	plugin.registerEvent(
		plugin.app.workspace.on('editor-change', (editor: Editor, info: MarkdownView | MarkdownFileInfo) => {
			if (!plugin.settings.imageArrangementEnabled) return;
			if (!plugin.settings.handleDroppedImages) return;
			if (suppressNativeDropRewrite.has(editor)) {
				suppressNativeDropRewrite.delete(editor);
				return;
			}

			const now = Date.now();
			const dropTime = pendingNativeDropRewrite.get(editor);
			const hasGlobalDrop = now <= pendingNativeDropUntil;
			if (!dropTime && !hasGlobalDrop) return;
			if (dropTime && now - dropTime > RECENT_DROP_MS) {
				pendingNativeDropRewrite.delete(editor);
				return;
			}

			if (rewriteNativeImageEmbed(plugin, editor, info.file)) {
				pendingNativeDropRewrite.delete(editor);
			}
		}),
	);
}

export function notePotentialNativeImageDrop(): void {
	pendingNativeDropUntil = Date.now() + RECENT_DROP_MS;
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

function handleExistingImageInsert(
	plugin: BetterEditPlugin,
	editor: Editor,
	imageFile: TFile,
): void {
	const html = buildManagedImageHtml(plugin, imageFile);

	const cursorOffset = editor.posToOffset(editor.getCursor());
	const docText = editor.getValue();
	const replacedDoc = tryReplacePlaceholder(docText, cursorOffset, html);

	if (replacedDoc !== null) {
		editor.setValue(replacedDoc);
	} else {
		insertHtmlAtCursor(editor, html);
	}
}

function buildManagedImageHtml(plugin: BetterEditPlugin, imageFile: TFile): string {
	const { defaultImageWidth, defaultImageAlignment } = plugin.settings;
	return singleImageHtml(imageFile.path, defaultImageWidth, defaultImageAlignment);
}

function markPendingNativeDrop(editor: Editor): void {
	pendingNativeDropRewrite.set(editor, Date.now());
	notePotentialNativeImageDrop();
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

function getExistingImageFromDataTransfer(
	plugin: BetterEditPlugin,
	transfer: DataTransfer | null,
	activeFile: TFile | null,
): TFile | null {
	if (!transfer) return null;

	for (const candidate of collectTransferTextCandidates(transfer)) {
		const imagePath = extractImagePath(candidate);
		if (!imagePath) continue;

		const file = resolveImagePath(plugin, imagePath, activeFile);
		if (file) return file;
	}

	return null;
}

function rewriteNativeImageEmbed(
	plugin: BetterEditPlugin,
	editor: Editor,
	activeFile: TFile | null,
): boolean {
	const docText = editor.getValue();
	const cursorOffset = editor.posToOffset(editor.getCursor());
	const match = findNearestImageEmbed(docText, cursorOffset, plugin, activeFile);
	if (!match) return false;

	suppressNativeDropRewrite.add(editor);
	editor.replaceRange(
		buildManagedImageHtml(plugin, match.file),
		editor.offsetToPos(match.from),
		editor.offsetToPos(match.to),
	);
	return true;
}

function findNearestImageEmbed(
	docText: string,
	cursorOffset: number,
	plugin: BetterEditPlugin,
	activeFile: TFile | null,
): { from: number; to: number; file: TFile } | null {
	const candidates = [
		...collectImageEmbedMatches(docText, /!\[\[([^|\]]+)(?:\|[^\]]*)?\]\]/g),
		...collectImageEmbedMatches(docText, /!\[[^\]]*]\(([^)]+)\)/g),
	];

	let best: { from: number; to: number; file: TFile; distance: number } | null = null;
	for (const candidate of candidates) {
		const file = resolveImagePath(plugin, candidate.path, activeFile);
		if (!file) continue;

		const distance =
			cursorOffset >= candidate.from && cursorOffset <= candidate.to ? 0 :
			Math.min(Math.abs(cursorOffset - candidate.from), Math.abs(cursorOffset - candidate.to));
		if (distance > 8) continue;

		if (!best || distance < best.distance) {
			best = { ...candidate, file, distance };
		}
	}

	return best;
}

function collectImageEmbedMatches(
	docText: string,
	regex: RegExp,
): Array<{ from: number; to: number; path: string }> {
	const matches: Array<{ from: number; to: number; path: string }> = [];
	for (const match of docText.matchAll(regex)) {
		if (typeof match.index !== 'number') continue;
		const rawPath = match[1];
		if (!rawPath) continue;
		matches.push({
			from: match.index,
			to: match.index + match[0].length,
			path: rawPath.trim().replace(/^<|>$/g, ''),
		});
	}
	return matches;
}

function resolveImagePath(
	plugin: BetterEditPlugin,
	imagePath: string,
	activeFile: TFile | null,
): TFile | null {
	const directFile = plugin.app.vault.getFileByPath(imagePath);
	if (directFile instanceof TFile && isImageExtension(directFile.extension)) return directFile;

	const linkedFile = plugin.app.metadataCache.getFirstLinkpathDest(imagePath, activeFile?.path ?? '');
	if (linkedFile instanceof TFile && isImageExtension(linkedFile.extension)) return linkedFile;

	return null;
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

function collectTransferTextCandidates(transfer: DataTransfer): string[] {
	const types = ['text/plain', 'text/uri-list', 'text/html'];
	const values: string[] = [];

	for (const type of types) {
		const value = transfer.getData(type);
		if (value) values.push(value);
	}

	return values;
}

function extractImagePath(text: string): string | null {
	const htmlImgMatch = /<img\b[^>]*src="([^"]+)"/i.exec(text);
	if (htmlImgMatch?.[1]) return htmlImgMatch[1].trim();

	const wikiMatch = /!?\[\[([^|\]]+)/.exec(text);
	if (wikiMatch?.[1]) return wikiMatch[1].trim();

	const markdownMatch = /!?\[[^\]]*]\(([^)]+)\)/.exec(text);
	if (markdownMatch?.[1]) return markdownMatch[1].trim().replace(/^<|>$/g, '');

	const plainPath = text.trim().replace(/^<|>$/g, '');
	if (/\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(plainPath)) return plainPath;

	return null;
}

function isImageExtension(extension: string): boolean {
	return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(extension.toLowerCase());
}

// Re-export placeholder so index.ts can use it without importing html-schema directly
export { placeholderHtml };
