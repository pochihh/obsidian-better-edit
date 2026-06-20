import { Extension, StateEffect } from '@codemirror/state';
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { App, Menu, editorLivePreviewField } from 'obsidian';
import type BetterEditPlugin from '../../main';
import { resolveDragSourceForBlock } from './block-drag-source';
import { allowBlankLineDropBoundary, duplicateBlockTextForSource, lineSafeTextForDrop, tableSafeTextForDrop } from './block-spacing';
import { BlockRange, getBlockAtPos, getBlocksInRange } from './block-model';
import { BlockTurnIntoTarget, canTurnIntoSource, turnBlockTextInto } from './block-transform';
import { resolveBlockControlPlacement } from './control-placement';

type MenuItemWithSubmenu = {
	setSubmenu?: () => Menu;
};

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

interface TableWidgetEntry {
	block: BlockRange;
	el: Element;
	rect: DOMRect;
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
const BLOCK_GUTTER_HIT_WIDTH_PX = 72;
const BLOCK_ELEMENT_SELECTOR = '.cm-line, .cm-html-embed.cm-embed-block, .cm-preview-code-block.cm-embed-block, .cm-table-widget, .be-image-widget, .be-image-row-widget, .internal-embed.image-embed';
const blocksFeatureEnabledEffect = StateEffect.define<boolean>();

export function refreshBlockControls(app: App): void {
	app.workspace.iterateAllLeaves(leaf => {
		const viewWithEditor = leaf.view as { editor?: { cm?: unknown } };
		const cm = viewWithEditor.editor?.cm;
		if (cm instanceof EditorView) {
			cm.dispatch({ effects: blocksFeatureEnabledEffect.of(true) });
		}
	});
}

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
		private selectedSource: DragSource | null = null;
		private persistedSelectionSource: DragSource | null = null;
		private activePointerId: number | null = null;
		private visualRefreshFrame: number | null = null;
		private selectedTableWidgetEl: HTMLElement | null = null;

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

			this.editorDocument().body.appendChild(this.controlsEl);
			this.editorDocument().body.appendChild(this.selectionEl);
			this.editorDocument().body.appendChild(this.dropLineEl);
			this.hideControls();

