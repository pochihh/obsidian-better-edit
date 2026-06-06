import type { BlockRange } from './block-model';

export interface DragSourceLike {
	from: number;
	to: number;
}

export function dragSourceContainsBlock(source: DragSourceLike, block: BlockRange): boolean {
	return block.to > source.from && block.from < source.to;
}

export function resolveDragSourceForBlock<TSource extends DragSourceLike>(
	block: BlockRange,
	visualSelectedSource: TSource | null,
	editorSelectedSource: TSource | null,
	singleBlockSource: TSource,
): TSource {
	if (visualSelectedSource !== null && dragSourceContainsBlock(visualSelectedSource, block)) {
		return visualSelectedSource;
	}
	if (editorSelectedSource !== null && dragSourceContainsBlock(editorSelectedSource, block)) {
		return editorSelectedSource;
	}
	return singleBlockSource;
}
