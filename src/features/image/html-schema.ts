/**
 * html-schema.ts
 *
 * Generates and parses the canonical HTML structures used by the image feature.
 * All HTML written to files uses inline styles only — no classes, no external CSS.
 *
 * All filled image blocks carry data-better-edit-image="filled" (or "placeholder")
 * on the outer div. This is the primary detection key — no fragile regex needed.
 *
 * All filled blocks are wrapped in a <div> so Lezer parses them as HTMLBlock
 * (block-level) rather than inline HTMLTag inside a Paragraph.
 * Alignment is controlled by text-align (flow) or float (wrap variants) on the wrapper.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImageAlignment = 'left' | 'center' | 'right' | 'float-left' | 'float-right';

export interface SingleImageBlock {
	kind: 'single';
	src: string;
	width: string;
	alignment: ImageAlignment;
	caption?: string;
}

export interface PlaceholderBlock {
	kind: 'placeholder';
}

export type ImageBlock = SingleImageBlock | PlaceholderBlock;

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Returns the placeholder HTML inserted by the slash command. */
export function placeholderHtml(): string {
	return (
		'<div data-better-edit-image="placeholder" style="border: 2px dashed #ccc; ' +
		'border-radius: 4px; padding: 32px 16px; text-align: center; color: #999; ' +
		'font-size: 0.9em; min-height: 80px;">\n' +
		'  Paste or drop an image here\n' +
		'</div>'
	);
}

/** Returns the outer div style for a given alignment. */
function outerStyleForAlignment(alignment: ImageAlignment): string {
	switch (alignment) {
		case 'left':        return 'text-align: left;';
		case 'center':      return 'text-align: center;';
		case 'right':       return 'text-align: right;';
		case 'float-left':  return 'float: left; margin: 0 16px 12px 0;';
		case 'float-right': return 'float: right; margin: 0 0 12px 16px;';
	}
}

/**
 * Returns HTML for a filled single image, optionally with a caption.
 *
 * @param src       Vault-relative path for the image
 * @param width     CSS width string, e.g. "320px" or "100%"
 * @param alignment Alignment variant
 * @param caption   Optional caption text
 */
export function singleImageHtml(
	src: string,
	width: string,
	alignment: ImageAlignment,
	caption?: string,
): string {
	const outerStyle = outerStyleForAlignment(alignment);

	if (caption) {
		// Caption variant: outer div carries width so caption stays pinned to image
		return (
			`<div data-better-edit-image="filled" style="width: ${width}; ${outerStyle}">\n` +
			`  <img src="${src}" style="width: 100%; max-width: 100%;" />\n` +
			`  <p style="font-size: 0.85em; color: #888; margin: 4px 0 0;">${caption}</p>\n` +
			`</div>`
		);
	}

	// Standard variant: width on the <img>; alignment on the wrapper div
	return (
		`<div data-better-edit-image="filled" style="${outerStyle}">\n` +
		`  <img src="${src}" style="width: ${width}; max-width: 100%;" />\n` +
		`</div>`
	);
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

/**
 * Returns true if the given raw HTML string is an image block managed by this plugin.
 * Uses the data-better-edit-image attribute as the primary detection key.
 */
export function isImageBlock(html: string): boolean {
	return html.includes('data-better-edit-image=');
}

/**
 * Parses a raw HTML string into an ImageBlock descriptor.
 * Returns null if the HTML is not a recognised image block.
 */
export function parseImageBlock(html: string): ImageBlock | null {
	const trimmed = html.trim();

	if (!isImageBlock(trimmed)) return null;

	// Placeholder
	if (trimmed.includes('data-better-edit-image="placeholder"')) {
		return { kind: 'placeholder' };
	}

	// Filled — parse outer div style and inner <img>
	const outerMatch = /^<div\b[^>]*style="([^"]*)"/.exec(trimmed);
	const outerStyle = outerMatch ? (outerMatch[1] ?? '') : '';

	const imgMatch = /\n\s*<img\b[^>]*src="([^"]*)"(?:[^>]*style="([^"]*)")?/.exec(trimmed);
	if (!imgMatch) return null;

	const src = imgMatch[1] ?? '';
	const imgStyle = imgMatch[2] ?? '';
	const alignment = detectAlignment(outerStyle);

	// Width lives on <img> (standard) or outer <div> (caption variant)
	const width =
		extractStyleProp(imgStyle, 'width') ??
		extractStyleProp(outerStyle, 'width') ??
		'100%';

	const captionMatch = /<p\b[^>]*>([\s\S]*?)<\/p>/.exec(trimmed);
	const caption = captionMatch ? (captionMatch[1] ?? undefined) : undefined;

	return { kind: 'single', src, width, alignment, caption };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractStyleProp(style: string, prop: string): string | null {
	const re = new RegExp(`(?:^|;)\\s*${prop}:\\s*([^;]+)`);
	const m = re.exec(style);
	return m ? (m[1] ?? '').trim() : null;
}

function detectAlignment(outerStyle: string): ImageAlignment {
	if (/float:\s*left/.test(outerStyle))  return 'float-left';
	if (/float:\s*right/.test(outerStyle)) return 'float-right';
	const textAlign = extractStyleProp(outerStyle, 'text-align') ?? 'center';
	if (textAlign === 'left')  return 'left';
	if (textAlign === 'right') return 'right';
	return 'center';
}
