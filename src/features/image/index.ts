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
import { EditorSelection, EditorState, Extension, Prec } from '@codemirror/state';
import { App, editorLivePreviewField } from 'obsidian';
import { registerPasteDropHandlers } from './paste-handler';
import { createImageDecorationField, createImageWidgetExtension, imageFeatureEnabledEffect } from './widget';
import { parseImageBlock, findBlockEnd } from './html-schema';
import { imageSelectionField, deselectImageBlock } from './selection';
import type BetterEditPlugin from '../../main';

export function initImageFeature(plugin: BetterEditPlugin): void {
	registerPasteDropHandlers(plugin);
}

/** Dispatches an effect to all open editors so image decorations recompute immediately. */
export function refreshImageDecorations(app: App): void {
	app.workspace.iterateAllLeaves(leaf => {
		const cm: EditorView | undefined = (leaf.view as any)?.editor?.cm;
		if (cm instanceof EditorView) {
			cm.dispatch({ effects: imageFeatureEnabledEffect.of(true) });
		}
	});
}

export function createImageExtension(plugin: BetterEditPlugin): Extension {
	return [
		imageSelectionField,
		Prec.highest(createImageDecorationField(plugin)), // Must win over Obsidian's native HTML embed decoration.
		createImageWidgetExtension(plugin),   // ViewPlugin — mousedown handler only
		Prec.highest(buildSelectionGuardExtension()),
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
				const selected = getSelectedImage(view.state);
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
				const selected = getSelectedImage(view.state);
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
				const selected = getSelectedImage(view.state);
				if (selected === null) return false;

				view.dispatch({
					selection: { anchor: previousTextBoundary(view.state, selected.from) },
					effects: deselectImageBlock.of(null),
				});
				return true;
			},
		},
		{
			key: 'ArrowLeft',
			preventDefault: true,
			run(view: EditorView): boolean {
				const selected = getSelectedImage(view.state);
				if (selected === null) return false;

				view.dispatch({
					selection: { anchor: previousTextBoundary(view.state, selected.from) },
					effects: deselectImageBlock.of(null),
				});
				return true;
			},
		},
		{
			key: 'ArrowRight',
			preventDefault: true,
			run(view: EditorView): boolean {
				const selected = getSelectedImage(view.state);
				if (selected === null) return false;

				view.dispatch({
					selection: { anchor: nextTextBoundary(view.state, selected.to) },
					effects: deselectImageBlock.of(null),
				});
				return true;
			},
		},
		{
			key: 'ArrowDown',
			preventDefault: true,
			run(view: EditorView): boolean {
				const selected = getSelectedImage(view.state);
				if (selected === null) return false;

				view.dispatch({
					selection: { anchor: nextTextBoundary(view.state, selected.to) },
					effects: deselectImageBlock.of(null),
				});
				return true;
			},
		},
	]);
}

function buildSelectionGuardExtension(): Extension {
	return EditorState.transactionFilter.of(tr => {
		if (!tr.selection) return tr;
		if (!tr.state.field(editorLivePreviewField, false)) return tr;

		const nextSelection = tr.newSelection.main;
		if (!nextSelection.empty) return tr;

		const pos = nextSelection.from;
		for (const range of findManagedImageRanges(tr.state)) {
			if (pos <= range.from || pos >= range.to) continue;

			const previousPos = tr.startState.selection.main.from;
			const boundary =
				previousPos <= range.from ? range.from :
				previousPos >= range.to ? range.to :
				pos - range.from <= range.to - pos ? range.from : range.to;

			return [tr, { selection: EditorSelection.single(boundary) }];
		}

		return tr;
	});
}

function deleteSelectedImage(view: EditorView): boolean {
	const selected = getSelectedImage(view.state);
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

function previousTextBoundary(state: EditorState, from: number): number {
	return Math.max(0, state.doc.lineAt(from).from - 1);
}

function nextTextBoundary(state: EditorState, to: number): number {
	if (to < state.doc.length && state.doc.sliceString(to, to + 1) === '\n') {
		return Math.min(state.doc.length, to + 1);
	}
	return to;
}

function getSelectedImage(state: EditorState) {
	return state.field(imageSelectionField, false) ?? null;
}

function findManagedImageRanges(state: EditorState): Array<{ from: number; to: number }> {
	const ranges: Array<{ from: number; to: number }> = [];
	const fullText = state.doc.toString();
	const openMarker = '<div data-better-edit-image=';
	let searchFrom = 0;

	while (true) {
		const openIdx = fullText.indexOf(openMarker, searchFrom);
		if (openIdx === -1) break;

		const blockEnd = findBlockEnd(fullText, openIdx);
		if (blockEnd === -1) break;

		const rawHtml = fullText.slice(openIdx, blockEnd);
		if (parseImageBlock(rawHtml)) {
			ranges.push({ from: openIdx, to: blockEnd });
		}
		searchFrom = blockEnd;
	}

	return ranges;
}
