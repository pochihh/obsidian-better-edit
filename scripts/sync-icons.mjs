#!/usr/bin/env node
/**
 * scripts/sync-icons.mjs
 *
 * Reads SVG files from docs/ref/icons/ and prints ready-to-paste TS snippets
 * for the IMAGE_TOOLBAR_ICONS record in src/icons.ts.
 *
 * Usage:
 *   node scripts/sync-icons.mjs
 *   node scripts/sync-icons.mjs docs/ref/icons/start.svg   ← single file
 *
 * The script detects whether each SVG is stroke-based or fill-based and
 * emits the matching StrokeIconDef / FillIconDef shape. Hardcoded colors
 * (#000, #fff, black, white) are stripped — the renderer uses currentColor.
 *
 * Keys are derived from the filename (start.svg → 'start').
 * Rename them in icons.ts to match the ImageIconName union as needed.
 */

/**
Current icon names to cover:

	caption.svg
	crop.svg
	replace.svg
	alt-text.svg        (or alt_text.svg)
	copy.svg
	duplicate.svg
	delete.svg
	more.svg
	align-left.svg
	align-center.svg
	align-right.svg
	align-float-left.svg
	align-float-right.svg
	add-image.svg
	pop-out.svg
	row-justify-left.svg
	row-justify-center.svg
	row-justify-right.svg
	row-justify-space-between.svg
	row-wrap.svg
	row-align-items.svg
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const ICONS_DIR = path.join(ROOT, 'docs', 'ref', 'icons');

// ── CSS class parser ─────────────────────────────────────────────────────────

/** Returns a map of className → { property: value }.
 *  Handles grouped selectors: `.cls-1, .cls-2 { ... }` applies to both classes. */
function parseCssClasses(styleText) {
	const map = {};
	// Match any rule block — selector(s) { declarations }
	const ruleRe = /([^{}]+)\{([^}]+)\}/g;
	let m;
	while ((m = ruleRe.exec(styleText)) !== null) {
		const selectorGroup = m[1];
		const props = {};
		for (const decl of m[2].split(';')) {
			const colon = decl.indexOf(':');
			if (colon === -1) continue;
			const k = decl.slice(0, colon).trim();
			const v = decl.slice(colon + 1).trim();
			if (k) props[k] = v;
		}
		// Each comma-separated selector may contain one or more class names
		for (const selector of selectorGroup.split(',')) {
			const classMatch = /\.([a-zA-Z0-9_-]+)/.exec(selector.trim());
			if (!classMatch) continue;
			const cls = classMatch[1];
			if (!map[cls]) map[cls] = {};
			Object.assign(map[cls], props);  // later rules win, matching cascade order
		}
	}
	return map;
}

// ── Attribute helpers ────────────────────────────────────────────────────────

