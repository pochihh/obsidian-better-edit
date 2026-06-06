/* eslint-disable obsidianmd/no-nodejs-modules */
import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveDragSourceForBlock } from '../src/features/blocks/block-drag-source';
import type { BlockRange } from '../src/features/blocks/block-model';

interface TestDragSource {
	kind: 'single' | 'multi';
	blocks: BlockRange[];
	from: number;
	to: number;
	lineFrom: number;
	lineTo: number;
	primary: BlockRange;
}

function block(kind: BlockRange['kind'], from: number, to: number, lineFrom: number, lineTo: number): BlockRange {
	return { kind, from, to, contentFrom: from, contentTo: to, lineFrom, lineTo };
}

void test('dragging a visually selected table uses the whole selected table, not the hovered first line', () => {
	const table = block('table', 12, 56, 3, 5);
	const firstRenderedLine = block('paragraph', 12, 24, 3, 3);
	const selectedTable: TestDragSource = {
		kind: 'single',
		blocks: [table],
		from: table.from,
		to: table.to,
		lineFrom: table.lineFrom,
		lineTo: table.lineTo,
		primary: table,
	};
	const firstLineSource: TestDragSource = {
		kind: 'single',
		blocks: [firstRenderedLine],
		from: firstRenderedLine.from,
		to: firstRenderedLine.to,
		lineFrom: firstRenderedLine.lineFrom,
		lineTo: firstRenderedLine.lineTo,
		primary: firstRenderedLine,
	};

	const resolved = resolveDragSourceForBlock(firstRenderedLine, selectedTable, null, firstLineSource);

	assert.equal(resolved, selectedTable);
	assert.equal(resolved.to, table.to);
	assert.equal(resolved.lineTo, table.lineTo);
});
