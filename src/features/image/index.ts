/**
 * index.ts — Image Arrangement feature entry point
 *
 * Registers:
 *  - paste/drop handlers (via registerEvent)
 *  - CM6 extensions: imageSelectionField, widget ViewPlugin, keydown handler
 *
 * Mousedown handling is done inside the ViewPlugin constructor using a
 * capture-phase listener (before Obsidian's own source-reveal handler).
 */

import { EditorView, keymap } from '@codemirror/view';
import { Extension, Prec } from '@codemirror/state';
import { registerPasteDropHandlers } from './paste-handler';
import { createImageDecorationField, createImageWidgetExtension } from './widget';
import { imageSelectionField, deselectImageBlock } from './selection';
import type BetterEditPlugin from '../../main';

export function initImageFeature(plugin: BetterEditPlugin): void {
	registerPasteDropHandlers(plugin);
}

export function createImageExtension(plugin: BetterEditPlugin): Extension {
	return [
		imageSelectionField,
		Prec.highest(createImageDecorationField(plugin)), // Must win over Obsidian's native HTML embed decoration.
		createImageWidgetExtension(plugin),   // ViewPlugin — mousedown handler only
		Prec.highest(buildKeydownExtension()),
	];
}

// ---------------------------------------------------------------------------
// Keyboard handler — operates when an image block is selected
// ---------------------------------------------------------------------------

function buildKeydownExtension(): Extension {
	return keymap.of([
		{
			key: 'Escape',
			preventDefault: true,
			run(view: EditorView): boolean {
				const selected = view.state.field(imageSelectionField);
				if (selected === null) return false;

				view.dispatch({ effects: deselectImageBlock.of(null) });
				return true;
			},
		},
		{
			key: 'Delete',
			preventDefault: true,
			run: deleteSelectedImage,
		},
		{
			key: 'Backspace',
			preventDefault: true,
			run: deleteSelectedImage,
		},
		{
			key: 'Enter',
			preventDefault: true,
			run(view: EditorView): boolean {
				const selected = view.state.field(imageSelectionField);
				if (selected === null) return false;

				view.dispatch({
					changes: { from: selected.to, to: selected.to, insert: '\n' },
					selection: { anchor: selected.to + 1 },
					effects: deselectImageBlock.of(null),
				});
				return true;
			},
		},
		{
			key: 'ArrowUp',
			preventDefault: true,
			run(view: EditorView): boolean {
				const selected = view.state.field(imageSelectionField);
				if (selected === null) return false;

				const lineStart = view.state.doc.lineAt(selected.from).from;
				view.dispatch({
					selection: { anchor: Math.max(0, lineStart - 1) },
					effects: deselectImageBlock.of(null),
				});
				return true;
			},
		},
		{
			key: 'ArrowLeft',
			preventDefault: true,
			run(view: EditorView): boolean {
				const selected = view.state.field(imageSelectionField);
				if (selected === null) return false;

				view.dispatch({
					selection: { anchor: selected.from },
					effects: deselectImageBlock.of(null),
				});
				return true;
			},
		},
		{
			key: 'ArrowRight',
			preventDefault: true,
			run(view: EditorView): boolean {
				const selected = view.state.field(imageSelectionField);
				if (selected === null) return false;

				view.dispatch({
					selection: { anchor: selected.to },
					effects: deselectImageBlock.of(null),
				});
				return true;
			},
		},
		{
			key: 'ArrowDown',
			preventDefault: true,
			run(view: EditorView): boolean {
				const selected = view.state.field(imageSelectionField);
				if (selected === null) return false;

				view.dispatch({
					selection: { anchor: Math.min(view.state.doc.length, selected.to + 1) },
					effects: deselectImageBlock.of(null),
				});
				return true;
			},
		},
	]);
}

function deleteSelectedImage(view: EditorView): boolean {
	const selected = view.state.field(imageSelectionField);
	if (selected === null) return false;

	let { from, to } = selected;
	if (to < view.state.doc.length && view.state.doc.sliceString(to, to + 1) === '\n') {
		to += 1;
	}
	view.dispatch({
		changes: { from, to, insert: '' },
		effects: deselectImageBlock.of(null),
	});
	return true;
}