/** Extract a single attribute value from a raw SVG opening-tag string. */
function attr(tagStr, name) {
	const re = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`);
	return re.exec(tagStr)?.[1]?.trim() ?? null;
}

/** Resolve the effective CSS properties for an element (class + inline style). */
function resolveStyle(tagStr, classMap) {
	const merged = {};
	const cls = attr(tagStr, 'class') ?? '';
	for (const c of cls.split(/\s+/)) {
		if (classMap[c]) Object.assign(merged, classMap[c]);
	}
	const inlineStyle = attr(tagStr, 'style') ?? '';
	for (const decl of inlineStyle.split(';')) {
		const colon = decl.indexOf(':');
		if (colon === -1) continue;
		const k = decl.slice(0, colon).trim();
		const v = decl.slice(colon + 1).trim();
		if (k) merged[k] = v;
	}
	return merged;
}

// ── Number utilities ─────────────────────────────────────────────────────────

function parsePx(v) {
	if (v == null) return undefined;
	const n = parseFloat(String(v).replace('px', ''));
	return isNaN(n) ? undefined : n;
}

/** Format a number: drop trailing zeros, keep up to 4 significant digits. */
function fmt(n) {
	if (n === undefined || n === null) return 'undefined';
	// toPrecision can give scientific notation for very small numbers — avoid it
	const s = parseFloat(n.toPrecision(5)).toString();
	return s;
}

// ── Determine icon type ──────────────────────────────────────────────────────

/** True if the SVG uses stroke-based rendering (stroke != none, fill == none). */
function detectStroke(classMap, svgText) {
	// Check CSS classes
	for (const props of Object.values(classMap)) {
		if (props['stroke'] && props['stroke'] !== 'none'
			&& (!props['fill'] || props['fill'] === 'none')) {
			return true;
		}
	}
	// Check <svg> element attributes
	const svgTag = /<svg\b[^>]*>/.exec(svgText)?.[0] ?? '';
	const svgStroke = attr(svgTag, 'stroke');
	const svgFill   = attr(svgTag, 'fill');
	if (svgStroke && svgStroke !== 'none' && (!svgFill || svgFill === 'none')) return true;
	return false;
}

// ── Global stroke defaults from classMap ─────────────────────────────────────

function globalStrokeWidth(classMap) {
	const widths = Object.values(classMap)
		.map(p => parsePx(p['stroke-width']))
		.filter(n => n !== undefined);
	if (!widths.length) return undefined;
	// Most common value
	const freq = {};
	for (const w of widths) freq[w] = (freq[w] ?? 0) + 1;
	const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
	return parseFloat(top);
}

function globalLinecap(classMap) {
	for (const props of Object.values(classMap)) {
		if (props['stroke-linecap']) return props['stroke-linecap'];
	}
	return undefined;
}

// ── Primitive extractors ─────────────────────────────────────────────────────

function extractLine(tagStr, style) {
	return {
		tag: 'line',
		x1: parseFloat(attr(tagStr, 'x1')),
		y1: parseFloat(attr(tagStr, 'y1')),
		x2: parseFloat(attr(tagStr, 'x2')),
		y2: parseFloat(attr(tagStr, 'y2')),
		sw: parsePx(style['stroke-width'] ?? attr(tagStr, 'stroke-width')),
	};
}

function extractRect(tagStr, style) {
	const rx = parseFloat(attr(tagStr, 'rx') ?? attr(tagStr, 'ry') ?? '0') || undefined;
	return {
		tag: 'rect',
		x:  parseFloat(attr(tagStr, 'x')),
		y:  parseFloat(attr(tagStr, 'y')),
		w:  parseFloat(attr(tagStr, 'width')),
		h:  parseFloat(attr(tagStr, 'height')),
		rx,
		sw: parsePx(style['stroke-width'] ?? attr(tagStr, 'stroke-width')),
	};
}

function extractPath(tagStr, style) {
	return {
		tag:  'path',
		d:    attr(tagStr, 'd') ?? '',
		fill: style['fill'],
		sw:   parsePx(style['stroke-width'] ?? attr(tagStr, 'stroke-width')),
	};
}

function extractCircle(tagStr, style) {
	// Represent as a <circle> — our renderer doesn't support it yet, so flag it.
	return {
		tag: '/* TODO: circle */',
		cx: attr(tagStr, 'cx'), cy: attr(tagStr, 'cy'), r: attr(tagStr, 'r'),
		sw: parsePx(style['stroke-width'] ?? attr(tagStr, 'stroke-width')),
	};
}

// ── TS snippet renderers ─────────────────────────────────────────────────────

function renderPrimitive(p, defaultSw) {
	const parts = [`tag: '${p.tag}'`];
	if (p.tag === 'line') {
		parts.push(
			`x1: ${fmt(p.x1)}, y1: ${fmt(p.y1)}, x2: ${fmt(p.x2)}, y2: ${fmt(p.y2)}`
		);
	} else if (p.tag === 'rect') {
		parts.push(`x: ${fmt(p.x)}, y: ${fmt(p.y)}, w: ${fmt(p.w)}, h: ${fmt(p.h)}`);
		if (p.rx !== undefined) parts.push(`rx: ${fmt(p.rx)}`);
	} else if (p.tag === 'path') {
		parts.push(`d: '${p.d}'`);
	}
	if (p.sw !== undefined && p.sw !== defaultSw) parts.push(`sw: ${fmt(p.sw)}`);
	return `{ ${parts.join(', ')} }`;
}

function renderStrokeIcon(name, viewBox, classMap, primitives) {
	const defaultSw  = globalStrokeWidth(classMap);
	const linecap    = globalLinecap(classMap);
	const lines = [`\t'${name}': {`];
	lines.push(`\t\tviewBox: '${viewBox}',`);
	const meta = [];
	if (defaultSw !== undefined) meta.push(`sw: ${fmt(defaultSw)}`);
	if (linecap)                 meta.push(`linecap: '${linecap}'`);
	if (meta.length) lines.push(`\t\t${meta.join(', ')},`);
	lines.push(`\t\tstroke: [`);
	for (const p of primitives) {
		lines.push(`\t\t\t${renderPrimitive(p, defaultSw)},`);
	}
	lines.push(`\t\t],`);
	lines.push(`\t},`);
	return lines.join('\n');
}

function renderFillIcon(name, viewBox, paths) {
	const d = paths.join(' ');
	return `\t'${name}': {\n\t\tviewBox: '${viewBox}',\n\t\tpath: '${d}',\n\t},`;
}

// ── Per-file processing ──────────────────────────────────────────────────────

async function processFile(filePath) {
	const svg  = await readFile(filePath, 'utf8');
	const name = path.basename(filePath, '.svg').replace(/_/g, '-').toLowerCase();

	// Extract viewBox
	const svgTag  = /<svg\b[^>]*>/.exec(svg)?.[0] ?? '';
	const viewBox = attr(svgTag, 'viewBox') ?? '0 0 20 20';

	// Parse <style> block
	const styleText = /<style\b[^>]*>([\s\S]*?)<\/style>/.exec(svg)?.[1] ?? '';
	const classMap  = parseCssClasses(styleText);

	if (detectStroke(classMap, svg)) {
		// Strip the <style> block and <defs> so we only match graphic elements
		const body = svg
			.replace(/<defs>[\s\S]*?<\/defs>/g, '')
			.replace(/<style\b[\s\S]*?<\/style>/g, '');

		const primitives = [];
		// Match self-closing and open tags for graphic primitives
		const re = /<(line|rect|path|circle)\b([^>]*?)\/?\s*>/g;
		let m;
		while ((m = re.exec(body)) !== null) {
			const [fullTag, tagName] = m;
			const style = resolveStyle(fullTag, classMap);
			if (tagName === 'line')   primitives.push(extractLine(fullTag, style));
			if (tagName === 'rect')   primitives.push(extractRect(fullTag, style));
			if (tagName === 'path')   primitives.push(extractPath(fullTag, style));
			if (tagName === 'circle') primitives.push(extractCircle(fullTag, style));
		}

		return renderStrokeIcon(name, viewBox, classMap, primitives);
	} else {
		// Fill-based: collect all path d values
		const paths = [];
		const re = /<path\b[^>]*?>/g;
		let m;
		while ((m = re.exec(svg)) !== null) {
			const d = attr(m[0], 'd');
			if (d) paths.push(d);
		}
		return renderFillIcon(name, viewBox, paths);
	}
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
	// Accept an optional list of explicit file paths as arguments
	let files = process.argv.slice(2);

	if (!files.length) {
		try {
			const entries = await readdir(ICONS_DIR);
			files = entries
				.filter(f => f.toLowerCase().endsWith('.svg'))
				.sort()
				.map(f => path.join(ICONS_DIR, f));
		} catch {
			console.error(`Cannot read icon directory: ${ICONS_DIR}`);
			process.exit(1);
		}
	}

	if (!files.length) {
		console.error('No SVG files found.');
		process.exit(1);
	}

	console.log('// ── Paste into IMAGE_TOOLBAR_ICONS in src/icons.ts ──────────────────────\n');

	for (const file of files) {
		console.log(`// Source: docs/ref/icons/${path.basename(file)}`);
		try {
			console.log(await processFile(file));
		} catch (err) {
			console.error(`// ERROR: ${err.message}`);
		}
		console.log();
	}
}

await main();
