import assert from 'node:assert/strict';
import test from 'node:test';
import { EditorState } from '@codemirror/state';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url);
const { getBlockAtPos } = await jiti.import('../src/features/blocks/block-model.ts');

const options = { enableListItemDrag: true, enableHtmlBlockDrag: false };

test('detects a dollar math block as one block', () => {
	const state = EditorState.create({ doc: 'before\n\n$$\na^2+b^2=c^2\nsecond\n$$\n\nafter' });
	const posInsideMath = state.doc.line(4).from;

	const block = getBlockAtPos(state, posInsideMath, options);

	assert.equal(block?.kind, 'math');
	assert.equal(block?.lineFrom, 3);
	assert.equal(block?.lineTo, 6);
});
