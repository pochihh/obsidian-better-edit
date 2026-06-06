/* eslint-disable obsidianmd/no-nodejs-modules */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
	DEFAULT_ROW_IMAGE_WIDTH,
	imageRowHtml,
	imageRowReplacementWidth,
	parseImageBlock,
	parseImageRowBlock,
	placeholderHtml,
	singleImageHtml,
} from '../src/features/image/html-schema';

void test('single image HTML carries portable block alignment without plugin CSS', () => {
	const centered = singleImageHtml('demo-canyon.svg', '240px', 'center');
	assert.match(centered, /style="width: 240px; max-width: 100%; margin: 0 auto; text-align: center;"/);
	assert.match(centered, /<img\b[^>]*style="width: 100%; max-width: 100%; display: block; border-radius: 4px;"/);
	assert.equal(parseImageBlock(centered)?.kind, 'single');
	assert.deepEqual(parseImageBlock(centered), {
		kind: 'single',
		src: 'demo-canyon.svg',
		width: '240px',
		alignment: 'center',
		caption: undefined,
		captionHidden: undefined,
		alt: undefined,
		crop: undefined,
	});

	const rightAligned = singleImageHtml('demo-canyon.svg', '240px', 'right');
	assert.match(rightAligned, /margin-left: auto; text-align: right;/);
	assert.equal(parseImageBlock(rightAligned)?.kind, 'single');
});

void test('image row HTML carries portable flex item styles on every child', () => {
	const row = imageRowHtml([
		{ kind: 'single', src: 'demo-canyon.svg', width: '220px', alignment: 'center' },
		{ kind: 'placeholder' },
	], 8, 'center', 'wrap', 'flex-start');

	assert.match(row, /display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-start; justify-content: center;/);
	assert.match(row, /data-better-edit-image="filled" style="width: 220px; max-width: 100%; flex: 0 0 auto; text-align: center;"/);
	assert.match(row, /data-better-edit-image="placeholder" style="[^"]*flex: 0 0 auto;/);
	assert.doesNotMatch(row, /<div data-better-edit-image="placeholder"><\/div>/);

	const parsed = parseImageRowBlock(row);
	assert.ok(parsed);
	assert.equal(parsed.images.length, 2);
	assert.equal(parsed.images[0]?.kind, 'single');
	assert.equal(parsed.images[1]?.kind, 'placeholder');
});

void test('cropped row images parse back with row-safe center alignment', () => {
	const row = imageRowHtml([
		{
			kind: 'single',
			src: 'demo-canyon.svg',
			width: '220px',
			alignment: 'center',
			crop: { offsetX: 10, offsetY: 12, height: 140, imgWidth: 280 },
		},
	], 8, 'flex-start', 'wrap', 'flex-start');

	const parsed = parseImageRowBlock(row);
	const image = parsed?.images[0];
	assert.equal(image?.kind, 'single');
	if (image?.kind !== 'single') return;
	assert.equal(image.alignment, 'center');
	assert.deepEqual(image.crop, { offsetX: 10, offsetY: 12, height: 140, imgWidth: 280 });
});

void test('placeholder HTML is visible and still parses as a placeholder', () => {
	const placeholder = placeholderHtml();
	assert.match(placeholder, /Paste or drop an image here/);
	assert.match(placeholder, /data-better-edit-image="placeholder" style="/);
	assert.deepEqual(parseImageBlock(placeholder), { kind: 'placeholder' });
});

void test('row placeholder replacement uses a row-safe width', () => {
	assert.equal(
		imageRowReplacementWidth([{ kind: 'placeholder' }], 0, '100%'),
		DEFAULT_ROW_IMAGE_WIDTH,
	);

	assert.equal(
		imageRowReplacementWidth([
			{ kind: 'single', src: 'left.svg', width: '180px', alignment: 'center' },
			{ kind: 'placeholder' },
			{ kind: 'single', src: 'right.svg', width: '260px', alignment: 'center' },
		], 1, '100%'),
		'180px',
	);

	assert.equal(
		imageRowReplacementWidth([{ kind: 'placeholder' }], 0, '320px'),
		'320px',
	);

	assert.equal(
		imageRowReplacementWidth([
			{ kind: 'single', src: 'left.svg', width: '33%', alignment: 'center' },
			{ kind: 'placeholder' },
		], 1, '100%'),
		'33%',
	);
});
