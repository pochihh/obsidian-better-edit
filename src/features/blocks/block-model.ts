import { EditorState } from '@codemirror/state';

export type BlockKind =
	| 'paragraph'
	| 'heading'
	| 'horizontal-rule'
	| 'list-item'
	| 'blockquote'
	| 'fenced-code'
	| 'table'
	| 'html'
	| 'text';

export interface BlockRange {
	kind: BlockKind;
	from: number;
	to: number;
	contentFrom: number;
	contentTo: number;
	lineFrom: number;
	lineTo: number;
}

export interface BlockDetectionOptions {
	enableListItemDrag: boolean;
	enableHtmlBlockDrag: boolean;
}

const LIST_ITEM_RE = /^(\s*)(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/;
const HEADING_RE = /^\s{0,3}#{1,6}\s+/;
const HR_RE = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;
const TABLE_DELIMITER_RE = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;
const HTML_OPEN_RE = /^\s*<(div|section|article|figure|table|ul|ol|blockquote|pre)\b/i;

export function getBlockAtPos(state: EditorState, pos: number, options: BlockDetectionOptions): BlockRange | null {
	if (state.doc.length === 0) return null;

	const line = state.doc.lineAt(Math.min(pos, state.doc.length));
	if (line.text.trim() === '') return null;

	return (
		getFencedCodeBlock(state, line.number) ??
		getTableBlock(state, line.number) ??
		(options.enableHtmlBlockDrag ? getHtmlBlock(state, line.number) : null) ??
		getBlockquoteBlock(state, line.number) ??
		(options.enableListItemDrag ? getListItemBlock(state, line.number) : null) ??
		getSingleLineBlock(state, line.number) ??
		getParagraphBlock(state, line.number)
	);
}

function getSingleLineBlock(state: EditorState, lineNumber: number): BlockRange | null {
	const line = state.doc.line(lineNumber);
	if (HEADING_RE.test(line.text)) return lineBlock(state, lineNumber, 'heading');
	if (HR_RE.test(line.text)) return lineBlock(state, lineNumber, 'horizontal-rule');
	return null;
}

function getParagraphBlock(state: EditorState, lineNumber: number): BlockRange {
	return rangeFromLines(state, lineNumber, lineNumber, 'paragraph');
}

function getListItemBlock(state: EditorState, lineNumber: number): BlockRange | null {
	const line = state.doc.line(lineNumber);
	const match = LIST_ITEM_RE.exec(line.text);
	if (!match) return null;

	const indent = match[1]?.length ?? 0;
	let end = lineNumber;

	for (let n = lineNumber + 1; n <= state.doc.lines; n++) {
		const next = state.doc.line(n).text;
		if (next.trim() === '') {
			end = n;
			continue;
		}

		const nextList = LIST_ITEM_RE.exec(next);
		if (nextList && (nextList[1]?.length ?? 0) <= indent) break;
		if (leadingSpaces(next) <= indent && !isIndentedContinuation(next, indent)) break;
		end = n;
	}

	return rangeFromLines(state, lineNumber, end, 'list-item');
}

function isIndentedContinuation(text: string, parentIndent: number): boolean {
	return leadingSpaces(text) > parentIndent;
}

function getBlockquoteBlock(state: EditorState, lineNumber: number): BlockRange | null {
	if (!/^\s*>/.test(state.doc.line(lineNumber).text)) return null;

	let start = lineNumber;
	let end = lineNumber;
	while (start > 1 && /^\s*>/.test(state.doc.line(start - 1).text)) start--;
	while (end < state.doc.lines && /^\s*>/.test(state.doc.line(end + 1).text)) end++;
	return rangeFromLines(state, start, end, 'blockquote');
}

function getFencedCodeBlock(state: EditorState, lineNumber: number): BlockRange | null {
	let openLine: number | null = null;

	for (let n = 1; n <= state.doc.lines; n++) {
		if (!FENCE_RE.test(state.doc.line(n).text)) continue;

		if (openLine === null) {
			openLine = n;
			continue;
		}

		if (lineNumber >= openLine && lineNumber <= n) {
			return rangeFromLines(state, openLine, n, 'fenced-code');
		}
		if (n >= lineNumber) {
			return null;
		}
		openLine = null;
	}

	return null;
}

function getTableBlock(state: EditorState, lineNumber: number): BlockRange | null {
	const current = state.doc.line(lineNumber).text;
	if (!isTableLine(current)) return null;

	let start = lineNumber;
	let end = lineNumber;
	while (start > 1 && isTableLine(state.doc.line(start - 1).text)) start--;
	while (end < state.doc.lines && isTableLine(state.doc.line(end + 1).text)) end++;

	let hasDelimiter = false;
	for (let n = start; n <= end; n++) {
		if (TABLE_DELIMITER_RE.test(state.doc.line(n).text)) {
			hasDelimiter = true;
			break;
		}
	}

	return hasDelimiter ? rangeFromLines(state, start, end, 'table') : null;
}

function isTableLine(text: string): boolean {
	return text.includes('|') && text.trim().length > 0;
}

function getHtmlBlock(state: EditorState, lineNumber: number): BlockRange | null {
	let start = lineNumber;
	while (start >= 1 && !HTML_OPEN_RE.test(state.doc.line(start).text)) start--;
	if (start < 1) return null;

	const tag = HTML_OPEN_RE.exec(state.doc.line(start).text)?.[1]?.toLowerCase();
	if (!tag) return null;

	const closeRe = new RegExp(`</${tag}>`, 'i');
	for (let n = start; n <= state.doc.lines; n++) {
		if (closeRe.test(state.doc.line(n).text)) {
			return lineNumber >= start && lineNumber <= n
				? rangeFromLines(state, start, n, 'html')
				: null;
		}
	}

	return null;
}

function lineBlock(state: EditorState, lineNumber: number, kind: BlockKind): BlockRange {
	return rangeFromLines(state, lineNumber, lineNumber, kind);
}

function rangeFromLines(state: EditorState, lineFrom: number, lineTo: number, kind: BlockKind): BlockRange {
	const first = state.doc.line(lineFrom);
	const last = state.doc.line(lineTo);

	return {
		kind,
		from: first.from,
		to: last.to,
		contentFrom: first.from,
		contentTo: last.to,
		lineFrom,
		lineTo,
	};
}

function leadingSpaces(text: string): number {
	return text.length - text.trimStart().length;
}
