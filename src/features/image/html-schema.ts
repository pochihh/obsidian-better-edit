/**
 * html-schema.ts
 *
 * Generates and parses the canonical HTML structures used by the image feature.
 * All HTML written to files uses inline styles only — no classes, no external CSS.
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
		'<div data-placeholder="image" style="border: 2px dashed #ccc; border-radius: 4px; ' +
		'padding: 32px 16px; text-align: center; color: #999; font-size: 0.9em; min-height: 80px;">\n' +
		'  Paste or drop an image here\n' +
		'</div>'
	);
}

/** Returns the margin style string for a given alignment. */
function marginForAlignment(alignment: ImageAlignment): string {
	switch (alignment) {
		case 'left':       return 'margin: 0 auto 0 0;';
		case 'center':     return 'margin: 0 auto;';
		case 'right':      return 'margin: 0 0 0 auto;';
		case 'float-left': return 'float: left; margin: 0 16px 12px 0;';
		case 'float-right': return 'float: right; margin: 0 0 12px 16px;';
	}
}

/**
 * Returns HTML for a filled single image, optionally wrapped in a caption div.
 *
 * @param src       Vault-relative path or app:// URL for the image
 * @param width     CSS width string, e.g. "320px" or "100%"
 * @param alignment Alignment variant
 * @param caption   Optional caption text; if provided wraps in a figure-like div
 */
export function singleImageHtml(
	src: string,
	width: string,
	alignment: ImageAlignment,
	caption?: string,
): string {
	const margin = marginForAlignment(alignment);

	if (caption) {
		// Wrapped variant: outer div controls width + centering; img fills it
		const outerMargin = alignment === 'float-left'
			? 'float: left; margin: 0 16px 12px 0;'
			: alignment === 'float-right'
				? 'float: right; margin: 0 0 12px 16px;'
				: alignment === 'left'
					? 'margin: 0 auto 0 0;'
					: alignment === 'right'
						? 'margin: 0 0 0 auto;'
						: 'margin: 0 auto;';

		return (
			`<div style="width: ${width}; ${outerMargin}">\n` +
			`  <img src="${src}" style="width: 100%; display: block;" />\n` +
			`  <p style="font-size: 0.85em; color: #888; margin: 4px 0 0; text-align: center;">${caption}</p>\n` +
			`</div>`
		);
	}

	return `<img src="${src}" style="width: ${width}; display: block; ${margin}" />`;
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

/**
 * Returns true if the given raw HTML string is an image block managed by this plugin.
 * Matches both placeholder divs and bare <img> tags with our inline style pattern.
 */
export function isImageBlock(html: string): boolean {
	const trimmed = html.trim();
	return (
		trimmed.startsWith('<div data-placeholder="image"') ||
		/^<img\s[^>]*style="[^"]*display:\s*block/.test(trimmed) ||
		/^<div\s[^>]*style="[^"]*width:[^"]*">\s*\n\s*<img/.test(trimmed)
	);
}

/**
 * Parses a raw HTML string into an ImageBlock descriptor.
 * Returns null if the HTML is not a recognised image block.
 */
export function parseImageBlock(html: string): ImageBlock | null {
	const trimmed = html.trim();

	// Placeholder
	if (trimmed.startsWith('<div data-placeholder="image"')) {
		return { kind: 'placeholder' };
	}

	// Bare <img> — extract src, width, alignment
	const bareImg = /^<img\s[^>]*src="([^"]*)"[^>]*style="([^"]*)"/.exec(trimmed);
	if (bareImg) {
		const src = bareImg[1] ?? '';
		const style = bareImg[2] ?? '';
		const width = extractStyleProp(style, 'width') ?? '100%';
		const alignment = detectAlignment(style);
		return { kind: 'single', src, width, alignment };
	}

	// Wrapped (with caption)
	const wrappedOuter = /^<div\s[^>]*style="([^"]*)"/.exec(trimmed);
	if (wrappedOuter) {
		const outerStyle = wrappedOuter[1] ?? '';
		const imgSrc = /\n\s*<img\s[^>]*src="([^"]*)"/.exec(trimmed);
		const captionMatch = /<p\s[^>]*>([^<]*)<\/p>/.exec(trimmed);
		if (imgSrc) {
			const src = imgSrc[1] ?? '';
			const width = extractStyleProp(outerStyle, 'width') ?? '100%';
			const alignment = detectAlignment(outerStyle);
			const caption = captionMatch ? (captionMatch[1] ?? undefined) : undefined;
			return { kind: 'single', src, width, alignment, caption };
		}
	}

	return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractStyleProp(style: string, prop: string): string | null {
	const re = new RegExp(`(?:^|;)\\s*${prop}:\\s*([^;]+)`);
	const m = re.exec(style);
	return m ? (m[1] ?? '').trim() : null;
}

function detectAlignment(style: string): ImageAlignment {
	if (/float:\s*left/.test(style))  return 'float-left';
	if (/float:\s*right/.test(style)) return 'float-right';
	const margin = extractStyleProp(style, 'margin') ?? '';
	if (/0\s+auto\s+0\s+0/.test(margin)) return 'left';
	if (/0\s+0\s+0\s+auto/.test(margin)) return 'right';
	return 'center'; // default: "0 auto" or anything else
}
