/**
 * index.ts — Image Arrangement feature entry point
 *
 * Registers:
 *  - paste/drop handlers (via registerEvent)
 *  - CM6 extensions: imageSelectionField, widget ViewPlugin, mousedown handler,
 *    keydown handler
 */

import { EditorView } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { registerPasteDropHandlers } from './paste-handler';
import { createImageWidgetExtension } from './widget';
import { imageSelectionField, selectImageBlock, deselectImageBlock } from './selection';
import type BetterEditPlugin from '../../main';

export function initImageFeature(plugin: BetterEditPlugin): void {
	registerPasteDropHandlers(plugin);
}

export function createImageExtension(plugin: BetterEditPlugin): Extension {
	return [
		imageSelectionField,
		createImageWidgetExtension(plugin),
		buildMousedownExtension(),
		buildKeydownExtension(),
	];
}

// ---------------------------------------------------------------------------
// Mousedown handler — intercepts clicks on image widgets inside CM6's own
// event pipeline. Returning true tells CM6 the event is fully handled, which
// prevents cursor positioning and Obsidian's source-reveal from triggering.
// ---------------------------------------------------------------------------

function buildMousedownExtension(): Extension {
	// Shared handler — intercepts both mousedown and click so nothing slips through
	function handleImageClick(event: MouseEvent, view: EditorView): boolean {
		const target = event.target as Element;
		const widget = target.closest('[data-be-from]');
		if (!widget) return false;

		const el   = widget as HTMLElement;
		const from = parseInt(el.dataset.beFrom ?? '', 10);
		const to   = parseInt(el.dataset.beTo   ?? '', 10);
		if (isNaN(from) || isNaN(to)) return false;

		event.preventDefault();

		// Place cursor one character AFTER the block — unambiguously outside the
		// HTML block range, so Obsidian's source-reveal never triggers.
		const safePos = Math.min(to + 1, view.state.doc.length);
		view.dispatch({
			selection: { anchor: safePos },
			effects: selectImageBlock.of({ from, to }),
		});

		return true; // tells CM6: event fully handled, skip cursor positioning
	}

	return EditorView.domEventHandlers({
		mousedown: handleImageClick,
		click:     handleImageClick,
	});
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
					// Consume trailing newline so we don't leave a blank line
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
