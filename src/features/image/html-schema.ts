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

export interface ImageCrop {
	offsetX: number;        // px — image shifted left (margin-left: -offsetX px)
	offsetY: number;        // px — image shifted up (margin-top: -offsetY px)
	height: number;         // px — visible crop window height
	imgWidth: number;       // px — full rendered image width inside the crop context
	shape?: 'circle';       // if set, renders with border-radius: 50%
}

export interface SingleImageBlock {
	kind: 'single';
	src: string;
	width: string;     // px — crop window width (or display width when no crop)
	alignment: ImageAlignment;
	caption?: string;       // undefined = caption never created; string (incl. '') = caption exists
	captionHidden?: boolean; // true = caption created but toggled off; text preserved in HTML
	alt?: string;
	crop?: ImageCrop;
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
	return '<div data-better-edit-image="placeholder"></div>';
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

/** Alignment style for the crop wrapper div (no overflow — that lives on the inner clip div). */
function cropWrapperStyle(alignment: ImageAlignment): string {
	switch (alignment) {
		case 'left':        return '';
		case 'center':      return 'margin: 0 auto;';
		case 'right':       return 'margin-left: auto;';
		case 'float-left':  return 'float: left; margin: 0 16px 12px 0;';
		case 'float-right': return 'float: right; margin: 0 0 12px 16px;';
	}
}

/** Inline style for the crop clip div (overflow:hidden + shape). */
function cropClipStyle(height: number, circle: boolean, cornerRadius = 0): string {
	const radius = circle ? ' border-radius: 50%;' : (cornerRadius > 0 ? ` border-radius: ${cornerRadius}px;` : '');
	return `overflow: hidden; height: ${height}px;${radius}`;
}

export function singleImageHtml(
	src: string,
	width: string,
	alignment: ImageAlignment,
	caption?: string,
	crop?: ImageCrop,
	alt?: string,
	cornerRadius = 4,
	captionHidden = false,
): string {
	const altAttr = alt ? ` alt="${escapeHtmlAttr(alt)}"` : '';
	const radiusStyle = cornerRadius > 0 ? ` border-radius: ${cornerRadius}px;` : '';
	const captionHtml = caption !== undefined
		? `  <p style="${captionHidden ? 'display: none; ' : ''}font-size: 0.85em; color: #888; margin: 4px 0 0;">${caption}</p>\n`
		: '';

	if (crop) {
		// Two-div structure: outer div = width + alignment, inner div = clip mask.
		// Caption sits between them so overflow:hidden on the inner div never clips it.
		const wrapperStyle = cropWrapperStyle(alignment);
		const clipStyle = cropClipStyle(crop.height, crop.shape === 'circle', cornerRadius);
		const wrapperAttr = wrapperStyle ? ` style="width: ${width}; ${wrapperStyle}"` : ` style="width: ${width};"`;
		return (
			`<div data-better-edit-image="filled"${wrapperAttr}>\n` +
			`  <div style="${clipStyle}">\n` +
			`    <img src="${src}"${altAttr} style="width: ${crop.imgWidth}px; max-width: none; margin-left: -${crop.offsetX}px; margin-top: -${crop.offsetY}px; display: block;" />\n` +
			`  </div>\n` +
			captionHtml +
			`</div>`
		);
	}

	const outerStyle = outerStyleForAlignment(alignment);

	return (
		`<div data-better-edit-image="filled" style="width: ${width}; ${outerStyle}">\n` +
		`  <img src="${src}"${altAttr} style="width: 100%; max-width: 100%;${radiusStyle}" />\n` +
		captionHtml +
		`</div>`
	);
}

// ---------------------------------------------------------------------------
// Block boundary detection
// ---------------------------------------------------------------------------

/**
 * Returns the index of the character immediately after the closing `</div>` that
 * matches the opening `<div` at `openIdx`. Handles nested `<div>` elements.
 * Returns -1 if no matching close tag is found.
 */
export function findBlockEnd(text: string, openIdx: number): number {
	let depth = 1;
	let pos = openIdx + 4; // skip past '<div'
	while (pos < text.length) {
		const nextOpen  = text.indexOf('<div', pos);
		const nextClose = text.indexOf('</div>', pos);
		if (nextClose === -1) return -1;
		if (nextOpen !== -1 && nextOpen < nextClose) {
			depth++;
			pos = nextOpen + 4;
		} else {
			depth--;
			if (depth === 0) return nextClose + 6;
			pos = nextClose + 6;
		}
	}
	return -1;
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

	if (trimmed.includes('data-better-edit-image="placeholder"')) {
		return { kind: 'placeholder' };
	}

	const outerMatch = /^<div\b[^>]*style="([^"]*)"/.exec(trimmed);
	const outerStyle = outerMatch ? (outerMatch[1] ?? '') : '';

	const imgMatch = /\n\s*(<img\b[^>]*\/>)/.exec(trimmed);
	if (!imgMatch) return null;
	const imgTag = imgMatch[1] ?? '';

	const src       = (/\bsrc="([^"]*)"/.exec(imgTag))?.[1] ?? '';
	const imgStyle  = (/\bstyle="([^"]*)"/.exec(imgTag))?.[1] ?? '';
	const rawAlt    = (/\balt="([^"]*)"/.exec(imgTag))?.[1];
	const alt       = rawAlt != null ? unescapeHtmlAttr(rawAlt) : undefined;

	// Old format: one div with overflow:hidden carries both clip and alignment.
	// New format: outer div = width/alignment, inner <div> carries overflow:hidden.
	let isCropped = /overflow:\s*hidden/.test(outerStyle);
	let cropStyle = outerStyle;

	if (!isCropped) {
		const innerDivMatch = /\n\s*<div\b[^>]*style="([^"]*)"/.exec(trimmed);
		if (innerDivMatch) {
			const innerStyle = innerDivMatch[1] ?? '';
			if (/overflow:\s*hidden/.test(innerStyle)) {
				isCropped = true;
				cropStyle = innerStyle;
			}
		}
	}

	let width: string;
	let crop: ImageCrop | undefined;

	if (isCropped) {
		// Width is always on the outer div in both formats.
		width = extractStyleProp(outerStyle, 'width') ?? '100%';
		const height = parseInt(extractStyleProp(cropStyle, 'height') ?? '0', 10);
		const imgWidth = parseInt(extractStyleProp(imgStyle, 'width') ?? '0', 10);
		const mlStr = extractStyleProp(imgStyle, 'margin-left');
		const mtStr = extractStyleProp(imgStyle, 'margin-top');
		const offsetX = mlStr ? Math.max(0, -parseInt(mlStr, 10)) : 0;
		const offsetY = mtStr ? Math.max(0, -parseInt(mtStr, 10)) : 0;
		crop = { offsetX, offsetY, height, imgWidth };
		if (/border-radius:\s*50%/.test(cropStyle)) crop.shape = 'circle';
	} else {
		// Width is on the outer div; fall back to img style for old HTML written
		// before this was unified (width was previously on the img for no-caption).
		width =
			extractStyleProp(outerStyle, 'width') ??
			extractStyleProp(imgStyle, 'width') ??
			'100%';
	}

	const alignment = detectAlignment(outerStyle, isCropped);
	let caption: string | undefined;
	let captionHidden: boolean | undefined;
	const captionMatch = /<p\b[^>]*>([\s\S]*?)<\/p>/.exec(trimmed);
	if (captionMatch) {
		caption = captionMatch[1] ?? '';
		captionHidden = /display:\s*none/.test(captionMatch[0]) ? true : undefined;
	}

	return { kind: 'single', src, width, alignment, caption, captionHidden, alt, crop };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtmlAttr(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function unescapeHtmlAttr(s: string): string {
	return s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function extractStyleProp(style: string, prop: string): string | null {
	const re = new RegExp(`(?:^|;)\\s*${prop}:\\s*([^;]+)`);
	const m = re.exec(style);
	return m ? (m[1] ?? '').trim() : null;
}

function detectAlignment(outerStyle: string, isCropped = false): ImageAlignment {
	if (/float:\s*left/.test(outerStyle))  return 'float-left';
	if (/float:\s*right/.test(outerStyle)) return 'float-right';
	if (isCropped) {
		// Cropped images use margin-based alignment, not text-align
		if (/margin:\s*0\s+auto/.test(outerStyle)) return 'center';
		if (/margin-left:\s*auto/.test(outerStyle)) return 'right';
		return 'left';
	}
	const textAlign = extractStyleProp(outerStyle, 'text-align') ?? 'center';
	if (textAlign === 'left')  return 'left';
	if (textAlign === 'right') return 'right';
	return 'center';
}
