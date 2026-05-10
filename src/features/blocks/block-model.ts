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
	| 'native-image'
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
const SETEXT_HEADING_RE = /^\s{0,3}(?:=+|-+)\s*$/;
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;
const TABLE_DELIMITER_RE = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;
const HTML_OPEN_RE = /^\s*<(div|section|article|figure|table|ul|ol|blockquote|pre)\b/i;
const NATIVE_IMAGE_RE = /^\s*!\[\[[^\]]+\]\]\s*$/;

export function getBlockAtPos(state: EditorState, pos: number, options: BlockDetectionOptions): BlockRange | null {
	if (state.doc.length === 0) return null;

	const line = state.doc.lineAt(Math.min(pos, state.doc.length));
	if (line.text.trim() === '') return null;

	return (
		getFencedCodeBlock(state, line.number) ??
		getTableBlock(state, line.number) ??
		(options.enableHtmlBlockDrag ? getHtmlBlock(state, line.number) : null) ??
		getSetextHeadingBlock(state, line.number) ??
		getBlockquoteBlock(state, line.number) ??
		(options.enableListItemDrag ? getListItemBlock(state, line.number) : null) ??
		getSingleLineBlock(state, line.number) ??
		getNativeImageBlock(state, line.number) ??
		getParagraphBlock(state, line.number)
	);
}

function getSingleLineBlock(state: EditorState, lineNumber: number): BlockRange | null {
	const line = state.doc.line(lineNumber);
	if (HEADING_RE.test(line.text)) return lineBlock(state, lineNumber, 'heading');
	if (isSetextUnderline(state, lineNumber)) return null;
	if (HR_RE.test(line.text)) return lineBlock(state, lineNumber, 'horizontal-rule');
	return null;
}

function getSetextHeadingBlock(state: EditorState, lineNumber: number): BlockRange | null {
	if (lineNumber < state.doc.lines && isSetextUnderline(state, lineNumber + 1)) {
		return rangeFromLines(state, lineNumber, lineNumber + 1, 'heading');
	}
	if (isSetextUnderline(state, lineNumber)) {
		return rangeFromLines(state, lineNumber - 1, lineNumber, 'heading');
	}
	return null;
}

function isSetextUnderline(state: EditorState, lineNumber: number): boolean {
	if (lineNumber <= 1 || lineNumber > state.doc.lines) return false;

	const line = state.doc.line(lineNumber);
	const previous = state.doc.line(lineNumber - 1);
	if (!SETEXT_HEADING_RE.test(line.text)) return false;
	if (previous.text.trim() === '') return false;
	if (isStructuralPreviousLine(previous.text)) return false;

	return true;
}

function isStructuralPreviousLine(text: string): boolean {
	return (
		HEADING_RE.test(text) ||
		HR_RE.test(text) ||
		FENCE_RE.test(text) ||
		LIST_ITEM_RE.test(text) ||
		/^\s*>/.test(text) ||
		HTML_OPEN_RE.test(text)
	);
}

function getNativeImageBlock(state: EditorState, lineNumber: number): BlockRange | null {
	return NATIVE_IMAGE_RE.test(state.doc.line(lineNumber).text)
		? lineBlock(state, lineNumber, 'native-image')
		: null;
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
			const continuationLine = nextIndentedContinuationLine(state, n + 1, indent);
			if (continuationLine === null) break;
			end = continuationLine;
			n = continuationLine;
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

function nextIndentedContinuationLine(state: EditorState, lineNumber: number, parentIndent: number): number | null {
	for (let n = lineNumber; n <= state.doc.lines; n++) {
		const text = state.doc.line(n).text;
		if (text.trim() === '') continue;

		const nextList = LIST_ITEM_RE.exec(text);
		if (nextList && (nextList[1]?.length ?? 0) <= parentIndent) return null;

		return isIndentedContinuation(text, parentIndent) ? n : null;
	}
	return null;
}

function getBlockquoteBlock(state: EditorState, lineNumber: number): BlockRange | null {
	if (!/^\s*>/.test(state.doc.line(lineNumber).text)) return null;

	let start = lineNumber;
	let end = lineNumber;
	while (start > 1 && /^\s*>/.test(state.doc.line(start - 1).text)) start--;
	while (end < state.doc.lines && /^\s*>/.test(state.doc.line(end + 1).text)) end++;
	if (end < state.doc.lines && state.doc.line(end + 1).text.trim() === '') end++;
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
