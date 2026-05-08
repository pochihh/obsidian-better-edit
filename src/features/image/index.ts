/**
 * index.ts — Image Arrangement feature entry point
 *
 * Registers:
 *  - paste/drop handlers (via registerEvent)
 *  - CM6 extensions: imageSelectionField, widget ViewPlugin, keydown handler
 */

import { EditorView } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { registerPasteDropHandlers } from './paste-handler';
import { createImageWidgetExtension } from './widget';
import { imageSelectionField, deselectImageBlock } from './selection';
import type BetterEditPlugin from '../../main';

export function initImageFeature(plugin: BetterEditPlugin): void {
	registerPasteDropHandlers(plugin);
}

export function createImageExtension(plugin: BetterEditPlugin): Extension {
	return [
		imageSelectionField,
		createImageWidgetExtension(plugin),
		buildKeydownExtension(),
	];
}

// ---------------------------------------------------------------------------
// Keyboard handler for selected image blocks
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
					// Delete the entire image block (including surrounding newline if present)
					const doc = view.state.doc;
					let { from, to } = selected;

					// Expand range to consume the trailing newline so we don't leave a blank line
					if (to < doc.length && doc.sliceString(to, to + 1) === '\n') {
						to += 1;
					}

					view.dispatch({
						changes: { from, to, insert: '' },
						effects: deselectImageBlock.of(null),
					});
					return true;
				}

				case 'ArrowUp': {
					const { from } = selected;
					// Move cursor to the line before the block
					const lineStart = view.state.doc.lineAt(from).from;
					const targetPos = Math.max(0, lineStart - 1);
					view.dispatch({
						selection: { anchor: targetPos },
						effects: deselectImageBlock.of(null),
					});
					return true;
				}

				case 'ArrowDown': {
					const { to } = selected;
					// Move cursor to the line after the block
					const doc = view.state.doc;
					const targetPos = Math.min(doc.length, to + 1);
					view.dispatch({
						selection: { anchor: targetPos },
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
