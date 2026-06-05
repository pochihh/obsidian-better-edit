/* eslint-disable obsidianmd/no-nodejs-modules */
import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import { readFileSync } from 'node:fs';

import { orderImageDragChanges } from '../src/features/image/drag-changes';
import { findBlockEnd, imageRowHtml, parseImageBlock, parseImageRowBlock } from '../src/features/image/html-schema';

void test('row image drag changes are ordered before CodeMirror applies them', () => {
	const doc = 'aaaa\nbbbb\ncccc\ndddd';
	const state = EditorState.create({ doc });
	const sourceReplacement = { from: 5, to: 9, insert: 'bb' };
	const laterTargetReplacement = { from: 15, to: 19, insert: 'DDDDDD' };

	const ordered = orderImageDragChanges([laterTargetReplacement, sourceReplacement]);
	assert.deepEqual(ordered, [sourceReplacement, laterTargetReplacement]);

	const transaction = state.update({ changes: ordered });
	assert.equal(transaction.newDoc.toString(), 'aaaa\nbb\ncccc\nDDDDDD');
});

void test('dragging an image out of a row onto a later placeholder keeps both resulting blocks valid', () => {
	const original = readFileSync('test-results/toby_test_original.md', 'utf8').replace(/\r\n/g, '\n');
	const rowFrom = original.indexOf('<div data-better-edit-image-row');
	const rowTo = findBlockEnd(original, rowFrom);
	const rowBlock = parseImageRowBlock(original.slice(rowFrom, rowTo));
	assert.ok(rowBlock);

	const movedBlock = rowBlock.images[1];
	assert.equal(movedBlock?.kind, 'single');
	const sourceImages = [...rowBlock.images];
	sourceImages.splice(1, 1);

	const targetFrom = original.indexOf('<div data-better-edit-image="placeholder"></div>', rowTo);
	const targetTo = findBlockEnd(original, targetFrom);
	const targetBlock = parseImageBlock(original.slice(targetFrom, targetTo));
	assert.equal(targetBlock?.kind, 'placeholder');

	const remainingRowHtml = imageRowHtml(sourceImages, rowBlock.gap, rowBlock.justify, rowBlock.wrap, rowBlock.alignItems);
	const targetRowHtml = imageRowHtml([movedBlock, targetBlock], 8, 'flex-start', 'wrap', 'flex-start');
	const transaction = EditorState.create({ doc: original }).update({
		changes: orderImageDragChanges([
			{ from: targetFrom, to: targetTo, insert: targetRowHtml },
			{ from: rowFrom, to: rowTo, insert: remainingRowHtml },
		]),
	});
	const next = transaction.newDoc.toString();

	assert.equal((next.match(/data-better-edit-image-row/g) ?? []).length, 2);
	assert.ok(next.includes('Aurora study'));
	assert.ok(next.includes('Canyon study'));
	assert.doesNotMatch(next, /<div data-better-edit-image="placeholder"><\/div>>/);
	assert.ok(parseImageRowBlock(next.slice(next.indexOf('<div data-better-edit-image-row'), findBlockEnd(next, next.indexOf('<div data-better-edit-image-row')))));
});
