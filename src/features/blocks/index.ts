import { Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { editorLivePreviewField } from 'obsidian';
import type BetterEditPlugin from '../../main';
import { BlockRange, getBlockAtPos, getBlocksInRange } from './block-model';

interface DropBoundary {
	pos: number;
	top: number;
	side: 'before' | 'after';
	isOriginal: boolean;
}

interface MoveSlice {
	from: number;
	to: number;
	text: string;
}

interface DragSource {
	kind: 'single' | 'multi';
	blocks: BlockRange[];
	from: number;
	to: number;
	lineFrom: number;
	lineTo: number;
	primary: BlockRange;
}

type DragState =
	| { kind: 'idle' }
	| { kind: 'pressed'; source: DragSource; slice: MoveSlice; startY: number }
	| { kind: 'dragging'; source: DragSource; slice: MoveSlice; target: DropBoundary | null };

const DRAG_START_THRESHOLD_PX = 4;
const BLOCK_ELEMENT_SELECTOR = '.cm-line, .cm-html-embed.cm-embed-block, .be-image-widget, .internal-embed.image-embed';

export function createBlocksExtension(plugin: BetterEditPlugin): Extension {
	return ViewPlugin.fromClass(class {
		private readonly view: EditorView;
		private readonly plugin: BetterEditPlugin;
		private readonly controlsEl: HTMLElement;
		private readonly addButtonEl: HTMLButtonElement;
		private readonly dragHandleEl: HTMLButtonElement;
		private readonly tooltipEl: HTMLElement;
		private readonly selectionEl: HTMLElement;
		private readonly dropLineEl: HTMLElement;
		private hoveredBlock: BlockRange | null = null;
		private hoveredRect: DOMRect | null = null;
		private tooltipTimer: number | null = null;
		private dragState: DragState = { kind: 'idle' };
		private persistedSelectionSource: DragSource | null = null;

		constructor(view: EditorView) {
			this.view = view;
			this.plugin = plugin;
			this.controlsEl = createDiv({ cls: 'be-block-controls' });
			this.addButtonEl = this.controlsEl.createEl('button', {
				cls: 'be-block-add',
				attr: { type: 'button' },
				text: '+',
			});
			this.dragHandleEl = this.controlsEl.createEl('button', {
				cls: 'be-block-handle',
				attr: { type: 'button', draggable: 'true' },
				text: '⠿',
			});
			this.tooltipEl = this.controlsEl.createDiv({
				cls: 'be-block-tooltip',
				text: 'Click to add below. Option-click to add above.',
			});
			this.selectionEl = createDiv({ cls: 'be-block-selection' });
			this.dropLineEl = createDiv({ cls: 'be-block-drop-line' });

			if (!this.plugin.settings.blocks.showAddButton) {
				this.addButtonEl.hide();
			}

			this.editorDocument().body.appendChild(this.controlsEl);
			this.editorDocument().body.appendChild(this.selectionEl);
			this.editorDocument().body.appendChild(this.dropLineEl);
			this.hideControls();

			this.plugin.registerDomEvent(this.editorDocument(), 'pointermove', (event: PointerEvent) => this.onPointerMove(event));
			this.plugin.registerDomEvent(this.editorDocument(), 'pointerdown', () => this.onDocumentPointerDown());
			this.plugin.registerDomEvent(this.editorDocument(), 'pointerup', (event: PointerEvent) => this.onPointerUp(event));
			this.plugin.registerDomEvent(this.editorDocument(), 'pointercancel', () => this.cancelDrag());
			this.plugin.registerDomEvent(this.editorDocument(), 'keydown', (event: KeyboardEvent) => {
				if (event.key === 'Escape') this.cancelDrag();
			});
			this.plugin.registerDomEvent(this.scrollerElement(), 'scroll', () => this.onEditorScroll(), { passive: true });
			this.plugin.registerDomEvent(this.controlsEl, 'wheel', (event: WheelEvent) => this.forwardWheelToScroller(event));
			this.plugin.registerDomEvent(this.addButtonEl, 'click', (event: MouseEvent) => this.onAddClick(event));
			this.plugin.registerDomEvent(this.addButtonEl, 'mouseenter', () => this.scheduleTooltip());
			this.plugin.registerDomEvent(this.addButtonEl, 'mouseleave', () => this.hideTooltip());
			this.plugin.registerDomEvent(this.dragHandleEl, 'pointerdown', (event: PointerEvent) => this.onDragHandlePointerDown(event));
			this.plugin.registerDomEvent(this.dragHandleEl, 'dragstart', (event: DragEvent) => {
				event.preventDefault();
				event.stopPropagation();
			});
		}

		update(update: ViewUpdate): void {
			if (!this.isLivePreview()) {
				this.hideControls();
				this.clearPersistedSelection();
				return;
			}
			if (update.docChanged && this.dragState.kind === 'idle') {
				this.clearPersistedSelection();
			}
			if (update.docChanged || update.viewportChanged || update.geometryChanged) {
				this.positionControls();
				this.positionDragVisuals();
				this.positionPersistedSelection();
			}
		}

		destroy(): void {
			this.cancelDrag();
			this.clearTooltipTimer();
			this.controlsEl.remove();
			this.selectionEl.remove();
			this.dropLineEl.remove();
		}

		private onPointerMove(event: PointerEvent): void {
			if (this.dragState.kind === 'pressed') {
				this.updatePressedDrag(event.clientY);
				return;
			}
			if (this.dragState.kind === 'dragging') {
				this.updateDrag(event.clientY);
				return;
			}

			if (!this.isLivePreview() || !this.isActiveVisibleEditor()) {
				this.hideControls();
				return;
			}

			const pointEl = this.editorDocument().elementFromPoint(event.clientX, event.clientY);
			if (pointEl === null) {
				this.hideControls();
				return;
			}

			if (this.controlsEl.contains(pointEl)) return;

			const contentRect = this.contentRect();
			if (contentRect !== null && event.clientX < contentRect.left && event.clientX >= contentRect.left - 72) {
				const gutterHit = this.lineHitFromY(event.clientY);
				if (gutterHit !== null) {
					this.hoveredBlock = gutterHit.block;
					this.hoveredRect = gutterHit.rect;
					this.positionControls();
					return;
				}
			}

			if (!this.view.dom.contains(pointEl)) {
				this.hideControls();
				return;
			}

			if (pointEl.closest('.be-image-frame')) {
				this.hideControls();
				return;
			}

			const lineEl = pointEl.closest(BLOCK_ELEMENT_SELECTOR);
			if (lineEl === null || !this.view.dom.contains(lineEl)) {
				this.hideControls();
				return;
			}

			const pos = this.posFromLineElement(lineEl);
			if (pos === null) {
				this.hideControls();
				return;
			}

			const block = this.blockAt(pos);
			if (block === null) {
				this.hideControls();
				return;
			}

			this.hoveredBlock = block;
			this.hoveredRect = this.controlRectForBlock(block, lineEl);
			this.positionControls();
		}

		private onDragHandlePointerDown(event: PointerEvent): void {
			if (event.button !== 0 || this.hoveredBlock === null) return;

			event.preventDefault();
			event.stopPropagation();
			this.clearTooltipTimer();
			this.tooltipEl.removeClass('is-visible');
			this.view.focus();
			this.clearPersistedSelection();

			const source = this.dragSourceForBlock(this.hoveredBlock);
			this.dragState = {
				kind: 'pressed',
				source,
				slice: this.moveSliceForSource(source),
				startY: event.clientY,
			};

			this.controlsEl.addClass('is-dragging');
			this.view.dom.addClass('be-block-dragging-editor');
			this.positionDragVisuals();
		}

		private onPointerUp(event: PointerEvent): void {
			if (this.dragState.kind === 'pressed') {
				event.preventDefault();
				event.stopPropagation();
				this.cancelDrag();
				return;
			}
			if (this.dragState.kind !== 'dragging') return;
			event.preventDefault();
			event.stopPropagation();
			this.finishDrag();
		}

		private onDocumentPointerDown(): void {
			if (this.dragState.kind !== 'idle') return;
			this.clearPersistedSelection();
		}

		private updatePressedDrag(clientY: number): void {
			if (this.dragState.kind !== 'pressed') return;
			if (Math.abs(clientY - this.dragState.startY) < DRAG_START_THRESHOLD_PX) return;

			this.dragState = {
				kind: 'dragging',
				source: this.dragState.source,
				slice: this.dragState.slice,
				target: null,
			};
			this.updateDrag(clientY);
		}

		private updateDrag(clientY: number): void {
			if (this.dragState.kind !== 'dragging') return;

			const target = this.dropBoundaryFromY(clientY, this.dragState.source, this.dragState.slice);
			this.dragState = { ...this.dragState, target };
			this.positionDragVisuals();
		}

		private onEditorScroll(): void {
			if (this.dragState.kind !== 'idle') {
				this.positionDragVisuals();
				return;
			}
			if (this.persistedSelectionSource !== null) {
				this.positionPersistedSelection();
			}
			this.hideControls();
		}

		private forwardWheelToScroller(event: WheelEvent): void {
			if (this.dragState.kind !== 'idle') return;
			event.preventDefault();
			this.scrollerElement().scrollBy({
				left: event.deltaX,
				top: event.deltaY,
				behavior: 'instant',
			});
			this.hideControls();
		}

		private finishDrag(): void {
			if (this.dragState.kind !== 'dragging') return;

			const { slice, source, target } = this.dragState;
			this.resetDragUi();
			if (target === null) return;
			if (target.isOriginal) return;
			if (target.pos >= slice.from && target.pos <= slice.to) return;

			const movedText = this.textForDrop(slice.text, target, source);
			const movedSliceFrom = target.pos < slice.from
				? target.pos
				: target.pos - (slice.to - slice.from);
			const movedSliceTo = movedSliceFrom + movedText.length;
			const finalCursor = target.pos < slice.from
				? target.pos + movedText.length
				: target.pos;

			const changes = target.pos < slice.from
				? [
					{ from: target.pos, to: target.pos, insert: movedText },
					{ from: slice.from, to: slice.to, insert: '' },
				]
				: [
					{ from: slice.from, to: slice.to, insert: '' },
					{ from: target.pos, to: target.pos, insert: movedText },
				];

			this.view.dispatch({
				changes,
				selection: { anchor: finalCursor },
				scrollIntoView: true,
			});
			this.view.focus();
			if (source.kind === 'multi') {
				this.persistSelectionForRange(movedSliceFrom, movedSliceTo);
			}
		}

		private cancelDrag(): void {
			if (this.dragState.kind === 'idle') return;
			this.resetDragUi();
		}

		private resetDragUi(): void {
			this.dragState = { kind: 'idle' };
			this.controlsEl.removeClass('is-dragging');
			this.view.dom.removeClass('be-block-dragging-editor');
			this.selectionEl.removeClass('is-visible');
			this.dropLineEl.removeClass('is-visible');
		}

		private persistSelectionForRange(from: number, to: number): void {
			const blocks = this.blocksInRange(from, to);
			const first = blocks[0];
			const last = blocks[blocks.length - 1];
			if (first === undefined || last === undefined) return;

			this.persistedSelectionSource = {
				kind: blocks.length === 1 ? 'single' : 'multi',
				blocks,
				from: first.from,
				to: last.to,
				lineFrom: first.lineFrom,
				lineTo: last.lineTo,
				primary: first,
			};
			this.positionPersistedSelection();
		}

		private clearPersistedSelection(): void {
			this.persistedSelectionSource = null;
			if (this.dragState.kind === 'idle') this.selectionEl.removeClass('is-visible');
		}

		private onAddClick(event: MouseEvent): void {
			event.preventDefault();
			event.stopPropagation();
			if (this.hoveredBlock === null || !this.plugin.settings.blocks.showAddButton) return;

			const insertAbove = event.altKey;
			const insertAt = insertAbove ? this.hoveredBlock.from : this.hoveredBlock.to;
			this.view.dispatch({
				changes: { from: insertAt, to: insertAt, insert: '\n' },
				selection: { anchor: insertAbove ? insertAt : insertAt + 1 },
				scrollIntoView: true,
			});
			this.view.focus();
			this.hideTooltip();
		}

		private positionControls(): void {
			if (this.hoveredBlock === null || !this.isLivePreview() || !this.isActiveVisibleEditor()) {
				this.hideControls();
				return;
			}

			const rect = this.hoveredRect ?? this.blockRect(this.hoveredBlock);
			if (rect === null) {
				this.hideControls();
				return;
			}

			const editorRect = this.view.dom.getBoundingClientRect();
			const contentRect = this.contentRect() ?? editorRect;
			this.controlsEl.style.top = `${this.controlTopForBlock(this.hoveredBlock, rect)}px`;
			this.controlsEl.style.left = `${Math.max(editorRect.left + 4, contentRect.left - 60)}px`;
			this.controlsEl.addClass('is-visible');
		}

		private hideControls(): void {
			if (this.dragState.kind !== 'idle') return;
			this.hoveredBlock = null;
			this.hoveredRect = null;
			this.controlsEl.removeClass('is-visible');
			this.hideTooltip();
		}

		private positionDragVisuals(): void {
			if (this.dragState.kind === 'idle') return;

			this.positionSelectionOverlay(this.dragState.source);

			const target = this.dragState.kind === 'dragging' ? this.dragState.target : null;
			const contentRect = this.contentRect();
			if (target === null || contentRect === null) {
				this.dropLineEl.removeClass('is-visible');
				return;
			}

			this.positionFixedElement(this.dropLineEl, target.top, contentRect.left, contentRect.width, 2);
			this.dropLineEl.addClass('is-visible');
		}

		private positionPersistedSelection(): void {
			if (this.dragState.kind !== 'idle' || this.persistedSelectionSource === null) return;
			this.positionSelectionOverlay(this.persistedSelectionSource);
		}

		private positionSelectionOverlay(source: DragSource): void {
			const sourceRect = this.selectionRectForSource(source);
			if (sourceRect === null) {
				this.selectionEl.removeClass('is-visible');
				return;
			}
			this.positionFixedElement(this.selectionEl, sourceRect.top, sourceRect.left, sourceRect.width, sourceRect.height);
			this.selectionEl.addClass('is-visible');
		}

		private positionFixedElement(el: HTMLElement, top: number, left: number, width: number, height: number): void {
			el.style.top = `${top}px`;
			el.style.left = `${left}px`;
			el.style.width = `${Math.max(1, width)}px`;
			el.style.height = `${Math.max(1, height)}px`;
		}

		private scheduleTooltip(): void {
			this.clearTooltipTimer();
			this.tooltipTimer = this.editorWindow().setTimeout(() => {
				this.tooltipEl.addClass('is-visible');
				this.tooltipTimer = null;
			}, 500);
		}

		private hideTooltip(): void {
			this.clearTooltipTimer();
			this.tooltipEl.removeClass('is-visible');
		}

		private clearTooltipTimer(): void {
			if (this.tooltipTimer === null) return;
			this.editorWindow().clearTimeout(this.tooltipTimer);
			this.tooltipTimer = null;
		}

		private isLivePreview(): boolean {
			return this.view.state.field(editorLivePreviewField, false) === true;
		}

		private blockAt(pos: number): BlockRange | null {
			return getBlockAtPos(this.view.state, pos, {
				enableListItemDrag: this.plugin.settings.blocks.enableListItemDrag,
				enableHtmlBlockDrag: this.plugin.settings.blocks.enableHtmlBlockDrag,
			});
		}

		private blocksInRange(from: number, to: number): BlockRange[] {
			return getBlocksInRange(this.view.state, from, to, {
				enableListItemDrag: this.plugin.settings.blocks.enableListItemDrag,
				enableHtmlBlockDrag: this.plugin.settings.blocks.enableHtmlBlockDrag,
			});
		}

		private dragSourceForBlock(block: BlockRange): DragSource {
			const selectedSource = this.selectedDragSourceForBlock(block);
			if (selectedSource !== null) return selectedSource;
			return this.singleDragSource(block);
		}

		private selectedDragSourceForBlock(block: BlockRange): DragSource | null {
			const range = this.view.state.selection.main;
			if (range.empty) return null;

			const blocks = this.blocksInRange(range.from, range.to);
			if (blocks.length === 0) return null;

			const first = blocks[0];
			const last = blocks[blocks.length - 1];
			if (first === undefined || last === undefined) return null;
			if (block.to <= first.from || block.from >= last.to) return null;

			return {
				kind: blocks.length === 1 ? 'single' : 'multi',
				blocks,
				from: first.from,
				to: last.to,
				lineFrom: first.lineFrom,
				lineTo: last.lineTo,
				primary: block,
			};
		}

		private singleDragSource(block: BlockRange): DragSource {
			return {
				kind: 'single',
				blocks: [block],
				from: block.from,
				to: block.to,
				lineFrom: block.lineFrom,
				lineTo: block.lineTo,
				primary: block,
			};
		}

		private posFromLineElement(lineEl: Element): number | null {
			const imageFrom = lineEl.getAttribute('data-be-from');
			if (imageFrom !== null) {
				const parsed = parseInt(imageFrom, 10);
				return Number.isNaN(parsed) ? null : parsed;
			}

			const sourceEl = lineEl.matches('.internal-embed.image-embed')
				? lineEl.closest('.cm-line') ?? lineEl
				: lineEl;

			try {
				return this.view.posAtDOM(sourceEl, 0);
			} catch {
				return null;
			}
		}

		private lineHitFromY(clientY: number): { block: BlockRange; rect: DOMRect } | null {
			const lineElements = Array.from(this.view.dom.querySelectorAll(BLOCK_ELEMENT_SELECTOR))
				.filter((el): el is Element => el.instanceOf(Element));

			for (const lineEl of lineElements) {
				const lineRect = lineEl.getBoundingClientRect();
				if (clientY < lineRect.top || clientY > lineRect.bottom) continue;

				const hit = this.blockHitFromLineElement(lineEl);
				if (hit !== null) return hit;
			}

			const seenBlocks = new Set<string>();
			for (const lineEl of lineElements) {
				const hit = this.blockHitFromLineElement(lineEl);
				if (hit === null) continue;

				const key = `${hit.block.from}:${hit.block.to}`;
				if (seenBlocks.has(key)) continue;
				seenBlocks.add(key);

				const rect = this.visibleRectForBlock(hit.block, lineEl);
				if (clientY < rect.top || clientY > rect.bottom) continue;
				return hit;
			}
			return null;
		}

		private blockHitFromLineElement(lineEl: Element): { block: BlockRange; rect: DOMRect } | null {
			const pos = this.posFromLineElement(lineEl);
			if (pos === null) return null;

			const block = this.blockAt(pos);
			return block === null
				? null
				: { block, rect: this.controlRectForBlock(block, lineEl) };
		}

		private dropBoundaryFromY(clientY: number, source: DragSource, slice: MoveSlice): DropBoundary | null {
			let best: { boundary: DropBoundary; distance: number } | null = null;

			for (const boundary of this.visibleDropBoundaries(source, slice)) {
				const distance = Math.abs(clientY - boundary.top);
				if (best === null || distance < best.distance) best = { boundary, distance };
			}

			return best?.boundary ?? null;
		}

		private visibleDropBoundaries(source: DragSource, slice: MoveSlice): DropBoundary[] {
			const boundaries: DropBoundary[] = [];

			for (const { block, rect } of this.visibleBlocks()) {
				this.addDropBoundary(boundaries, source, slice, {
					pos: block.from,
					top: rect.top,
					side: 'before',
				});
				this.addDropBoundary(boundaries, source, slice, {
					pos: this.positionAfterBlock(block),
					top: rect.bottom,
					side: 'after',
				});
			}

			for (const { pos, rect } of this.visibleBlankLines()) {
				this.addDropBoundary(boundaries, source, slice, {
					pos,
					top: rect.bottom,
					side: 'after',
				});
			}

			return boundaries;
		}

		private addDropBoundary(
			boundaries: DropBoundary[],
			source: DragSource,
			slice: MoveSlice,
			boundary: Omit<DropBoundary, 'isOriginal'>,
		): void {
			const isOriginalTop = boundary.pos === source.from;
			if (!isOriginalTop && boundary.pos >= slice.from && boundary.pos <= slice.to) return;
			if (boundaries.some(existing => existing.pos === boundary.pos && Math.abs(existing.top - boundary.top) < 0.5)) return;

			boundaries.push({ ...boundary, isOriginal: isOriginalTop });
		}

		private visibleBlankLines(): Array<{ pos: number; rect: DOMRect }> {
			const result: Array<{ pos: number; rect: DOMRect }> = [];
			const lineElements = Array.from(this.view.dom.querySelectorAll('.cm-line'))
				.filter((el): el is Element => el.instanceOf(Element));
			const text = this.view.state.doc.toString();

			for (const lineEl of lineElements) {
				const rect = lineEl.getBoundingClientRect();
				if (rect.height <= 0 || lineEl.textContent?.trim() !== '') continue;

				const pos = this.posFromLineElement(lineEl);
				if (pos === null) continue;

				const line = this.view.state.doc.lineAt(pos);
				const afterLine = line.to < text.length && text[line.to] === '\n' ? line.to + 1 : line.to;
				result.push({ pos: afterLine, rect });
			}

			return result;
		}

		private selectionRectForSource(source: DragSource): DOMRect | null {
			if (source.kind !== 'single' || source.primary.kind !== 'heading') {
				return this.sourceRect(source);
			}

			const line = this.view.state.doc.line(source.primary.lineFrom);
			const dom = this.view.domAtPos(line.from);
			const element = this.asElement(dom.node);
			const lineEl = element?.closest('.cm-line');
			return lineEl ? this.visibleTextRect(lineEl) : this.sourceRect(source);
		}

		private sourceRect(source: DragSource): DOMRect | null {
			const first = this.lineElementRect(source.lineFrom) ?? this.coordsRect(source.from);
			const last = this.lineElementRect(source.lineTo) ?? this.coordsRect(source.to);
			if (first === null) return null;

			const top = first.top;
			const bottom = last?.bottom ?? first.bottom;
			const left = Math.min(first.left, last?.left ?? first.left);
			const right = Math.max(first.right, last?.right ?? first.right);
			return new DOMRect(left, top, right - left, bottom - top);
		}

		private visibleRectForBlock(block: BlockRange, fallbackLineEl: Element): DOMRect {
			return this.blockRect(block) ?? this.anchorRectForBlock(block, fallbackLineEl);
		}

		private controlRectForBlock(block: BlockRange, fallbackLineEl: Element): DOMRect {
			const firstLineEl = this.lineElementForLine(block.lineFrom);
			return this.anchorRectForBlock(block, firstLineEl ?? fallbackLineEl);
		}

		private visibleBlocks(): Array<{ block: BlockRange; rect: DOMRect }> {
			const blocks = new Map<string, { block: BlockRange; rect: DOMRect }>();
			const lineElements = Array.from(this.view.dom.querySelectorAll(BLOCK_ELEMENT_SELECTOR))
				.filter((el): el is Element => el.instanceOf(Element));

			for (const lineEl of lineElements) {
				const rect = lineEl.getBoundingClientRect();
				if (rect.height <= 0) continue;

				const pos = this.posFromLineElement(lineEl);
				if (pos === null) continue;

				const block = this.blockAt(pos);
				if (block === null) continue;

				const key = `${block.from}:${block.to}`;
				if (blocks.has(key)) continue;
				blocks.set(key, { block, rect: this.visibleRectForBlock(block, lineEl) });
			}

			return Array.from(blocks.values()).sort((a, b) => a.block.from - b.block.from);
		}

		private moveSliceForSource(source: DragSource): MoveSlice {
			const text = this.view.state.doc.toString();
			let from = source.from;
			let to = source.to;

			if (to < text.length && text[to] === '\n') {
				to++;
			} else if (from > 0 && text[from - 1] === '\n') {
				from--;
			}

			return { from, to, text: text.slice(from, to) };
		}

		private textForDrop(text: string, target: DropBoundary, source: DragSource): string {
			const quoteSafeText = this.quoteSafeTextForDrop(text, source);
			if (!this.shouldSeparateFromHorizontalRule(quoteSafeText, target, source)) return quoteSafeText;
			if (this.firstSourceBlock(source).kind === 'horizontal-rule') return text.startsWith('\n') ? text : `\n${text}`;
			return quoteSafeText.endsWith('\n') ? `${quoteSafeText}\n` : `${quoteSafeText}\n\n`;
		}

		private quoteSafeTextForDrop(text: string, source: DragSource): string {
			if (this.lastSourceBlock(source).kind !== 'blockquote') return text;
			return text.endsWith('\n\n') ? text : `${text.replace(/\n?$/, '\n')}\n`;
		}

		private shouldSeparateFromHorizontalRule(text: string, target: DropBoundary, source: DragSource): boolean {
			if (target.side === 'before') {
				if (!this.isParagraphLike(this.lastSourceBlock(source))) return false;
				if (!this.isHorizontalRuleLineAt(target.pos)) return false;
				return text.trim().length > 0 && !text.endsWith('\n\n');
			}

			if (this.firstSourceBlock(source).kind !== 'horizontal-rule') return false;
			if (!this.isParagraphLikeLineBefore(target.pos)) return false;
			return text.trim().length > 0 && !text.startsWith('\n');
		}

		private firstSourceBlock(source: DragSource): BlockRange {
			return source.blocks[0] ?? source.primary;
		}

		private lastSourceBlock(source: DragSource): BlockRange {
			return source.blocks[source.blocks.length - 1] ?? source.primary;
		}

		private isParagraphLike(block: BlockRange): boolean {
			return block.kind === 'paragraph' || block.kind === 'native-image';
		}

		private isHorizontalRuleLineAt(pos: number): boolean {
			if (pos < 0 || pos > this.view.state.doc.length) return false;
			const line = this.view.state.doc.lineAt(Math.min(pos, this.view.state.doc.length));
			if (line.number > 1 && this.blockAt(line.from)?.kind === 'heading') return false;
			return /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line.text);
		}

		private isParagraphLikeLineBefore(pos: number): boolean {
			if (pos <= 0) return false;
			const before = this.view.state.doc.lineAt(Math.max(0, pos - 1));
			const block = this.blockAt(before.from);
			return block !== null && this.isParagraphLike(block);
		}

		private positionAfterBlock(block: BlockRange): number {
			const text = this.view.state.doc.toString();
			return block.to < text.length && text[block.to] === '\n' ? block.to + 1 : block.to;
		}

		private anchorRectForBlock(block: BlockRange, fallbackLineEl: Element): DOMRect {
			if (block.kind === 'heading') {
				return this.visibleTextRect(fallbackLineEl) ?? fallbackLineEl.getBoundingClientRect();
			}
			return this.lineElementRect(block.lineFrom) ?? fallbackLineEl.getBoundingClientRect();
		}

		private controlTopForBlock(block: BlockRange, rect: DOMRect): number {
			if (block.kind === 'html') return rect.top;
			return rect.top + (rect.height - 24) / 2;
		}

		private visibleTextRect(lineEl: Element): DOMRect | null {
			const walker = this.editorDocument().createTreeWalker(lineEl, NodeFilter.SHOW_TEXT);
			let node = walker.nextNode();
			while (node !== null) {
				const text = node.textContent ?? '';
				if (text.trim().length > 0) {
					const range = this.editorDocument().createRange();
					range.selectNodeContents(node);
					const rect = range.getBoundingClientRect();
					range.detach();
					return rect.height > 0 ? rect : null;
				}
				node = walker.nextNode();
			}
			return null;
		}

		private blockRect(block: BlockRange): DOMRect | null {
			const first = this.lineElementRect(block.lineFrom) ?? this.coordsRect(block.from);
			const last = this.lineElementRect(block.lineTo) ?? this.coordsRect(block.to);
			if (first === null) return null;

			const top = first.top;
			const bottom = last?.bottom ?? first.bottom;
			const left = Math.min(first.left, last?.left ?? first.left);
			const right = Math.max(first.right, last?.right ?? first.right);
			return new DOMRect(left, top, right - left, bottom - top);
		}

		private lineElementRect(lineNumber: number): DOMRect | null {
			return this.lineElementForLine(lineNumber)?.getBoundingClientRect() ?? null;
		}

		private lineElementForLine(lineNumber: number): Element | null {
			const line = this.view.state.doc.line(lineNumber);
			const dom = this.view.domAtPos(line.from);
			const element = this.asElement(dom.node);
			return element?.closest(BLOCK_ELEMENT_SELECTOR) ?? null;
		}

		private coordsRect(pos: number): DOMRect | null {
			const coords = this.view.coordsAtPos(pos);
			if (coords !== null) {
				return new DOMRect(coords.left, coords.top, Math.max(1, coords.right - coords.left), coords.bottom - coords.top);
			}

			const dom = this.view.domAtPos(pos);
			const element = this.asElement(dom.node);
			return element?.closest(BLOCK_ELEMENT_SELECTOR)?.getBoundingClientRect() ?? null;
		}

		private asElement(node: Node): Element | null {
			return node.instanceOf(Element) ? node : node.parentElement;
		}

		private contentRect(): DOMRect | null {
			return this.view.dom.querySelector('.cm-content')?.getBoundingClientRect() ?? null;
		}

		private scrollerElement(): HTMLElement {
			return this.view.scrollDOM;
		}

		private isActiveVisibleEditor(): boolean {
			if (this.view.dom.offsetParent === null) return false;
			return this.view.dom.closest('.workspace-leaf.mod-active') !== null;
		}

		private editorDocument(): Document {
			return this.view.dom.ownerDocument;
		}

		private editorWindow(): Window {
			return this.view.dom.ownerDocument.defaultView ?? window;
		}
	});
}
