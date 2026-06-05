export type BlockTurnIntoTarget =
	| 'paragraph'
	| 'heading-1'
	| 'heading-2'
	| 'heading-3'
	| 'bullet-list'
	| 'numbered-list'
	| 'checkbox'
	| 'code-block';

const SIMPLE_FENCE_RE = /^\s{0,3}(`{3,}|~{3,})([^`~]*)$/;
const MATH_FENCE_RE = /^\s{0,3}\$\$\s*$/;
const SPECIAL_FENCE_LANG_RE = /^(?:dataview|dataviewjs|mermaid|query|tasks|button|chart|leaflet|ad-[\w-]*)\b/i;
const TABLE_DELIMITER_RE = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;
const NATIVE_IMAGE_RE = /^\s*!\[\[[^\]]+\]\]\s*$/;
const MARKDOWN_IMAGE_RE = /^\s*!\[[^\]]*\]\([^)]+\)\s*$/;
const HTML_BLOCK_RE = /^\s*<(?:!--|[A-Za-z][\w:-]*\b|\/[A-Za-z][\w:-]*\s*>|![A-Z]+\b|\?\w+)/;
const CALLOUT_RE = /^\s*>\s*\[[!\w-]+\]/i;
const BLOCKQUOTE_RE = /^\s*>/;
const HR_RE = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;

export function canTurnIntoSource(source: string): boolean {
	const core = stripOuterLineBreaks(source);
	if (core.trim().length === 0) return false;
	if (isSupportedCodeLikeBlock(core)) return true;
	if (isUnsupportedStructuralSource(core)) return false;
	return true;
}

export function duplicateBlockText(source: string): string {
	const trailing = trailingLineBreak(source);
	const core = trailing.length > 0 ? source.slice(0, -trailing.length) : source;
	const separator = trailing.length > 0 ? trailing : '\n';
	return `${core}${separator}${core}${trailing}`;
}

export function turnBlockTextInto(source: string, target: BlockTurnIntoTarget): string {
	const leading = source.match(/^\n*/)?.[0] ?? '';
	const trailing = trailingLineBreak(source);
	const coreEnd = trailing.length > 0 ? source.length - trailing.length : source.length;
	const core = source.slice(leading.length, coreEnd);
	const plainLines = plainLinesForTurnInto(core);
	const transformed = target === 'code-block'
		? codeBlockFromLines(plainLines)
		: plainLines.map(line => transformPlainLine(line, target)).join('\n');
	return `${leading}${transformed}${trailing}`;
}

function trailingLineBreak(source: string): string {
	return source.match(/\n+$/)?.[0] ?? '';
}

function stripOuterLineBreaks(source: string): string {
	return source.replace(/^\n+|\n+$/g, '');
}

function isSupportedCodeLikeBlock(source: string): boolean {
	return codeLikeInnerLines(source) !== null;
}

function plainLinesForTurnInto(source: string): string[] {
	return codeLikeInnerLines(source) ?? source.split('\n').map(stripSimpleBlockMarker);
}

function codeLikeInnerLines(source: string): string[] | null {
	const lines = source.split('\n');
	if (lines.length < 2) return null;
	const first = lines[0] ?? '';
	const last = lines[lines.length - 1] ?? '';

	if (MATH_FENCE_RE.test(first) && MATH_FENCE_RE.test(last)) {
		return lines.slice(1, -1);
	}

	const open = SIMPLE_FENCE_RE.exec(first);
	if (open === null) return null;
	const marker = open[1] ?? '';
	const language = (open[2] ?? '').trim();
	if (SPECIAL_FENCE_LANG_RE.test(language)) return null;
	const closeRe = new RegExp(`^\\s{0,3}${escapeRegExp(marker)}\\s*$`);
	return closeRe.test(last) ? lines.slice(1, -1) : null;
}

function isUnsupportedStructuralSource(source: string): boolean {
	const lines = source.split('\n');
	const openingFence = SIMPLE_FENCE_RE.exec(lines[0] ?? '');
	if (openingFence !== null && SPECIAL_FENCE_LANG_RE.test((openingFence[2] ?? '').trim())) return true;
	if (lines.some(line => NATIVE_IMAGE_RE.test(line) || MARKDOWN_IMAGE_RE.test(line))) return true;
	if (lines.some(line => TABLE_DELIMITER_RE.test(line))) return true;
	if (lines.some(line => HTML_BLOCK_RE.test(line))) return true;
	if (lines.some(line => CALLOUT_RE.test(line))) return true;
	if (lines.some(line => BLOCKQUOTE_RE.test(line))) return true;
	if (lines.some(line => HR_RE.test(line))) return true;
	return false;
}

function stripSimpleBlockMarker(line: string): string {
	const heading = /^(\s*)#{1,6}\s+(.*)$/.exec(line);
	if (heading !== null) return `${heading[1] ?? ''}${heading[2] ?? ''}`;

	const checkbox = /^(\s*)[-*+]\s+\[[ xX]\]\s+(.*)$/.exec(line);
	if (checkbox !== null) return `${checkbox[1] ?? ''}${checkbox[2] ?? ''}`;

	const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(line);
	if (bullet !== null) return `${bullet[1] ?? ''}${bullet[2] ?? ''}`;

	const numbered = /^(\s*)\d+[.)]\s+(.*)$/.exec(line);
	if (numbered !== null) return `${numbered[1] ?? ''}${numbered[2] ?? ''}`;

	return line;
}

function transformPlainLine(line: string, target: BlockTurnIntoTarget): string {
	if (line.trim().length === 0) return '';
	const indent = line.match(/^\s*/)?.[0] ?? '';
	const text = line.slice(indent.length);

	switch (target) {
		case 'paragraph':
			return `${indent}${text}`;
		case 'heading-1':
			return `${indent}# ${text}`;
		case 'heading-2':
			return `${indent}## ${text}`;
		case 'heading-3':
			return `${indent}### ${text}`;
		case 'bullet-list':
			return `${indent}- ${text}`;
		case 'numbered-list':
			return `${indent}1. ${text}`;
		case 'checkbox':
			return `${indent}- [ ] ${text}`;
		case 'code-block':
			return line;
	}
}

function codeBlockFromLines(lines: string[]): string {
	const longestBacktickRun = lines.reduce((longest, line) => {
		const runs = line.match(/`+/g) ?? [];
		return Math.max(longest, ...runs.map(run => run.length));
	}, 0);
	const fence = '`'.repeat(Math.max(3, longestBacktickRun + 1));
	return [fence, ...lines, fence].join('\n');
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
