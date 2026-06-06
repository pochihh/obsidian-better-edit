/* eslint-disable obsidianmd/no-nodejs-modules */
import test from 'node:test';
import assert from 'node:assert/strict';

import { EditorState } from '@codemirror/state';

import {
	allowBlankLineDropBoundary,
	duplicateBlockTextForSource,
	tableSafeTextForDrop,
	type BlockSpacingKind,
} from '../src/features/blocks/block-spacing';
import { getBlockAtPos } from '../src/features/blocks/block-model';

void test('dropping a table after another table inserts a blank line above so Obsidian does not merge them', () => {
	const table = '| A | B |\n|---|---|\n| 1 | 2 |';

	const normalized = tableSafeTextForDrop(table, {
		firstBlockKind: 'table',
		lastBlockKind: 'table',
		previousBlockKind: 'table',
		nextBlockKind: null,
	});

	assert.equal(normalized, `\n${table}`);
});

void test('dropping a table before another table reuses the existing blank line above the target', () => {
	const table = '\n| C | D |\n|---|---|\n| 1 | 2 |';

	const normalized = tableSafeTextForDrop(table, {
		firstBlockKind: 'table',
		lastBlockKind: 'table',
		previousBlockKind: 'paragraph',
		nextBlockKind: 'table',
		hasBlankLineBeforeTarget: true,
	});

	assert.equal(normalized, '| C | D |\n|---|---|\n| 1 | 2 |\n\n');
});

void test('dropping a paragraph before a table strips source-leading newline and adds a table separator', () => {
	const normalized = tableSafeTextForDrop('\nMove me', {
		firstBlockKind: 'paragraph',
		lastBlockKind: 'paragraph',
		previousBlockKind: 'paragraph',
		nextBlockKind: 'table',
		hasBlankLineBeforeTarget: true,
	});

	assert.equal(normalized, 'Move me\n\n');
});

void test('dropping a table before another table leaves a blank line below so Obsidian does not merge them', () => {
	const table = '| A | B |\n|---|---|\n| 1 | 2 |';

	const normalized = tableSafeTextForDrop(table, {
		firstBlockKind: 'table',
		lastBlockKind: 'table',
		previousBlockKind: null,
		nextBlockKind: 'table',
	});

	assert.equal(normalized, `${table}\n\n`);
});

void test('copying a table block inserts a whitespace spacer line between the copy and the original', () => {
	const table = '| A | B |\n|---|---|\n| 1 | 2 |';

	const duplicated = duplicateBlockTextForSource(table, {
		firstBlockKind: 'table',
		lastBlockKind: 'table',
	});

	assert.equal(duplicated, `${table}\n \n${table}`);
});

void test('copying a table preserves a whitespace spacer even when the moved slice includes trailing line breaks', () => {
	const table = '| A | B |\n|---|---|\n| 1 | 2 |\n';

	const duplicated = duplicateBlockTextForSource(table, {
		firstBlockKind: 'table',
		lastBlockKind: 'table',
	});

	assert.equal(duplicated, '| A | B |\n|---|---|\n| 1 | 2 |\n \n| A | B |\n|---|---|\n| 1 | 2 |\n');
});

void test('non-table block copy keeps the existing duplicate behavior', () => {
	const paragraph = 'Alpha\n';
	const sourceKinds: { firstBlockKind: BlockSpacingKind; lastBlockKind: BlockSpacingKind } = {
		firstBlockKind: 'paragraph',
		lastBlockKind: 'paragraph',
	};

	assert.equal(duplicateBlockTextForSource(paragraph, sourceKinds), 'Alpha\nAlpha\n');
});

void test('table drag does not offer separate drop targets on spacer lines adjacent to tables', () => {
	assert.equal(allowBlankLineDropBoundary({
		firstBlockKind: 'table',
		lastBlockKind: 'table',
		previousBlockKind: 'paragraph',
		nextBlockKind: 'table',
	}), false);
	assert.equal(allowBlankLineDropBoundary({
		firstBlockKind: 'table',
		lastBlockKind: 'table',
		previousBlockKind: 'table',
		nextBlockKind: 'table',
	}), false);
});

void test('table drag can still use ordinary spacer lines that are not adjacent to tables', () => {
	assert.equal(allowBlankLineDropBoundary({
		firstBlockKind: 'table',
		lastBlockKind: 'table',
		previousBlockKind: 'paragraph',
		nextBlockKind: 'paragraph',
	}), true);
});

void test('a pipe table without a preceding blank line is treated as paragraph text, not a table block', () => {
	const state = EditorState.create({
		doc: 'Before paragraph\n| A   | B   |\n| --- | --- |\n| 1   | 2   |',
	});
	const secondLine = state.doc.line(2);

	const block = getBlockAtPos(state, secondLine.from, { enableHtmlBlockDrag: true, enableListItemDrag: true });

	assert.equal(block?.kind, 'paragraph');
	assert.equal(block?.lineFrom, 2);
	assert.equal(block?.lineTo, 2);
});

void test('a pipe table after a blank line is still treated as one table block', () => {
	const state = EditorState.create({
		doc: 'Before paragraph\n\n| A   | B   |\n| --- | --- |\n| 1   | 2   |',
	});
	const tableHeader = state.doc.line(3);

	const block = getBlockAtPos(state, tableHeader.from, { enableHtmlBlockDrag: true, enableListItemDrag: true });

	assert.equal(block?.kind, 'table');
	assert.equal(block?.lineFrom, 3);
	assert.equal(block?.lineTo, 5);
});
