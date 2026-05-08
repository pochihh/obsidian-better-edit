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

import { EditorView } from '@codemirror/view';
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
		buildKeydownExtension(),
	];
}

// ---------------------------------------------------------------------------
// Keyboard handler — operates when an image block is selected
// ---------------------------------------------------------------------------

function buildKeydownExtension(): Extension {
	return EditorView.domEventHandlers({
		keydown(event: KeyboardEvent, view: EditorView): boolean {
			const selected = view.state.field(imageSelectionField);
			if (selected === null) return false;

			switch (event.key) {
				case 'Escape': {
					view.dispatch({ effects: deselectImageBlock.of(null) });
					return true;
				}

				case 'Delete':
				case 'Backspace': {
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

				case 'ArrowUp': {
					const lineStart = view.state.doc.lineAt(selected.from).from;
					view.dispatch({
						selection: { anchor: Math.max(0, lineStart - 1) },
						effects: deselectImageBlock.of(null),
					});
					return true;
				}

				case 'ArrowDown': {
					view.dispatch({
						selection: { anchor: Math.min(view.state.doc.length, selected.to + 1) },
						effects: deselectImageBlock.of(null),
					});
					return true;
				}

				default:
					return false;
			}
		},
	});
}
