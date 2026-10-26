/* eslint-disable obsidianmd/no-nodejs-modules */
import test from 'node:test';
import assert from 'node:assert/strict';
import { findLinkAtRange } from '../src/features/text-styling/link-context';

void test('editing a wiki-link label or destination identifies the whole link', () => {
	const source = 'Before [[Folder/Note#Heading|New idea]] after';
	for (const text of ['New idea', 'idea', 'Folder/Note', '[[Folder/Note#Heading|New idea]]']) {
		const from = source.indexOf(text);
		assert.deepEqual(findLinkAtRange(source, from, from + text.length), {
			from: 7, to: source.indexOf(' after'), mode: 'page',
			target: 'Folder/Note#Heading', text: 'New idea',
		});
	}
	assert.equal(findLinkAtRange('[[New idea]]', 4, 4)?.text, 'New idea');
	assert.equal(findLinkAtRange('[[#Heading|Label]]', 11, 14)?.target, '#Heading');
});

void test('Markdown links keep nested URL parentheses, formatted labels, and optional titles', () => {
	const source = 'Before [**New [idea]**](https://example.com/a(b(c)) "A title)") after';
	const from = source.indexOf('idea');
	assert.deepEqual(findLinkAtRange(source, from, from + 4), {
		from: 7, to: source.indexOf(' after'), mode: 'url',
		target: 'https://example.com/a(b(c))', text: '**New [idea]**',
		suffix: ' "A title)"', angleTarget: false,
	});
	assert.equal(findLinkAtRange('[New idea]()', 1, 9)?.target, '');
	assert.equal(findLinkAtRange('[New idea](<a path with spaces>)', 1, 9)?.target, 'a path with spaces');
	assert.equal(findLinkAtRange('[New idea](<a path with spaces>)', 1, 9)?.angleTarget, true);
	assert.equal(findLinkAtRange('[New idea](a\\(b\\))', 1, 9)?.target, 'a\\(b\\)');
});

void test('plain text, images, code, incomplete links, and selections spanning links are not edited as one link', () => {
	for (const source of ['New idea', '![[New idea]]', '![New idea](image.webp)', '`[[New idea]]`', '\\[[New idea]]', '[New idea](missing', '[[New idea]', '[New idea][ref]']) {
		const from = source.indexOf('New idea');
		assert.equal(findLinkAtRange(source, from, from + 8), null, source);
	}
	const source = '[[First]] and [[Second]]';
	assert.equal(findLinkAtRange(source, 2, 21), null);
	assert.equal(findLinkAtRange(source, 9, 9), null);
	assert.equal(findLinkAtRange('[[Incomplete] then [[Valid]]', 21, 26)?.target, 'Valid');
});
