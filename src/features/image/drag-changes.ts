export interface ImageDragChange {
	from: number;
	to: number;
	insert: string;
}

/**
 * CodeMirror expects array ChangeSpec ranges to be sorted by their original
 * document positions. Drag/drop can touch a source block and a later target
 * block in one transaction, so normalize the order before dispatching.
 */
export function orderImageDragChanges<T extends ImageDragChange>(changes: T[]): T[] {
	return [...changes].sort((a, b) => a.from - b.from || a.to - b.to);
}
