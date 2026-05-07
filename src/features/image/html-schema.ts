/**
 * html-schema.ts
 *
 * Generates and parses the canonical HTML structures used by the image feature.
 * All HTML written to files uses inline styles only — no classes, no external CSS.
 *
 * All filled image blocks are wrapped in a <div> so Lezer parses them as HTMLBlock
 * (block-level) rather than inline HTMLTag inside a Paragraph. Alignment is
 * controlled by text-align (flow) or float (wrap variants) on the wrapper div.
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

/** Returns the outer div style string for a given alignment. */
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
	if (caption) {
		// Caption variant: outer div carries the width so the caption stays pinned to the image
		const outerStyle = outerStyleForAlignment(alignment);
		return (
			`<div style="width: ${width}; ${outerStyle}">\n` +
			`  <img src="${src}" style="width: 100%; max-width: 100%;" />\n` +
			`  <p style="font-size: 0.85em; color: #888; margin: 4px 0 0;">${caption}</p>\n` +
			`</div>`
		);
	}

	// Standard variant: width lives on the <img>; alignment on the wrapper div
	const outerStyle = outerStyleForAlignment(alignment);
	return (
		`<div style="${outerStyle}">\n` +
		`  <img src="${src}" style="width: ${width}; max-width: 100%;" />\n` +
		`</div>`
	);
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

/**
 * Returns true if the given raw HTML string is an image block managed by this plugin.
 */
export function isImageBlock(html: string): boolean {
	const trimmed = html.trim();
	if (trimmed.startsWith('<div data-placeholder="image"')) return true;
	// Any <div> that directly contains an <img> as first child
	if (/^<div\b[^>]*>\s*\n\s*<img\b/.test(trimmed)) return true;
	// Legacy: bare <img> with display:block (pre-div-wrapper format)
	if (/^<img\b[^>]*style="[^"]*display:\s*block/.test(trimmed)) return true;
	return false;
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

	// Div-wrapped (current format)
	const outerMatch = /^<div\b[^>]*style="([^"]*)"/.exec(trimmed);
	if (outerMatch) {
		const outerStyle = outerMatch[1] ?? '';
		// Match <img src="..." style="..."> or <img src="..."> (no style attr)
		const imgMatch = /\n\s*<img\b[^>]*src="([^"]*)"(?:[^>]*style="([^"]*)")?/.exec(trimmed);
		if (imgMatch) {
			const src = imgMatch[1] ?? '';
			const imgStyle = imgMatch[2] ?? '';
			const alignment = detectAlignment(outerStyle);
			// Width: on <img> for no-caption format, on outer <div> for caption format
			const width =
				extractStyleProp(imgStyle, 'width') ??
				extractStyleProp(outerStyle, 'width') ??
				'100%';
			const captionMatch = /<p\b[^>]*>([\s\S]*?)<\/p>/.exec(trimmed);
			const caption = captionMatch ? (captionMatch[1] ?? undefined) : undefined;
			return { kind: 'single', src, width, alignment, caption };
		}
	}

	// Legacy: bare <img> without wrapper div
	const bareImg = /^<img\b[^>]*src="([^"]*)"[^>]*style="([^"]*)"/.exec(trimmed);
	if (bareImg) {
		const src = bareImg[1] ?? '';
		const style = bareImg[2] ?? '';
		const width = extractStyleProp(style, 'width') ?? '100%';
		const alignment = detectAlignmentLegacy(style);
		return { kind: 'single', src, width, alignment };
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

/** Detect alignment from the outer wrapper div style (current format). */
function detectAlignment(outerStyle: string): ImageAlignment {
	if (/float:\s*left/.test(outerStyle))  return 'float-left';
	if (/float:\s*right/.test(outerStyle)) return 'float-right';
	const textAlign = extractStyleProp(outerStyle, 'text-align') ?? 'center';
	if (textAlign === 'left')  return 'left';
	if (textAlign === 'right') return 'right';
	return 'center';
}

/** Detect alignment from a bare <img> style attr (legacy format). */
function detectAlignmentLegacy(imgStyle: string): ImageAlignment {
	if (/float:\s*left/.test(imgStyle))  return 'float-left';
	if (/float:\s*right/.test(imgStyle)) return 'float-right';
	const margin = extractStyleProp(imgStyle, 'margin') ?? '';
	if (/0\s+auto\s+0\s+0/.test(margin)) return 'left';
	if (/0\s+0\s+0\s+auto/.test(margin)) return 'right';
	return 'center';
}
