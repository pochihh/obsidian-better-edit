/* eslint-disable obsidianmd/no-nodejs-modules */
import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveBlockControlPlacement } from '../src/features/blocks/control-placement';

void test('block controls do not reserve editor space and collapse the add button when no gutter exists', () => {
	const placement = resolveBlockControlPlacement({
		contentLeft: 120,
		boundaryLeft: 120,
		showAddButton: true,
	});

	assert.equal(placement.showAddButton, false);
	assert.equal(placement.width, 22);
	assert.equal(placement.left, 98);
});

void test('block controls keep the add button when existing left gutter can fit both buttons', () => {
	const placement = resolveBlockControlPlacement({
		contentLeft: 164,
		boundaryLeft: 120,
		showAddButton: true,
	});

	assert.equal(placement.showAddButton, true);
	assert.equal(placement.width, 44);
	assert.equal(placement.left, 120);
});
