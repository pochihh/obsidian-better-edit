import { duplicateBlockText } from './block-transform';
import type { BlockKind } from './block-model';

export type BlockSpacingKind = BlockKind;

export interface TableDropSpacingContext {
	firstBlockKind: BlockSpacingKind;
	lastBlockKind: BlockSpacingKind;
	previousBlockKind: BlockSpacingKind | null;
	nextBlockKind: BlockSpacingKind | null;
	hasBlankLineBeforeTarget?: boolean;
}

export interface SourceSpacingContext {
	firstBlockKind: BlockSpacingKind;
	lastBlockKind: BlockSpacingKind;
}

export interface LineDropSpacingContext {
	insertionAtLineStart: boolean;
}

export interface BlankLineDropBoundaryContext {
	firstBlockKind: BlockSpacingKind;
	lastBlockKind: BlockSpacingKind;
	previousBlockKind: BlockSpacingKind | null;
	nextBlockKind: BlockSpacingKind | null;
}

export function tableSafeTextForDrop(text: string, context: TableDropSpacingContext): string {
	if (context.firstBlockKind !== 'table' && context.lastBlockKind !== 'table' && context.nextBlockKind !== 'table') return text;

	let normalized = text;
	if (context.nextBlockKind === 'table' && context.lastBlockKind !== 'table') {
		normalized = normalized.replace(/^\n+/, '');
		if (needsBlankLineBeforeTable(context.lastBlockKind)) normalized = ensureTrailingNewlines(normalized, 2);
	}
	if (context.firstBlockKind === 'table') {
		normalized = normalized.replace(/^\n+/, '');
		if (context.previousBlockKind !== null && !context.hasBlankLineBeforeTarget) normalized = `\n${normalized}`;
	}

	if (context.lastBlockKind === 'table') {
		const minimumTrailingNewlines = context.nextBlockKind === null
			? 0
			: needsBlankLineBeforeTable(context.nextBlockKind) ? 2 : 1;
		normalized = ensureTrailingNewlines(normalized, minimumTrailingNewlines);
	}

	return normalized;
}

export function duplicateBlockTextForSource(source: string, context: SourceSpacingContext): string {
	if (context.firstBlockKind !== 'table' && context.lastBlockKind !== 'table') return duplicateBlockText(source);

	const trailing = trailingLineBreak(source);
	const core = trailing.length > 0 ? source.slice(0, -trailing.length) : source;
	const separator = context.lastBlockKind === 'table' && context.firstBlockKind === 'table' ? '\n \n' : trailing.length > 0 ? trailing : '\n';
	return `${core}${separator}${core}${trailing}`;
}

export function lineSafeTextForDrop(text: string, context: LineDropSpacingContext): string {
	const leading = text.match(/^\n+/)?.[0] ?? '';
	if (leading.length > 0 && context.insertionAtLineStart) {
		const content = text.slice(leading.length);
		return content.endsWith('\n') ? content : `${content}${leading}`;
	}
	if (leading.length === 0 && !context.insertionAtLineStart) return `\n${text}`;
	return text;
}

export function allowBlankLineDropBoundary(context: BlankLineDropBoundaryContext): boolean {
	if (context.firstBlockKind !== 'table' && context.lastBlockKind !== 'table') return true;
	return context.previousBlockKind !== 'table' && context.nextBlockKind !== 'table';
}

function needsBlankLineBeforeTable(kind: BlockSpacingKind): boolean {
	return kind === 'paragraph' || kind === 'native-image' || kind === 'table';
}

function ensureTrailingNewlines(text: string, count: number): string {
	const content = text.replace(/\n+$/, '');
	return `${content}${'\n'.repeat(count)}`;
}

function trailingLineBreak(source: string): string {
	return source.match(/\n+$/)?.[0] ?? '';
}