			this.plugin.registerDomEvent(this.editorDocument(), 'pointermove', (event: PointerEvent) => this.onPointerMove(event));
			this.plugin.registerDomEvent(this.editorDocument(), 'pointerdown', () => this.onDocumentPointerDown());
			this.plugin.registerDomEvent(this.editorDocument(), 'pointerup', (event: PointerEvent) => this.onPointerUp(event));
			this.plugin.registerDomEvent(this.editorDocument(), 'pointercancel', () => this.cancelDrag());
			this.plugin.registerDomEvent(this.dragHandleEl, 'lostpointercapture', () => this.cancelDrag());
			this.plugin.registerDomEvent(
				this.editorDocument(),
				'keydown',
				(event: KeyboardEvent) => this.onKeyDown(event),
				{ capture: true },
			);
			this.plugin.registerDomEvent(this.scrollerElement(), 'scroll', () => this.onEditorScroll(), { passive: true });
			this.plugin.registerDomEvent(this.controlsEl, 'wheel', (event: WheelEvent) => this.forwardWheelToScroller(event), { passive: true });
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
			if (!this.blocksEnabled() || !this.isLivePreview() || !this.isPrimaryEditorView()) {
				this.hideControls();
				this.clearSelectedSource();
				this.clearPersistedSelection();
				return;
			}
			if (update.docChanged && this.dragState.kind === 'idle') {
				this.clearSelectedSource();
				this.clearPersistedSelection();
			}
			if (update.docChanged || update.viewportChanged || update.geometryChanged) {
				this.scheduleVisualRefresh();
			}
		}

		destroy(): void {
			this.cancelDrag();
			this.clearTooltipTimer();
			this.clearVisualRefreshFrame();
			this.clearNativeTableSelectionUi();
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

			if (!this.blocksEnabled() || !this.isLivePreview() || !this.isPrimaryEditorView() || !this.isActiveVisibleEditor()) {
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
			if (contentRect !== null && event.clientX < contentRect.left && event.clientX >= contentRect.left - BLOCK_GUTTER_HIT_WIDTH_PX) {
				const gutterHit = this.lineHitFromY(event.clientY)
					?? this.blockHitFromCoords(contentRect.left + 8, event.clientY);
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

			const lineEl = this.hoverElementForPoint(pointEl);
			if (lineEl === null || !this.view.dom.contains(lineEl) || !this.belongsToThisEditor(lineEl)) {
				const hit = this.blockHitFromCoords(event.clientX, event.clientY);
				if (hit === null) {
					this.hideControls();
					return;
				}
				this.hoveredBlock = hit.block;
				this.hoveredRect = hit.rect;
				this.positionControls();
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
			if (block.kind === 'table' && !lineEl.matches('.cm-table-widget')) {
				this.hideControls();
				return;
			}

			this.hoveredBlock = block;
			this.hoveredRect = this.controlRectForBlock(block, lineEl);
			this.positionControls();
		}

		private onDragHandlePointerDown(event: PointerEvent): void {
			if (event.button !== 0 || this.hoveredBlock === null || !this.blocksEnabled()) return;

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
			this.activePointerId = event.pointerId;
			try {
				this.dragHandleEl.setPointerCapture(event.pointerId);
			} catch {
				// Pointer capture can fail in some browser states; dragging still falls back to document events.
			}

			this.controlsEl.addClass('is-dragging');
			this.view.dom.addClass('be-block-dragging-editor');
			this.positionDragVisuals();
		}

		private onPointerUp(event: PointerEvent): void {
			if (this.dragState.kind === 'pressed') {
				event.preventDefault();
				event.stopPropagation();
				const source = this.dragState.source;
				this.resetDragUi();
				this.showBlockOperationMenu(source, event.clientX, event.clientY);
				return;
			}
			if (this.dragState.kind !== 'dragging') return;
			event.preventDefault();
			event.stopPropagation();
			this.finishDrag();
		}

		private onDocumentPointerDown(): void {
			if (this.dragState.kind !== 'idle') return;
			if (!this.blocksEnabled()) return;
			this.clearSelectedSource();
			this.clearPersistedSelection();
		}

		private onKeyDown(event: KeyboardEvent): void {
			if (event.key === 'Escape') {
				if (this.dragState.kind !== 'idle') {
					this.cancelDrag();
					return;
				}
				if (this.selectedSource !== null) {
					event.preventDefault();
					event.stopPropagation();
					this.clearSelectedSource();
				}
				return;
			}

			if (!this.blocksEnabled() || !this.isLivePreview() || !this.isPrimaryEditorView() || !this.isActiveVisibleEditor()) return;

			if (this.selectedSource !== null) {
				if (event.key === 'Backspace' || event.key === 'Delete') {
					event.preventDefault();
					event.stopPropagation();
					this.deleteSelectedSource();
					return;
				}
				if (event.key === 'Enter') {
					event.preventDefault();
					event.stopPropagation();
					this.restoreCaretAfterSelectedSource();
				}
				return;
			}

			if (this.dragState.kind !== 'idle') return;
			if (event.key !== 'Backspace' && event.key !== 'Delete') return;

			const source = this.tableSelectionCandidateFromCursor();
			if (source === null) return;

			event.preventDefault();
			event.stopPropagation();
			this.selectSource(source);
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
			if (this.selectionSourceForOverlay() !== null) {
				this.positionSelectionStateOverlay();
			}
			this.hideControls();
		}

		private forwardWheelToScroller(event: WheelEvent): void {
			if (this.dragState.kind !== 'idle') return;
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

		private selectSource(source: DragSource): void {
			this.selectedSource = source;
			this.clearPersistedSelection();
			this.positionSelectionStateOverlay();
		}

		private clearSelectedSource(): void {
			this.selectedSource = null;
			this.clearNativeTableSelectionUi();
			if (this.dragState.kind === 'idle' && this.persistedSelectionSource === null) {
				this.selectionEl.removeClass('is-visible');
			}
		}

		private deleteSelectedSource(): void {
			if (this.selectedSource === null) return;

			const { from, to } = this.moveSliceForSource(this.selectedSource);
			this.clearSelectedSource();
			this.view.dispatch({
				changes: { from, to, insert: '' },
				selection: { anchor: from },
				scrollIntoView: true,
			});
			this.view.focus();
		}

		private restoreCaretAfterSelectedSource(): void {
			if (this.selectedSource === null) return;

			const source = this.selectedSource;
			const anchor = this.ensureCaretLineAfterSource(source);
			this.clearSelectedSource();
			this.view.dispatch({
				selection: { anchor },
				scrollIntoView: true,
			});
			this.view.focus();
		}

		private showBlockOperationMenu(source: DragSource, x: number, y: number): void {
			const menu = new Menu();

			if (this.plugin.settings.blocks.showAddButton && this.controlsEl.classList.contains('is-add-collapsed')) {
				menu.addItem(item => {
					item.setTitle('Add line above');
					item.setIcon('plus');
					item.onClick(() => this.addLineNearSource(source, true));
				});
				menu.addItem(item => {
					item.setTitle('Add line below');
					item.setIcon('plus');
					item.onClick(() => this.addLineNearSource(source, false));
				});
				menu.addSeparator();
			}

			menu.addItem(item => {
				item.setTitle('Delete');
				item.setIcon('trash');
				item.onClick(() => this.deleteSource(source));
			});
			menu.addItem(item => {
				item.setTitle('Create copy');
				item.setIcon('copy');
				item.onClick(() => this.copySource(source));
			});

			const sourceText = this.textForSource(source);
			const canTurnInto = canTurnIntoSource(sourceText);
			let submenuAttached = false;
			menu.addItem(item => {
				item.setTitle('Turn into');
				item.setIcon('replace');
				if (!canTurnInto) {
					item.setDisabled(true);
					return;
				}
				const submenu = (item as MenuItemWithSubmenu).setSubmenu?.();
				if (submenu !== undefined) {
					submenuAttached = true;
					this.addTurnIntoItems(submenu, source);
					return;
				}
				item.setDisabled(true);
			});
			if (canTurnInto && !submenuAttached) {
				menu.addSeparator();
				menu.addItem(item => item.setTitle('Turn into').setIsLabel(true));
				this.addTurnIntoItems(menu, source);
			}

			menu.showAtPosition({ x, y });
		}

		private addTurnIntoItems(menu: Menu, source: DragSource): void {
			this.addTurnIntoItem(menu, source, 'Paragraph', 'paragraph');
			this.addTurnIntoItem(menu, source, 'Heading 1', 'heading-1');
			this.addTurnIntoItem(menu, source, 'Heading 2', 'heading-2');
			this.addTurnIntoItem(menu, source, 'Heading 3', 'heading-3');
			this.addTurnIntoItem(menu, source, 'Bullet list', 'bullet-list');
			this.addTurnIntoItem(menu, source, 'Numbered list', 'numbered-list');
			this.addTurnIntoItem(menu, source, 'Checkbox', 'checkbox');
			this.addTurnIntoItem(menu, source, 'Code block', 'code-block');
		}

		private addTurnIntoItem(menu: Menu, source: DragSource, title: string, target: BlockTurnIntoTarget): void {
			menu.addItem(item => {
				item.setTitle(title);
				item.onClick(() => this.turnSourceInto(source, target));
			});
		}

		private deleteSource(source: DragSource): void {
			const { from, to } = this.moveSliceForSource(source);
			this.clearSelectedSource();
			this.clearPersistedSelection();
			this.view.dispatch({
				changes: { from, to, insert: '' },
				selection: { anchor: from },
				scrollIntoView: true,
			});
			this.view.focus();
		}

		private copySource(source: DragSource): void {
			const text = this.textForSource(source);
			const replacement = duplicateBlockTextForSource(text, {
				firstBlockKind: this.firstSourceBlock(source).kind,
				lastBlockKind: this.lastSourceBlock(source).kind,
			});
			this.view.dispatch({
				changes: { from: source.from, to: source.to, insert: replacement },
				selection: { anchor: source.from + replacement.length },
				scrollIntoView: true,
			});
			this.view.focus();
			this.persistSelectionForRange(source.from, source.from + replacement.length);
		}

		private turnSourceInto(source: DragSource, target: BlockTurnIntoTarget): void {
			const text = this.textForSource(source);
			if (!canTurnIntoSource(text)) return;
			const replacement = turnBlockTextInto(text, target);
			this.clearSelectedSource();
			this.clearPersistedSelection();
			this.view.dispatch({
				changes: { from: source.from, to: source.to, insert: replacement },
				selection: { anchor: source.from + replacement.length },
				scrollIntoView: true,
			});
			this.view.focus();
			this.persistSelectionForRange(source.from, source.from + replacement.length);
		}

		private textForSource(source: DragSource): string {
			return this.view.state.doc.sliceString(source.from, source.to);
		}

		private resetDragUi(): void {
			if (this.activePointerId !== null && this.dragHandleEl.hasPointerCapture(this.activePointerId)) {
				try {
					this.dragHandleEl.releasePointerCapture(this.activePointerId);
				} catch {
					// Ignore release failures from already-lost capture.
				}
			}
			this.activePointerId = null;
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
			this.positionSelectionStateOverlay();
		}

		private clearPersistedSelection(): void {
			this.persistedSelectionSource = null;
			if (this.dragState.kind === 'idle' && this.selectedSource === null) this.selectionEl.removeClass('is-visible');
		}

		private onAddClick(event: MouseEvent): void {
			event.preventDefault();
			event.stopPropagation();
			if (this.hoveredBlock === null || !this.blocksEnabled() || !this.plugin.settings.blocks.showAddButton) return;

			this.addLineNearBlock(this.hoveredBlock, event.altKey);
			this.hideTooltip();
		}

		private addLineNearSource(source: DragSource, insertAbove: boolean): void {
			this.addLineNearRange(insertAbove ? source.from : source.to, insertAbove);
		}

		private addLineNearBlock(block: BlockRange, insertAbove: boolean): void {
			this.addLineNearRange(insertAbove ? block.from : block.to, insertAbove);
		}

		private addLineNearRange(insertAt: number, insertAbove: boolean): void {
			this.view.dispatch({
				changes: { from: insertAt, to: insertAt, insert: '\n' },
				selection: { anchor: insertAbove ? insertAt : insertAt + 1 },
				scrollIntoView: true,
			});
			this.view.focus();
		}

		private positionControls(): void {
			if (this.hoveredBlock === null || !this.blocksEnabled() || !this.isLivePreview() || !this.isActiveVisibleEditor()) {
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
			const controlTop = this.controlTopForBlock(this.hoveredBlock, rect);
			const placement = resolveBlockControlPlacement({
				contentLeft: contentRect.left,
				boundaryLeft: this.controlBoundaryLeft(contentRect.left, editorRect.left),
				showAddButton: this.plugin.settings.blocks.showAddButton,
			});
			this.controlsEl.toggleClass('is-add-collapsed', !placement.showAddButton);
			this.controlsEl.style.width = `${placement.width}px`;
			this.controlsEl.style.top = `${controlTop}px`;
			this.controlsEl.style.left = `${placement.left}px`;
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

		private positionSelectionStateOverlay(): void {
			if (this.dragState.kind !== 'idle') return;
			const source = this.selectionSourceForOverlay();
			if (source === null) return;
			this.positionSelectionOverlay(source);
		}

		private scheduleVisualRefresh(): void {
			if (this.visualRefreshFrame !== null) return;
			this.visualRefreshFrame = this.editorWindow().requestAnimationFrame(() => {
				this.visualRefreshFrame = null;
				if (!this.blocksEnabled() || !this.isLivePreview()) return;
				this.positionControls();
				this.positionDragVisuals();
				this.positionSelectionStateOverlay();
			});
		}

		private clearVisualRefreshFrame(): void {
			if (this.visualRefreshFrame === null) return;
			this.editorWindow().cancelAnimationFrame(this.visualRefreshFrame);
			this.visualRefreshFrame = null;
		}

		private positionSelectionOverlay(source: DragSource): void {
			if (this.applyNativeTableSelectionUi(source)) {
				this.selectionEl.removeClass('is-visible');
				return;
			}
			this.clearNativeTableSelectionUi();

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
				const btnRect = this.addButtonEl.getBoundingClientRect();
				this.tooltipEl.style.top = `${btnRect.bottom + 6}px`;
				this.tooltipEl.style.left = `${btnRect.left}px`;
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

		private blocksEnabled(): boolean {
			return this.plugin.settings.blocks.enabled;
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
			return resolveDragSourceForBlock(
				block,
				this.selectedSource,
				this.selectedDragSourceForBlock(block),
				this.singleDragSource(block),
			);
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
			for (const entry of this.visibleTableWidgetEntries()) {
				if (clientY >= entry.rect.top && clientY <= entry.rect.bottom) {
					return { block: entry.block, rect: entry.rect };
				}
			}

			const lineElements = Array.from(this.view.dom.querySelectorAll(BLOCK_ELEMENT_SELECTOR))
				.filter((el): el is Element =>
					el.instanceOf(Element)
					&& this.belongsToThisEditor(el)
					&& !el.matches('.cm-table-widget'));

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
			if (lineEl.matches('.cm-table-widget')) {
				return this.tableWidgetHit(lineEl);
			}

			const pos = this.posFromLineElement(lineEl);
			if (pos === null) return null;

			const block = this.blockAt(pos);
			if (block?.kind === 'table' && !lineEl.matches('.cm-table-widget')) return null;
			if (block === null) return null;
			const rect = this.hoverRectForBlock(block, lineEl);
			return rect === null ? null : { block, rect };
		}

		private blockHitFromCoords(clientX: number, clientY: number): { block: BlockRange; rect: DOMRect } | null {
			const pos = this.view.posAtCoords({ x: clientX, y: clientY }, false);
			if (pos === null) return null;

			const block = this.blockAt(pos);
			if (block === null) return null;

			const rect = this.hoverRectForBlock(block);
			return rect === null ? null : { block, rect };
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
				if (!allowBlankLineDropBoundary({
					firstBlockKind: this.firstSourceBlock(source).kind,
					lastBlockKind: this.lastSourceBlock(source).kind,
					previousBlockKind: this.nearestBlockBefore(pos)?.kind ?? null,
					nextBlockKind: this.nearestBlockAtOrAfter(pos)?.kind ?? null,
				})) continue;
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
				.filter((el): el is Element => el.instanceOf(Element) && this.belongsToThisEditor(el));
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

		private hoverRectForBlock(block: BlockRange, fallbackLineEl?: Element): DOMRect | null {
			if (block.kind === 'table') {
				const tableEl = this.tableWidgetElementForBlock(block);
				return tableEl === null && fallbackLineEl === undefined
					? null
					: this.controlRectForBlock(block, tableEl ?? fallbackLineEl ?? this.view.dom);
			}
			const firstLineEl = this.lineElementForLine(block.lineFrom);
			const lineEl = firstLineEl ?? fallbackLineEl;
			return lineEl === null || lineEl === undefined
				? this.coordsRect(block.from)
				: this.controlRectForBlock(block, lineEl);
		}

		private controlRectForBlock(block: BlockRange, fallbackLineEl: Element): DOMRect {
			if (block.kind === 'table') {
				const tableEl = this.tableWidgetElementForBlock(block);
				return this.tableControlRect(tableEl ?? fallbackLineEl);
			}
			const firstLineEl = this.lineElementForLine(block.lineFrom);
			return this.anchorRectForBlock(block, firstLineEl ?? fallbackLineEl);
		}

		private visibleBlocks(): Array<{ block: BlockRange; rect: DOMRect }> {
			const blocks = new Map<string, { block: BlockRange; rect: DOMRect }>();
			for (const entry of this.visibleTableWidgetEntries()) {
				const key = `${entry.block.from}:${entry.block.to}`;
				blocks.set(key, { block: entry.block, rect: entry.rect });
			}

			const lineElements = Array.from(this.view.dom.querySelectorAll(BLOCK_ELEMENT_SELECTOR))
				.filter((el): el is Element =>
					el.instanceOf(Element)
					&& this.belongsToThisEditor(el)
					&& !el.matches('.cm-table-widget'));

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
			const tableSafeText = this.tableSafeTextForDrop(quoteSafeText, target, source);
			const lineSafeText = this.lineSafeTextForDrop(tableSafeText, target, source);
			if (!this.shouldSeparateFromHorizontalRule(lineSafeText, target, source)) return lineSafeText;
			if (this.firstSourceBlock(source).kind === 'horizontal-rule') return lineSafeText.startsWith('\n') ? lineSafeText : `\n${lineSafeText}`;
			return lineSafeText.endsWith('\n') ? `${lineSafeText}\n` : `${lineSafeText}\n\n`;
		}

		private quoteSafeTextForDrop(text: string, source: DragSource): string {
			if (this.lastSourceBlock(source).kind !== 'blockquote') return text;
			return text.endsWith('\n\n') ? text : `${text.replace(/\n?$/, '\n')}\n`;
		}

		private tableSafeTextForDrop(text: string, target: DropBoundary, source: DragSource): string {
			const previousBlock = this.nearestBlockBefore(target.pos);
			const nextBlock = this.nearestBlockAtOrAfter(target.pos);
			return tableSafeTextForDrop(text, {
				firstBlockKind: this.firstSourceBlock(source).kind,
				lastBlockKind: this.lastSourceBlock(source).kind,
				previousBlockKind: previousBlock?.kind ?? null,
				nextBlockKind: nextBlock?.kind ?? null,
				hasBlankLineBeforeTarget: this.hasBlankLineBefore(target.pos),
			});
		}

		private lineSafeTextForDrop(text: string, target: DropBoundary, source: DragSource): string {
			if (this.firstSourceBlock(source).kind === 'table' || this.lastSourceBlock(source).kind === 'table') return text;
			return lineSafeTextForDrop(text, {
				insertionAtLineStart: target.pos === 0 || this.view.state.doc.sliceString(target.pos - 1, target.pos) === '\n',
			});
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

		private nearestBlockBefore(pos: number): BlockRange | null {
			if (pos <= 0) return null;
			let lineNumber = this.view.state.doc.lineAt(Math.max(0, pos - 1)).number;

			while (lineNumber >= 1) {
				const line = this.view.state.doc.line(lineNumber);
				if (line.text.trim() === '') {
					lineNumber--;
					continue;
				}

				return this.blockAt(line.from);
			}

			return null;
		}

		private nearestBlockAtOrAfter(pos: number): BlockRange | null {
			if (pos >= this.view.state.doc.length) return null;
			let lineNumber = this.view.state.doc.lineAt(Math.min(pos, this.view.state.doc.length)).number;

			while (lineNumber <= this.view.state.doc.lines) {
				const line = this.view.state.doc.line(lineNumber);
				if (line.text.trim() === '') {
					lineNumber++;
					continue;
				}

				return this.blockAt(line.from);
			}

			return null;
		}

		private hasBlankLineBefore(pos: number): boolean {
			if (pos <= 0) return false;
			return this.view.state.doc.lineAt(Math.max(0, pos - 1)).text.trim() === '';
		}

		private selectionSourceForOverlay(): DragSource | null {
			return this.selectedSource ?? this.persistedSelectionSource;
		}

		private tableSelectionCandidateFromCursor(): DragSource | null {
			const range = this.view.state.selection.main;
			if (!range.empty) return null;

			const line = this.view.state.doc.lineAt(range.from);
			if (line.text.trim() !== '') return null;

			const previous = this.nearestBlockBefore(range.from);
			if (previous?.kind === 'table') {
				const previousEnd = this.positionAfterBlock(previous);
				if (line.from === previousEnd) {
					return this.singleDragSource(previous);
				}
			}

			const next = this.nearestBlockAtOrAfter(range.from);
			if (next?.kind === 'table' && line.to === next.from) {
				return this.singleDragSource(next);
			}

			return null;
		}

		private ensureCaretLineAfterSource(source: DragSource): number {
			const pos = this.positionAfterBlock(this.lastSourceBlock(source));
			if (pos < this.view.state.doc.length) return pos;

			this.view.dispatch({
				changes: { from: this.view.state.doc.length, to: this.view.state.doc.length, insert: '\n' },
			});
			return this.view.state.doc.length + 1;
		}

		private positionAfterBlock(block: BlockRange): number {
			const text = this.view.state.doc.toString();
			return block.to < text.length && text[block.to] === '\n' ? block.to + 1 : block.to;
		}

		private anchorRectForBlock(block: BlockRange, fallbackLineEl: Element): DOMRect {
			if (block.kind === 'heading') {
				return this.firstVisualLineRect(fallbackLineEl) ?? fallbackLineEl.getBoundingClientRect();
			}
			if (block.kind === 'table') {
				const tableEl = this.tableWidgetElementForBlock(block);
				return this.tableControlRect(tableEl ?? fallbackLineEl);
			}
			if (block.kind === 'html') {
				// Use element bounds directly — firstVisualLineRect can pick up text inside
				// buttons/icons and return a rect offset from the true element top.
				return fallbackLineEl.getBoundingClientRect();
			}
			return this.firstVisualLineRect(fallbackLineEl)
				?? this.lineElementRect(block.lineFrom)
				?? fallbackLineEl.getBoundingClientRect();
		}

		private controlTopForBlock(block: BlockRange, rect: DOMRect): number {
			if (block.kind === 'html' || block.kind === 'table') return rect.top;
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

		private firstVisualLineRect(lineEl: Element): DOMRect | null {
			const walker = this.editorDocument().createTreeWalker(lineEl, NodeFilter.SHOW_TEXT);
			let bestRect: DOMRect | null = null;
			let node = walker.nextNode();

			while (node !== null) {
				const text = node.textContent ?? '';
				if (text.trim().length > 0) {
					const range = this.editorDocument().createRange();
					range.selectNodeContents(node);
					const rects = Array.from(range.getClientRects());
					range.detach();
					for (const rect of rects) {
						if (rect.height <= 0 || rect.width <= 0) continue;
						if (bestRect === null || rect.top < bestRect.top || (rect.top === bestRect.top && rect.left < bestRect.left)) {
							bestRect = new DOMRect(rect.left, rect.top, rect.width, rect.height);
						}
					}
				}
				node = walker.nextNode();
			}

			return bestRect;
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

		private tableWidgetElementForBlock(block: BlockRange): Element | null {
			return this.visibleTableWidgetEntries().find(entry =>
				entry.block.from === block.from && entry.block.to === block.to,
			)?.el ?? null;
		}

		private applyNativeTableSelectionUi(source: DragSource): boolean {
			if (source.kind !== 'single' || source.primary.kind !== 'table') return false;

			const tableEl = this.tableWidgetElementForBlock(source.primary);
			if (!tableEl?.instanceOf(HTMLElement)) return false;

			this.clearNativeTableSelectionUi();
			tableEl.addClass('has-selection');
			tableEl.addClass('has-focus');

			const rows = Array.from(tableEl.querySelectorAll('tr'));
			for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
				const row = rows[rowIndex];
				if (row === undefined) continue;
				if (!row.instanceOf(HTMLTableRowElement)) continue;
				const cells = Array.from(row.querySelectorAll('th, td'));
				for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
					const cell = cells[cellIndex];
					if (cell === undefined) continue;
					if (!cell.instanceOf(HTMLElement)) continue;
					cell.addClass('is-selected');
					if (cellIndex === 0) cell.addClass('start');
					if (cellIndex === cells.length - 1) cell.addClass('end');
					if (rowIndex === 0) cell.addClass('top');
					if (rowIndex === rows.length - 1) cell.addClass('bottom');
				}
			}

			this.selectedTableWidgetEl = tableEl;
			return true;
		}

		private clearNativeTableSelectionUi(): void {
			const tableEl = this.selectedTableWidgetEl;
			if (tableEl === null) return;

			tableEl.removeClass('has-selection');
			const selectedCells = tableEl.querySelectorAll('.is-selected, .start, .end, .top, .bottom');
			selectedCells.forEach(cell => {
				if (!cell.instanceOf(HTMLElement)) return;
				cell.removeClass('is-selected');
				cell.removeClass('start');
				cell.removeClass('end');
				cell.removeClass('top');
				cell.removeClass('bottom');
			});

			this.selectedTableWidgetEl = null;
		}

		private tableWidgetHit(tableEl: Element): { block: BlockRange; rect: DOMRect } | null {
			const entry = this.visibleTableWidgetEntries().find(candidate => candidate.el === tableEl);
			return entry === undefined ? null : { block: entry.block, rect: this.tableControlRect(entry.el) };
		}

		private tableControlRect(tableEl: Element): DOMRect {
			const firstRow = tableEl.querySelector('tr');
			return firstRow?.getBoundingClientRect() ?? tableEl.getBoundingClientRect();
		}

		private visibleTableWidgetEntries(): TableWidgetEntry[] {
			const widgets = Array.from(this.view.dom.querySelectorAll('.cm-table-widget'))
				.filter((el): el is Element => el.instanceOf(Element) && this.belongsToThisEditor(el))
				.map(el => ({ el, rect: this.tableControlRect(el) }))
				.filter(entry => entry.rect.height > 0)
				.sort((a, b) => a.rect.top - b.rect.top);
			const blocks = this.visibleTableBlocks();
			const count = Math.min(widgets.length, blocks.length);
			const entries: TableWidgetEntry[] = [];

			for (let index = 0; index < count; index++) {
				const widget = widgets[index];
				const block = blocks[index];
				if (widget === undefined || block === undefined) continue;
				entries.push({ block, el: widget.el, rect: widget.rect });
			}

			return entries;
		}

		private visibleTableBlocks(): BlockRange[] {
			const blocks = new Map<string, BlockRange>();

			for (const range of this.view.visibleRanges) {
				const from = Math.max(0, Math.min(range.from, this.view.state.doc.length));
				const to = Math.min(this.view.state.doc.length, Math.max(range.from, range.to));
				const startLine = this.view.state.doc.lineAt(from).number;
				const endLine = this.view.state.doc.lineAt(Math.max(from, to - 1)).number;

				for (let lineNumber = startLine; lineNumber <= endLine; lineNumber++) {
					const line = this.view.state.doc.line(lineNumber);
					const block = this.blockAt(line.from);
					if (block?.kind !== 'table') continue;
					const key = `${block.from}:${block.to}`;
					blocks.set(key, block);
					lineNumber = block.lineTo;
				}
			}

			return Array.from(blocks.values()).sort((a, b) => a.from - b.from);
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
			return this.view.contentDOM.getBoundingClientRect();
		}

		private controlBoundaryLeft(contentLeft: number, fallbackLeft: number): number {
			let el = this.view.dom.parentElement;
			while (el !== null && el !== this.editorDocument().body) {
				const style = this.editorWindow().getComputedStyle(el);
				if (/(auto|scroll|hidden|clip)/.test(`${style.overflow}${style.overflowX}${style.overflowY}`)) {
					const rect = el.getBoundingClientRect();
					if (rect.width > 0 && rect.left < contentLeft - 0.5 && rect.right >= contentLeft) return rect.left;
				}
				el = el.parentElement;
			}
			return fallbackLeft;
		}

		private belongsToThisEditor(el: Element): boolean {
			return el.closest('.cm-editor') === this.view.dom;
		}

		private hoverElementForPoint(pointEl: Element): Element | null {
			const tableWidget = pointEl.closest('.cm-table-widget');
			if (tableWidget !== null && this.view.dom.contains(tableWidget)) return tableWidget;
			return pointEl.closest(BLOCK_ELEMENT_SELECTOR);
		}

		private scrollerElement(): HTMLElement {
			return this.view.scrollDOM;
		}

		private isActiveVisibleEditor(): boolean {
			if (this.view.dom.offsetParent === null) return false;
			return this.view.dom.closest('.workspace-leaf.mod-active') !== null;
		}

		private isPrimaryEditorView(): boolean {
			const sourceView = this.view.dom.closest('.markdown-source-view');
			if (sourceView === null) return true;
			return sourceView.querySelector('.cm-editor') === this.view.dom;
		}

		private editorDocument(): Document {
			return this.view.dom.ownerDocument;
		}

		private editorWindow(): Window {
			return this.view.dom.ownerDocument.defaultView ?? window;
		}
	});
}
