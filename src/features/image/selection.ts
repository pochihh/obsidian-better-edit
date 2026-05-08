/**
 * selection.ts
 *
 * CM6 StateField and StateEffects that track which image block (if any) is
 * currently selected. Selection is a { from, to } pair or null.
 *
 * Other parts of the image feature read this field to decide whether to render
 * the selection ring and to know which range to delete on Backspace/Delete.
 */

import { StateEffect, StateField, Transaction } from '@codemirror/state';

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

export interface SelectedImageBlock {
	from: number;
	to: number;
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

/** Dispatched when the user clicks an image block widget. */
export const selectImageBlock = StateEffect.define<SelectedImageBlock>();

/** Dispatched when selection should be cleared (click outside, Escape, doc change). */
export const deselectImageBlock = StateEffect.define<null>();

// ---------------------------------------------------------------------------
// StateField
// ---------------------------------------------------------------------------

export const imageSelectionField = StateField.define<SelectedImageBlock | null>({
	create(): SelectedImageBlock | null {
		return null;
	},

	update(value: SelectedImageBlock | null, tr: Transaction): SelectedImageBlock | null {
		for (const effect of tr.effects) {
			if (effect.is(selectImageBlock))   return effect.value;
			if (effect.is(deselectImageBlock)) return null;
		}
		// Clear selection if the document changed (e.g. the block was deleted externally)
		if (tr.docChanged) return null;
		return value;
	},
});
