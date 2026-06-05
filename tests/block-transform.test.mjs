import assert from 'node:assert/strict';
import test from 'node:test';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url);
const {
	canTurnIntoSource,
	duplicateBlockText,
	turnBlockTextInto,
} = await jiti.import('../src/features/blocks/block-transform.ts');

test('turns a nested ordered list into nested checkboxes while preserving indentation', () => {
	const source = '1. Task A\n   1. Subtask A1\n   2. Subtask A2\n2. Task B';

	assert.equal(
		turnBlockTextInto(source, 'checkbox'),
		'- [ ] Task A\n   - [ ] Subtask A1\n   - [ ] Subtask A2\n- [ ] Task B',
	);
});

test('turns normal fenced code into bullets line by line', () => {
	const source = '```\nTask A\n  Subtask A1\nTask B\n```';

	assert.equal(
		turnBlockTextInto(source, 'bullet-list'),
		'- Task A\n  - Subtask A1\n- Task B',
	);
});

test('treats math blocks like code blocks for turn into', () => {
	const source = '$$\na^2 + b^2 = c^2\nsecond line\n$$';

	assert.equal(
		turnBlockTextInto(source, 'numbered-list'),
		'1. a^2 + b^2 = c^2\n1. second line',
	);
});

test('turns mixed simple blocks into one code block by stripping markers', () => {
	const source = '# Heading\n- item\n- [x] done';

	assert.equal(
		turnBlockTextInto(source, 'code-block'),
		'```\nHeading\nitem\ndone\n```',
	);
});

test('uses a longer code fence when content contains backticks', () => {
	const source = 'paragraph with ``` inside';

	assert.equal(
		turnBlockTextInto(source, 'code-block'),
		'````\nparagraph with ``` inside\n````',
	);
});

test('refuses unsupported structural sources for turn into', () => {
	assert.equal(canTurnIntoSource('| A | B |\n|---|---|\n| 1 | 2 |'), false);
	assert.equal(canTurnIntoSource('![[image.png]]'), false);
	assert.equal(canTurnIntoSource('```dataview\nTABLE file.name\n```'), false);
	assert.equal(canTurnIntoSource('<details>\n<summary>More</summary>\ntext\n</details>'), false);
	assert.equal(canTurnIntoSource('<!-- generated -->'), false);
});

test('duplicates block text with a newline separator', () => {
	assert.equal(duplicateBlockText('hello'), 'hello\nhello');
	assert.equal(duplicateBlockText('hello\n'), 'hello\nhello\n');
});
