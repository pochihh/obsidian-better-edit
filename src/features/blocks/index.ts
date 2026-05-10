import { Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { editorLivePreviewField } from 'obsidian';
import type BetterEditPlugin from '../../main';
import { BlockRange, getBlockAtPos } from './block-model';

export function createBlocksExtension(plugin: BetterEditPlugin): Extension {
	return ViewPlugin.fromClass(class {
		private readonly view: EditorView;
		private readonly plugin: BetterEditPlugin;
		private readonly controlsEl: HTMLElement;
		private readonly addButtonEl: HTMLButtonElement;
		private readonly dragHandleEl: HTMLButtonElement;
		private readonly tooltipEl: HTMLElement;
		private hoveredBlock: BlockRange | null = null;
		private hoveredRect: DOMRect | null = null;
		private tooltipTimer: number | null = null;

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

			if (!this.plugin.settings.blocks.showAddButton) {
				this.addButtonEl.hide();
			}

			this.editorDocument().body.appendChild(this.controlsEl);
			this.hideControls();

			this.plugin.registerDomEvent(this.editorDocument(), 'pointermove', (event: PointerEvent) => this.onPointerMove(event));
			this.plugin.registerDomEvent(this.addButtonEl, 'click', (event: MouseEvent) => this.onAddClick(event));
			this.plugin.registerDomEvent(this.addButtonEl, 'mouseenter', () => this.scheduleTooltip());
			this.plugin.registerDomEvent(this.addButtonEl, 'mouseleave', () => this.hideTooltip());
			this.plugin.registerDomEvent(this.dragHandleEl, 'dragstart', (event: DragEvent) => {
				event.preventDefault();
				event.stopPropagation();
			});
		}

		update(update: ViewUpdate): void {
			if (!this.isLivePreview()) {
				this.hideControls();
				return;
			}
			if (update.docChanged || update.viewportChanged || update.geometryChanged) {
				this.positionControls();
			}
		}

		destroy(): void {
			this.clearTooltipTimer();
			this.controlsEl.remove();
		}

		private onPointerMove(event: PointerEvent): void {
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

			const lineEl = pointEl.closest('.cm-line, .cm-html-embed.cm-embed-block, .be-image-widget');
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
			this.hoveredRect = this.anchorRectForBlock(block, lineEl);
			this.positionControls();
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
			this.hoveredBlock = null;
			this.hoveredRect = null;
			this.controlsEl.removeClass('is-visible');
			this.hideTooltip();
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

		private posFromLineElement(lineEl: Element): number | null {
			const imageFrom = lineEl.getAttribute('data-be-from');
			if (imageFrom !== null) {
				const parsed = parseInt(imageFrom, 10);
				return Number.isNaN(parsed) ? null : parsed;
			}

			try {
				return this.view.posAtDOM(lineEl, 0);
			} catch {
				return null;
			}
		}

		private lineHitFromY(clientY: number): { block: BlockRange; rect: DOMRect } | null {
			const lineElements = Array.from(this.view.dom.querySelectorAll('.cm-line, .cm-html-embed.cm-embed-block, .be-image-widget'))
				.filter((el): el is Element => el.instanceOf(Element));
			for (const lineEl of lineElements) {
				const rect = lineEl.getBoundingClientRect();
				if (clientY < rect.top || clientY > rect.bottom) continue;

				const pos = this.posFromLineElement(lineEl);
				if (pos === null) return null;
				const block = this.blockAt(pos);
				return block === null ? null : { block, rect: this.anchorRectForBlock(block, lineEl) };
			}
			return null;
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
			const line = this.view.state.doc.line(lineNumber);
			const dom = this.view.domAtPos(line.from);
			const element = this.asElement(dom.node);
			const lineEl = element?.closest('.cm-line, .cm-html-embed.cm-embed-block, .be-image-widget');
			return lineEl?.getBoundingClientRect() ?? null;
		}

		private coordsRect(pos: number): DOMRect | null {
			const coords = this.view.coordsAtPos(pos);
			if (coords !== null) {
				return new DOMRect(coords.left, coords.top, Math.max(1, coords.right - coords.left), coords.bottom - coords.top);
			}

			const dom = this.view.domAtPos(pos);
			const element = this.asElement(dom.node);
			return element?.closest('.cm-line, .cm-html-embed.cm-embed-block, .be-image-widget')?.getBoundingClientRect() ?? null;
		}

		private asElement(node: Node): Element | null {
			return node.instanceOf(Element) ? node : node.parentElement;
		}

		private contentRect(): DOMRect | null {
			return this.view.dom.querySelector('.cm-content')?.getBoundingClientRect() ?? null;
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
