/**
 * widget.ts
 *
 * Provides image widgets for Live Preview via a StateField (required for
 * block-level Decoration.replace — ViewPlugin cannot provide block decorations).
 *
 * Placeholder widget: dashed border, "Paste or drop an image here".
 *
 * Filled image widget:
 *   - Click → selected state (blue ring, keyboard ops)
 *   - Hover → right-edge resize handle + alignment toolbar (via CSS classes)
 *   - ignoreEvent(mousedown) + capture-phase stopPropagation → no source reveal
 */

import {
	ViewPlugin,
	Decoration,
	DecorationSet,
	EditorView,
	WidgetType,
} from '@codemirror/view';
import { EditorState, Extension, Range, StateEffect, StateField } from '@codemirror/state';
// syntaxTree removed — Obsidian uses a custom HyperMD parser with non-standard
// node names (no 'HTMLBlock'); we scan raw document text for our marker instead.
import { editorLivePreviewField, Menu, MenuItem, normalizePath, setIcon, setTooltip, TFile } from 'obsidian';

import {
	ImageBlock,
	ImageAlignment,
	ImageCrop,
	ImageRowBlock,
	RowJustify,
	SingleImageBlock,
	PlaceholderBlock,
	parseImageBlock,
	parseImageRowBlock,
	singleImageHtml,
	imageRowHtml,
	imageRowReplacementWidth,
	placeholderHtml,
	findBlockEnd,
} from './html-schema';
import { CropModal } from './crop-modal';
import { orderImageDragChanges } from './drag-changes';
import { notePotentialNativeImageDrop, saveImageToVault } from './paste-handler';
import {
	imageSelectionField,
	selectImageBlock,
	deselectImageBlock,
	SelectedImageBlock,
} from './selection';
import { buildImageToolbarIcon, type ImageIconName, renderImagePlaceholderIcon } from '../../icons';
import type BetterEditPlugin from '../../main';

// Dispatching this effect to an EditorView forces the image decoration field
// to recompute immediately — used when the enabled setting changes at runtime.
export const imageFeatureEnabledEffect = StateEffect.define<boolean>();

const ROW_DEFAULTS = { gap: 8, justify: 'flex-start' as const, wrap: 'wrap', alignItems: 'flex-start' };
const IMAGE_DRAG_THRESHOLD_PX = 8;
const IMAGE_DRAG_ROW_Y_TOLERANCE_PX = 12;
const IMAGE_ROW_TOOLBAR_COLLAPSE_MARGIN_PX = 32;
const IMAGE_ROW_TOOLBAR_RIGHT_EDGE_OFFSET_PX = -12;
const IMAGE_ROW_TOOLBAR_TOP_OFFSET_PX = 28;
const IMAGE_ROW_TOOLBAR_LEFT_HOVER_BAND_PX = 64;
const IMAGE_ROW_TOOLBAR_HOVER_PADDING_PX = 10;

interface StandaloneDragSource {
	kind: 'standalone';
	from: number;
	to: number;
	block: SingleImageBlock | PlaceholderBlock;
	sourceEl: HTMLElement;
}

interface RowItemDragSource {
	kind: 'row-item';
	rowFrom: number;
	rowTo: number;
	rowBlock: ImageRowBlock;
	itemIndex: number;
	block: SingleImageBlock | PlaceholderBlock;
	sourceEl: HTMLElement;
}

type DragSource = StandaloneDragSource | RowItemDragSource;

type DropTarget =
	| {
		kind: 'reorder';
		rowFrom: number;
		rowTo: number;
		rowBlock: ImageRowBlock;
		fromIndex: number;
		toIndex: number;
		rowEl: HTMLElement;
	}
	| {
		kind: 'into-row';
		rowFrom: number;
		rowTo: number;
		rowBlock: ImageRowBlock;
		insertIndex: number;
		rowEl: HTMLElement;
	}
	| {
		kind: 'create-row';
		targetFrom: number;
		targetTo: number;
		targetBlock: SingleImageBlock | PlaceholderBlock;
		side: 'before' | 'after';
		targetEl: HTMLElement;
	};

// ---------------------------------------------------------------------------
// Widget — Placeholder
// ---------------------------------------------------------------------------

class PlaceholderWidget extends WidgetType {
	private readonly plugin: BetterEditPlugin;
	private readonly from: number;
	private readonly to: number;
	private readonly selected: boolean;

	constructor(plugin: BetterEditPlugin, from: number, to: number, selected: boolean) {
		super();
		this.plugin = plugin;
		this.from = from;
		this.to = to;
		this.selected = selected;
	}

	toDOM(view: EditorView): HTMLElement {
		const wrapper = createDiv({ cls: 'be-image-widget' });
		wrapper.setAttribute('data-be-from', String(this.from));
		wrapper.setAttribute('data-be-to',   String(this.to));

		const el = createDiv({ cls: 'be-image-placeholder' });
		if (this.selected) el.addClass('is-selected');

		const iconWrapper = createDiv({ cls: 'be-image-placeholder-icon' });
		renderImagePlaceholderIcon(iconWrapper);
		const textEl = createDiv({ cls: 'be-image-placeholder-text', text: 'Add an image' });

		el.appendChild(iconWrapper);
		el.appendChild(textEl);

		const moreBtn = createToolbarButton(this.plugin, 'more', 'More');
		moreBtn.addClass('be-placeholder-more');
		this.plugin.registerDomEvent(moreBtn, 'mousedown', (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); });
		this.plugin.registerDomEvent(moreBtn, 'click', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			this.showPlaceholderMenu(e, view, el);
		});
		el.appendChild(moreBtn);

		this.plugin.registerDomEvent(el, 'mousedown', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
		});

		this.plugin.registerDomEvent(el, 'click', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			this.openReplacePanel(view, el);
		});

		wrapper.appendChild(el);
		return wrapper;
	}

	eq(other: PlaceholderWidget): boolean {
		return this.from === other.from && this.to === other.to && this.selected === other.selected;
	}

	ignoreEvent(): boolean {
		return true;
	}

	private showPlaceholderMenu(e: MouseEvent, view: EditorView, anchorEl: HTMLElement): void {
		const menu = new Menu();

		menu.addItem(item => {
			item.setTitle('Replace');
			item.setIcon('image');
			item.onClick(() => this.openReplacePanel(view, anchorEl));
		});

		menu.addItem(item => {
			item.setTitle('Duplicate');
			item.setIcon('copy');
			item.onClick(() => this.duplicatePlaceholder(view));
		});

		menu.addItem(item => {
			item.setTitle('Delete');
			item.setIcon('trash');
			item.onClick(() => this.deletePlaceholder(view));
		});

		if (this.plugin.settings.image.imageRows) {
			menu.addSeparator();
			menu.addItem(item => {
				item.setTitle('Add to row');
				item.setIcon('layout-grid');
				item.onClick(() => this.convertToRow(view));
			});
		}

		menu.showAtMouseEvent(e);
	}

	private openReplacePanel(view: EditorView, anchorEl: HTMLElement): void {
		openReplacePanel(anchorEl, {
			onFile:   (file) => this.insertFile(view, file),
			onSrc:    (src)  => { this.insertSrc(view, src); },
			onDelete: ()     => { this.deletePlaceholder(view); },
			linkInitialValue: '',
			scrollAnchor: anchorEl,
		});
	}

	private deletePlaceholder(view: EditorView): void {
		let from = this.from;
		let to   = this.to;
		const text = view.state.doc.toString();
		if (to < text.length && text[to] === '\n')   to++;
		else if (from > 0 && text[from - 1] === '\n') from--;
		view.dispatch({ changes: { from, to, insert: '' } });
	}

	private duplicatePlaceholder(view: EditorView): void {
		view.dispatch({ changes: { from: this.to, to: this.to, insert: '\n' + placeholderHtml() } });
	}

	private convertToRow(view: EditorView): void {
		const rowHtml = imageRowHtml(
			[{ kind: 'placeholder' }, { kind: 'placeholder' }],
			ROW_DEFAULTS.gap, ROW_DEFAULTS.justify, ROW_DEFAULTS.wrap, ROW_DEFAULTS.alignItems,
			this.plugin.settings.image.imageCornerRadiusPx,
		);
		view.dispatch({ changes: { from: this.from, to: this.to, insert: rowHtml } });
	}

	private insertSrc(view: EditorView, src: string): void {
		const { defaultImageWidth, defaultImageAlignment, imageCornerRadiusPx } = this.plugin.settings.image;
		const html = singleImageHtml(src, defaultImageWidth, defaultImageAlignment, undefined, undefined, undefined, imageCornerRadiusPx);
		view.dispatch({ changes: { from: this.from, to: this.to, insert: html } });
	}

	private async insertFile(view: EditorView, file: File): Promise<void> {
		const activeFile = this.plugin.app.workspace.getActiveFile();
		if (!activeFile) return;
		const savedPath = await saveImageToVault(this.plugin, file, activeFile);
		if (!savedPath) return;
		this.insertSrc(view, savedPath);
	}
}

// ---------------------------------------------------------------------------
// Widget — Filled image
// ---------------------------------------------------------------------------

class ImageWidget extends WidgetType {
	private readonly block: ImageBlock & { kind: 'single' };
	private readonly rawHtml: string;
	private readonly plugin: BetterEditPlugin;
	private readonly from: number;
	private readonly to: number;
	private readonly selected: boolean;

	constructor(
		block: ImageBlock & { kind: 'single' },
		rawHtml: string,
		plugin: BetterEditPlugin,
		from: number,
		to: number,
		selected: boolean,
	) {
		super();
		this.block = block;
		this.rawHtml = rawHtml;
		this.plugin = plugin;
		this.from = from;
		this.to = to;
		this.selected = selected;
	}

	toDOM(view: EditorView): HTMLElement {
		const wrapper = createDiv({ cls: 'be-image-widget' });
		wrapper.setAttribute('data-be-from', String(this.from));
		wrapper.setAttribute('data-be-to',   String(this.to));
		wrapper.addClass(this.cssClassForAlignment(this.block.alignment));

		const frame = createDiv({ cls: 'be-image-frame' });
		frame.style.width = this.block.width;
		if (this.selected) frame.addClass('is-selected');

		const imgSrc = this.resolveImageSrc(this.block.src);
		const img = createEl('img', { attr: { src: imgSrc, draggable: 'false' } });

		const r = this.plugin.settings.image.imageCornerRadiusPx;

		const media = createDiv({ cls: 'be-image-media' });

		if (this.block.crop) {
			const { crop } = this.block;
			const blockW = parseInt(this.block.width, 10) || 1;
			if (crop.shape === 'circle') frame.addClass('be-circle-crop');

			// Clip is in-flow; padding-top% gives it the crop-window height so it
			// scales with the frame width. The img is position:absolute inside it.
			const clipDiv = createDiv({ cls: 'be-image-crop-clip' });
			clipDiv.style.paddingTop = `${(crop.height / blockW * 100).toFixed(3)}%`;
			if (crop.shape !== 'circle' && r > 0) clipDiv.style.borderRadius = `${r}px`;

			// width% and left% are both relative to containing-block WIDTH.
			// top% is relative to containing-block HEIGHT (= padding-top value),
			// so its base is crop.height — different from left's base of blockW.
			const widthPct = (crop.imgWidth / blockW * 100).toFixed(3);
			const leftPct  = (crop.offsetX  / blockW * 100).toFixed(3);
			const topPct   = (crop.offsetY  / crop.height * 100).toFixed(3);
			img.style.cssText = `position: absolute; width: ${widthPct}%; max-width: none; left: -${leftPct}%; top: -${topPct}%; display: block;`;
			clipDiv.appendChild(img);
			media.appendChild(clipDiv);
		} else {
			const radiusStyle = r > 0 ? ` border-radius: ${r}px;` : '';
			img.style.cssText = `width: 100%; max-width: 100%; display: block;${radiusStyle}`;
			media.appendChild(img);
		}

		frame.appendChild(media);

		if (this.block.caption !== undefined && !this.block.captionHidden) {
			frame.appendChild(this.buildCaption(view));
		}

		if (this.block.alt) {
			const badge = createDiv({ cls: 'be-image-alt-badge', text: 'ALT' });
			this.plugin.registerDomEvent(badge, 'click', (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				this.openAltTextPopover(view, frame);
			});
			media.appendChild(badge);
		}

		media.appendChild(this.buildResizeHandle(view, frame, img));
		frame.appendChild(this.buildToolbar(view, frame));
		wrapper.appendChild(frame);
		return wrapper;
	}

	private buildCaption(view: EditorView): HTMLElement {
		const caption = createEl('figcaption', {
			cls: 'be-image-caption',
			attr: { contenteditable: 'plaintext-only' },
		});
		caption.textContent = this.block.caption ?? '';

		let captionClosed = false;
		const save = () => {
			if (captionClosed) return;
			const text = (caption.textContent ?? '').trim();
			if (text !== (this.block.caption ?? '').trim()) {
				captionClosed = true;
				this.updateBlock(view, { caption: text || undefined });
			}
		};

		this.plugin.registerDomEvent(caption, 'mousedown', (e: MouseEvent) => e.stopPropagation());
		this.plugin.registerDomEvent(caption, 'click',     (e: MouseEvent) => e.stopPropagation());

		this.plugin.registerDomEvent(caption, 'keydown', (e: KeyboardEvent) => {
			e.stopPropagation();
			if (e.key === 'Enter')  { e.preventDefault(); save(); caption.blur(); }
			if (e.key === 'Escape') { captionClosed = true; caption.textContent = this.block.caption ?? ''; caption.blur(); }
		});
		this.plugin.registerDomEvent(caption, 'keyup', (e: KeyboardEvent) => e.stopPropagation());
		this.plugin.registerDomEvent(caption, 'beforeinput', (e: InputEvent) => e.stopPropagation());
		this.plugin.registerDomEvent(caption, 'input', (e: InputEvent) => e.stopPropagation());

		this.plugin.registerDomEvent(caption, 'blur', save);

		return caption;
	}

	// ---------------------------------------------------------------------------
	// Resize handle — Notion-style pill, anchored to right edge of frame
	// ---------------------------------------------------------------------------

	private buildResizeHandle(view: EditorView, frameEl: HTMLElement, imgEl: HTMLImageElement): HTMLElement {
		const handle = createDiv({ cls: 'be-resize-handle' });
		handle.appendChild(createDiv({ cls: 'be-resize-grip' }));

		this.plugin.registerDomEvent(handle, 'mousedown', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();

			const startX = e.clientX;
			// renderedWidth drives the drag delta; storedWidth is the scale base
			// for the saved crop values (block.width may exceed the editor width
			// when max-width:100% clamps the frame — using storedWidth keeps the
			// crop fractions exact across multiple resizes).
			const renderedWidth = frameEl.offsetWidth || parseInt(this.block.width, 10) || 320;
			const storedWidth   = parseInt(this.block.width, 10) || renderedWidth;
			const minWidth = this.computeMinResizeWidth(frameEl, imgEl);
			const startCrop = this.block.crop ? { ...this.block.crop } : undefined;
			frameEl.addClass('is-resizing');

			// For cropped images, aspect-ratio + percentage img sizing means only
			// the frame width needs to change — height and img scale automatically.
			const onMove = (moveEvt: MouseEvent) => {
				const w = Math.max(minWidth, renderedWidth + moveEvt.clientX - startX);
				frameEl.style.width = `${w}px`;
			};

			const onUp = (upEvt: MouseEvent) => {
				activeDocument.removeEventListener('mousemove', onMove);
				activeDocument.removeEventListener('mouseup', onUp);
				frameEl.removeClass('is-resizing');
				const w = Math.max(minWidth, renderedWidth + upEvt.clientX - startX);
				frameEl.style.width = `${w}px`;
				let crop = this.block.crop;
				if (startCrop && storedWidth > 0) {
					const scale = w / storedWidth;
					crop = {
						...startCrop,
						offsetX:  Math.round(startCrop.offsetX  * scale),
						offsetY:  Math.round(startCrop.offsetY  * scale),
						height:   Math.round(startCrop.height   * scale),
						imgWidth: Math.round(startCrop.imgWidth * scale),
					};
					// Circles must stay square; prevent sub-pixel rounding from making an oval
					if (crop.shape === 'circle') crop.height = w;
				}
				this.updateBlock(view, { width: `${w}px`, crop });
			};

			activeDocument.addEventListener('mousemove', onMove);
			activeDocument.addEventListener('mouseup', onUp);
		});

		return handle;
	}

	// ---------------------------------------------------------------------------
	// Alignment toolbar — Notion-style floating bar above image
	// ---------------------------------------------------------------------------

	private buildToolbar(view: EditorView, frameEl: HTMLElement): HTMLElement {
		const bar = createDiv({ cls: 'be-image-toolbar' });

		const addMoreBtn = () => {
			bar.appendChild(createDiv({ cls: 'be-toolbar-sep' }));
			const moreBtn = createToolbarButton(this.plugin, 'more', 'More');
			this.plugin.registerDomEvent(moreBtn, 'click', (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				this.showContextMenu(e, view, frameEl);
			});
			bar.appendChild(moreBtn);
		};

		if (this.isCompactToolbar()) {
			// ── Compact: single "More" button opens native Obsidian menu ────────
			const moreBtn = createToolbarButton(this.plugin, 'more', 'More');
			this.plugin.registerDomEvent(moreBtn, 'click', (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				this.showContextMenu(e, view, frameEl);
			});
			bar.appendChild(moreBtn);
		} else {
			// ── Full toolbar ─────────────────────────────────────────────────────
			const alignments: Array<{ icon: ImageIconName; value: ImageAlignment; title: string }> = [
				{ icon: 'align-left',   value: 'left',   title: 'Align left'   },
				{ icon: 'align-center', value: 'center', title: 'Align center' },
				{ icon: 'align-right',  value: 'right',  title: 'Align right'  },
			];

			for (const { icon, value, title } of alignments) {
				const btn = createToolbarButton(this.plugin, icon, title);
				if (this.block.alignment === value) btn.addClass('is-active');
				this.plugin.registerDomEvent(btn, 'click', (e: MouseEvent) => {
					e.preventDefault();
					e.stopPropagation();
					this.updateBlock(view, { alignment: value });
				});
				bar.appendChild(btn);
			}

			bar.appendChild(createDiv({ cls: 'be-toolbar-sep' }));

			const captionBtn = createToolbarButton(this.plugin, 'caption', 'Caption');
			if (this.block.caption !== undefined && !this.block.captionHidden) captionBtn.addClass('is-active');
			this.plugin.registerDomEvent(captionBtn, 'click', (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				this.toggleCaption(view);
			});
			bar.appendChild(captionBtn);

			const cropBtn = createToolbarButton(this.plugin, 'crop', 'Crop');
			this.plugin.registerDomEvent(cropBtn, 'click', (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				this.openCropModal(view);
			});
			bar.appendChild(cropBtn);

			const replaceBtn = createToolbarButton(this.plugin, 'replace', 'Replace');
			this.plugin.registerDomEvent(replaceBtn, 'click', (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				this.openReplacePanel(view, frameEl);
			});
			bar.appendChild(replaceBtn);

			addMoreBtn();
		}

		return bar;
	}

	private showContextMenu(e: MouseEvent, view: EditorView, frameEl: HTMLElement): void {
		const menu = new Menu();

		// Group 1 — Alignment
		for (const { title, value, icon } of [
			{ title: 'Align left',   value: 'left'   as ImageAlignment, icon: 'align-left' },
			{ title: 'Align center', value: 'center' as ImageAlignment, icon: 'align-center' },
			{ title: 'Align right',  value: 'right'  as ImageAlignment, icon: 'align-right' },
		]) {
			menu.addItem(item => {
				item.setTitle(title);
				item.setIcon(icon);
				if (this.block.alignment === value) item.setChecked(true);
				item.onClick(() => this.updateBlock(view, { alignment: value }));
			});
		}

		menu.addSeparator();

		// Group 2 — Caption, Crop, Replace
		menu.addItem(item => {
			const visible = this.block.caption !== undefined && !this.block.captionHidden;
			item.setTitle('Caption');
			item.setIcon('captions');
			item.setChecked(visible);
			item.onClick(() => this.toggleCaption(view));
		});

		menu.addItem(item => {
			item.setTitle('Crop');
			item.setIcon('crop');
			item.onClick(() => this.openCropModal(view));
		});

		menu.addItem(item => {
			item.setTitle('Replace');
			item.setIcon('image');
			item.onClick(() => this.openReplacePanel(view, frameEl));
		});

		menu.addSeparator();

		// Group 3 — Alt text
		menu.addItem(item => {
			item.setTitle('Alt text');
			item.setIcon('badge-info');
			item.setChecked(!!this.block.alt);
			item.onClick(() => this.openAltTextPopover(view, frameEl));
		});

		menu.addSeparator();

		// Group 4 — Copy, Duplicate, Add to row, Delete
		menu.addItem(item => {
			item.setTitle('Copy');
			item.setIcon('copy');
			item.onClick(() => this.copyBlock());
		});

		menu.addItem(item => {
			item.setTitle('Duplicate');
			item.setIcon('copy-plus');
			item.onClick(() => this.duplicateBlock(view));
		});

		if (this.plugin.settings.image.imageRows) {
			menu.addItem(item => {
				item.setTitle('Add to row');
				item.setIcon('layout-grid');
				item.onClick(() => this.convertToRow(view));
			});
		}

		menu.addItem(item => {
			item.setTitle('Delete');
			item.setIcon('trash');
			item.onClick(() => this.deleteBlock(view));
		});

		menu.showAtMouseEvent(e);
	}

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------

	private resolveImageSrc(src: string): string {
		return resolveImageSrc(this.plugin, src);
	}

	private cssClassForAlignment(alignment: ImageAlignment): string {
		switch (alignment) {
			case 'left':        return 'be-align-left';
			case 'right':       return 'be-align-right';
			case 'float-left':  return 'be-float-left';
			case 'float-right': return 'be-float-right';
			case 'center':
			default:            return 'be-align-center';
		}
	}

	private isCompactToolbar(): boolean {
		const width = this.block.width.trim();
		if (!width.endsWith('px')) return false;
		const px = parseInt(width, 10);
		return !Number.isNaN(px) && px < this.plugin.settings.image.compactToolbarThresholdPx;
	}

	private computeMinResizeWidth(frameEl: HTMLElement, imgEl: HTMLImageElement): number {
		const minWidth = Math.max(1, this.plugin.settings.image.minImageWidthPx);
		const minHeight = Math.max(1, this.plugin.settings.image.minImageHeightPx);

		const naturalWidth = imgEl.naturalWidth;
		const naturalHeight = imgEl.naturalHeight;
		if (naturalWidth > 0 && naturalHeight > 0) {
			const widthFromHeight = Math.ceil(minHeight * naturalWidth / naturalHeight);
			return Math.max(minWidth, widthFromHeight);
		}

		const renderedWidth = imgEl.clientWidth || frameEl.clientWidth;
		const renderedHeight = imgEl.clientHeight;
		if (renderedWidth > 0 && renderedHeight > 0) {
			const widthFromHeight = Math.ceil(minHeight * renderedWidth / renderedHeight);
			return Math.max(minWidth, widthFromHeight);
		}

		return minWidth;
	}

	private captionTogglePatch(): Partial<SingleImageBlock> {
		if (this.block.caption === undefined) {
			return { caption: '', captionHidden: undefined };
		}
		return { captionHidden: this.block.captionHidden ? undefined : true };
	}

	private toggleCaption(view: EditorView): void {
		const enabling = this.block.caption === undefined || this.block.captionHidden;
		this.updateBlock(view, this.captionTogglePatch());
		if (enabling) {
			// Widget re-renders synchronously after dispatch; find the new caption and focus it.
			window.requestAnimationFrame(() => {
				const wrapper = view.dom.querySelector<HTMLElement>(`[data-be-from="${this.from}"]`);
				wrapper?.querySelector<HTMLElement>('.be-image-caption')?.focus();
			});
		}
	}

	private updateBlock(view: EditorView, patch: Partial<SingleImageBlock>): void {
		const next: SingleImageBlock = { ...this.block, ...patch };
		view.dispatch({
			changes: {
				from: this.from,
				to: this.to,
				insert: singleImageHtml(next.src, next.width, next.alignment, next.caption, next.crop, next.alt, this.plugin.settings.image.imageCornerRadiusPx, next.captionHidden),
			},
		});
	}

	private openCropModal(view: EditorView): void {
		const resolvedSrc  = this.resolveImageSrc(this.block.src);
		const docImgWidth  = this.block.crop?.imgWidth ?? (parseInt(this.block.width, 10) || 320);
		const docDisplayWidth = parseInt(this.block.width, 10) || 320;
		new CropModal(
			this.plugin.app,
			resolvedSrc,
			this.block.crop,
			docImgWidth,
			docDisplayWidth,
			(newCrop: ImageCrop, displayWidth: number) => {
				this.updateBlock(view, { width: `${displayWidth}px`, crop: newCrop });
			},
		).open();
	}

	private openReplacePanel(view: EditorView, frameEl: HTMLElement): void {
		openReplacePanel(frameEl, {
			onFile: (file) => this.replaceWithFile(view, file),
			onSrc:  (src)  => { this.updateBlock(view, { src }); },
			linkInitialValue: this.block.src,
			scrollAnchor: null,
		});
	}

	private async replaceWithFile(view: EditorView, file: File): Promise<void> {
		const activeFile = this.plugin.app.workspace.getActiveFile();
		if (!activeFile) return;
		const savedPath = await saveImageToVault(this.plugin, file, activeFile);
		if (!savedPath) return;
		const crop = this.block.crop ? await recalibrateCrop(this.block.crop, file) : undefined;
		this.updateBlock(view, { src: savedPath, crop });
	}

	private openAltTextPopover(view: EditorView, frameEl: HTMLElement): void {
		activeDocument.querySelector('.be-alt-popover')?.remove();

		const popover = createDiv({ cls: 'be-alt-popover' });

		const positionPopover = () => {
			const rect = frameEl.getBoundingClientRect();
			const popW = 280;
			const left = Math.max(8, Math.min(rect.right - popW, window.innerWidth - popW - 16));
			popover.style.top  = `${rect.bottom + 8}px`;
			popover.style.left = `${left}px`;
		};

		const header   = createDiv({ cls: 'be-alt-popover-header' });
		header.createSpan({ text: 'Alt text' });
		const closeBtn = createEl('button', { cls: 'be-alt-popover-close', text: '×' });
		header.appendChild(closeBtn);

		const desc = createDiv({ cls: 'be-alt-popover-desc',
			text: 'Describe this image for people who cannot see it.' });

		const input = createEl('input', { cls: 'be-alt-popover-input', attr: {
			type: 'text',
			value: this.block.alt ?? '',
			placeholder: 'Add alt text…',
		} });

		popover.append(header, desc, input);

		let altClosed = false;
		const scroller = frameEl.closest('.cm-scroller');

		const closePopover = (save: boolean) => {
			if (altClosed) return;
			altClosed = true;
			activeDocument.removeEventListener('mousedown', closeOnOutside, true);
			scroller?.removeEventListener('scroll', positionPopover);
			if (save) {
				const alt = input.value.trim() || undefined;
				this.updateBlock(view, { alt });
			}
			popover.remove();
		};

		input.addEventListener('blur',    () => closePopover(true));
		input.addEventListener('keydown', ev => {
			if (ev.key === 'Enter')  closePopover(true);
			if (ev.key === 'Escape') closePopover(false);
		});
		closeBtn.addEventListener('click', () => closePopover(true));

		const closeOnOutside = (ev: MouseEvent) => {
			if (!popover.contains(ev.target as Node)) closePopover(true);
		};
		window.setTimeout(() => activeDocument.addEventListener('mousedown', closeOnOutside, true), 50);

		scroller?.addEventListener('scroll', positionPopover, { passive: true });

		activeDocument.body.appendChild(popover);
		positionPopover();
		window.requestAnimationFrame(() => input.focus());
	}

	private copyBlock(): void {
		navigator.clipboard.writeText(this.rawHtml).catch(err =>
			console.error('[better-edit] Copy failed:', err));
	}

	private duplicateBlock(view: EditorView): void {
		const insert = '\n' + this.rawHtml;
		view.dispatch({
			changes: { from: this.to, to: this.to, insert },
			selection: { anchor: this.to + insert.length },
		});
	}

	private deleteBlock(view: EditorView): void {
		const text = view.state.doc.toString();
		let from = this.from;
		let to   = this.to;
		// Absorb one surrounding newline to avoid leaving a blank line
		if (to < text.length && text[to] === '\n')         to++;
		else if (from > 0 && text[from - 1] === '\n') from--;
		view.dispatch({ changes: { from, to, insert: '' } });
	}

	private convertToRow(view: EditorView): void {
		const rowHtml = imageRowHtml(
			[{ ...this.block }, { kind: 'placeholder' }],
			ROW_DEFAULTS.gap, ROW_DEFAULTS.justify, ROW_DEFAULTS.wrap, ROW_DEFAULTS.alignItems,
			this.plugin.settings.image.imageCornerRadiusPx,
		);
		view.dispatch({ changes: { from: this.from, to: this.to, insert: rowHtml } });
	}

	eq(other: ImageWidget): boolean {
		return (
			this.rawHtml === other.rawHtml &&
			this.from === other.from &&
			this.to === other.to &&
			this.selected === other.selected
		);
	}

	ignoreEvent(event: Event): boolean {
		// Prevent CM6 from processing mousedown (no cursor positioning)
		return event.type === 'mousedown';
	}
}

// ---------------------------------------------------------------------------
// Crop recalibration — keep horizontal crop exactly, clamp vertical to new ratio
// ---------------------------------------------------------------------------

function recalibrateCrop(crop: ImageCrop, imageSource: File | string): Promise<ImageCrop> {
	const url = imageSource instanceof File ? URL.createObjectURL(imageSource) : imageSource;
	return new Promise<ImageCrop>((resolve) => {
		const img = new Image();
		const cleanup = () => { if (imageSource instanceof File) URL.revokeObjectURL(url); };
		img.onload = () => {
			cleanup();
			if (!img.naturalWidth || !img.naturalHeight) { resolve(crop); return; }
			// How tall the full image renders at the stored imgWidth
			const renderedH = crop.imgWidth * img.naturalHeight / img.naturalWidth;
			const height  = Math.min(crop.height, renderedH);
			const offsetY = Math.max(0, Math.min(crop.offsetY, renderedH - height));
			resolve({ ...crop, height: Math.round(height), offsetY: Math.round(offsetY) });
		};
		img.onerror = () => { cleanup(); resolve(crop); };
		img.src = url;
	});
}

// ---------------------------------------------------------------------------
// Shared replace panel
// ---------------------------------------------------------------------------

interface ReplacePanelOptions {
	onFile: (file: File) => Promise<void>;
	onSrc:  (src: string) => void;
	onDelete?: () => void;
	linkInitialValue: string;
	scrollAnchor: HTMLElement | null;
}

function openReplacePanel(anchorEl: HTMLElement, opts: ReplacePanelOptions): void {
	activeDocument.querySelector('.be-replace-panel')?.remove();

	const panel = createDiv({ cls: 'be-replace-panel' });

	const positionPanel = () => {
		const rect  = anchorEl.getBoundingClientRect();
		const panelW = 360;
		panel.style.top  = `${rect.bottom + 8}px`;
		panel.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - panelW - 16))}px`;
	};

	const tabBar    = createDiv({ cls: 'be-replace-tabs' });
	const uploadTab = createEl('button', { cls: 'be-replace-tab is-active', text: 'Upload' });
	const linkTab   = createEl('button', { cls: 'be-replace-tab', text: 'Link' });
	tabBar.append(uploadTab, linkTab);

	const uploadPane = createDiv({ cls: 'be-replace-pane' });
	uploadPane.createDiv({ cls: 'be-replace-upload-desc', text: 'Drag an image here, or click below to browse.' });
	const uploadArea = createDiv({ cls: 'be-replace-upload-area' });
	const uploadBtn  = createDiv({ cls: 'be-replace-upload-btn', text: 'Upload file' });
	const fileInput  = createEl('input', { attr: { type: 'file', accept: 'image/*', style: 'display:none' } });
	uploadArea.append(uploadBtn, fileInput);
	uploadPane.appendChild(uploadArea);

	const linkPane  = createDiv({ cls: 'be-replace-pane be-replace-link-pane is-hidden' });
	const linkInput = createEl('input', { cls: 'be-replace-link-input', attr: {
		type: 'text', value: opts.linkInitialValue, placeholder: 'Paste image URL or vault path…',
	} });
	const linkArea = createDiv({ cls: 'be-replace-upload-area' });
	const linkBtn = createEl('button', { cls: 'be-replace-upload-btn', text: 'Add link', attr: { type: 'button' } });
	linkArea.appendChild(linkBtn);
	linkPane.append(linkInput, linkArea);

	panel.append(tabBar, uploadPane, linkPane);

	uploadTab.addEventListener('click', () => {
		uploadTab.addClass('is-active'); linkTab.removeClass('is-active');
		uploadPane.removeClass('is-hidden'); linkPane.addClass('is-hidden');
	});
	linkTab.addEventListener('click', () => {
		linkTab.addClass('is-active'); uploadTab.removeClass('is-active');
		linkPane.removeClass('is-hidden'); uploadPane.addClass('is-hidden');
		window.requestAnimationFrame(() => { linkInput.focus(); if (opts.linkInitialValue) linkInput.select(); });
	});

	const cleanups: Array<() => void> = [];
	let panelClosed = false;
	const closePanel = () => {
		if (panelClosed) return;
		panelClosed = true;
		activeDocument.removeEventListener('mousedown', closeOnOutside, true);
		opts.scrollAnchor?.closest('.cm-scroller')?.removeEventListener('scroll', positionPanel);
		for (const fn of cleanups) fn();
		panel.remove();
	};
	const commitLinkInput = (): void => {
		if (panelClosed) return;
		const src = linkInput.value.trim();
		if (!src) return;
		opts.onSrc(src);
		closePanel();
	};

	const pickFile = (file: File) => void opts.onFile(file).then(() => closePanel());

	uploadBtn.addEventListener('click', () => fileInput.click());
	fileInput.addEventListener('change', () => {
		const file = fileInput.files?.[0];
		if (file) pickFile(file);
	});

	let dragCount = 0;
	panel.addEventListener('dragenter', ev => { ev.preventDefault(); dragCount++; panel.addClass('is-over'); });
	panel.addEventListener('dragleave', () => { if (--dragCount <= 0) { dragCount = 0; panel.removeClass('is-over'); } });
	panel.addEventListener('dragover',  ev => ev.preventDefault());
	panel.addEventListener('drop', ev => {
		ev.preventDefault();
		dragCount = 0;
		panel.removeClass('is-over');
		const file = Array.from(ev.dataTransfer?.files ?? []).find(f => f.type.startsWith('image/'));
		if (file) pickFile(file);
	});

	linkInput.addEventListener('keydown', ev => {
		if (ev.key !== 'Enter') return;
		ev.preventDefault();
		ev.stopPropagation();
		commitLinkInput();
	});
	linkBtn.addEventListener('click', commitLinkInput);

	const closeOnOutside = (ev: MouseEvent) => {
		if (!panel.contains(ev.target as Node)) closePanel();
	};
	window.setTimeout(() => activeDocument.addEventListener('mousedown', closeOnOutside, true), 50);

	if (opts.onDelete) {
		const onKeyDown = (ev: KeyboardEvent) => {
			if (ev.key !== 'Delete' && ev.key !== 'Backspace') return;
			if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
			ev.preventDefault();
			closePanel();
			opts.onDelete!();
		};
		activeDocument.addEventListener('keydown', onKeyDown, true);
		cleanups.push(() => activeDocument.removeEventListener('keydown', onKeyDown, true));
	}

	if (opts.scrollAnchor) {
		opts.scrollAnchor.closest('.cm-scroller')?.addEventListener('scroll', positionPanel, { passive: true });
	}

	activeDocument.body.appendChild(panel);
	positionPanel();
}

function createToolbarButton(_plugin: BetterEditPlugin, icon: ImageIconName, title: string): HTMLButtonElement {
	const btn = createEl('button', { cls: 'be-toolbar-btn', attr: { type: 'button' } });
	btn.appendChild(buildImageToolbarIcon(activeDocument, icon));
	setTooltip(btn, title);
	return btn;
}

function resolveImageSrc(plugin: BetterEditPlugin, src: string): string {
	const rawSrc = src.trim();
	if (/^(https?:|app:|file:|data:|blob:)/.test(rawSrc)) return rawSrc;
	const sourceFile = plugin.app.workspace.getActiveFile();
	const sourcePath = sourceFile?.path ?? '';
	const decodedSrc = decodeImageSrc(rawSrc);
	const normalizedSrc = normalizePath(decodedSrc.replace(/^\/+/, ''));
	const directFile = plugin.app.vault.getFileByPath(normalizedSrc);
	if (directFile instanceof TFile) return plugin.app.vault.getResourcePath(directFile);
	const linkedFile = plugin.app.metadataCache.getFirstLinkpathDest(decodedSrc, sourcePath);
	if (linkedFile instanceof TFile) return plugin.app.vault.getResourcePath(linkedFile);
	return src;
}

function decodeImageSrc(src: string): string {
	try {
		return decodeURIComponent(src);
	} catch {
		return src;
	}
}

function closeActiveImagePanels(): void {
	activeDocument.querySelector('.be-replace-panel')?.remove();
	activeDocument.querySelector('.be-alt-popover')?.remove();
}

function parseStandaloneBlockAtRange(state: EditorState, from: number, to: number): SingleImageBlock | PlaceholderBlock | null {
	const block = parseImageBlock(state.doc.sliceString(from, to));
	if (!block || block.kind === 'row') return null;
	return block;
}

function parseRowBlockAtRange(state: EditorState, from: number, to: number): ImageRowBlock | null {
	return parseImageRowBlock(state.doc.sliceString(from, to));
}

function standaloneHtmlForBlock(
	block: SingleImageBlock | PlaceholderBlock,
	plugin: BetterEditPlugin,
): string {
	if (block.kind === 'placeholder') return placeholderHtml();
	const { defaultImageAlignment, imageCornerRadiusPx } = plugin.settings.image;
	return singleImageHtml(
		block.src,
		block.width,
		defaultImageAlignment,
		block.caption,
		block.crop,
		block.alt,
		imageCornerRadiusPx,
		block.captionHidden,
	);
}

function rowHtmlForBlock(block: ImageRowBlock, plugin: BetterEditPlugin): string {
	return imageRowHtml(
		block.images,
		block.gap,
		block.justify,
		block.wrap,
		block.alignItems,
		plugin.settings.image.imageCornerRadiusPx,
	);
}

function serializeRemainingRowItems(
	images: (SingleImageBlock | PlaceholderBlock)[],
	rowBlock: ImageRowBlock,
	plugin: BetterEditPlugin,
	preserveRow = false,
): string {
	if (images.length === 0) return '';
	if (images.length === 1 && !preserveRow) return standaloneHtmlForBlock(images[0]!, plugin);
	return rowHtmlForBlock({ ...rowBlock, images }, plugin);
}

function clampInsertIndex(insertIndex: number, length: number): number {
	return Math.max(0, Math.min(length, insertIndex));
}

function reorderRowImages(images: (SingleImageBlock | PlaceholderBlock)[], fromIndex: number, insertIndex: number): (SingleImageBlock | PlaceholderBlock)[] {
	const next = [...images];
	const [moved] = next.splice(fromIndex, 1);
	if (!moved) return images;
	const normalizedIndex = insertIndex > fromIndex ? insertIndex - 1 : insertIndex;
	next.splice(clampInsertIndex(normalizedIndex, next.length), 0, moved);
	return next;
}

function removeStandaloneBlockRange(state: EditorState, from: number, to: number): { from: number; to: number } {
	const text = state.doc.toString();
	let nextFrom = from;
	let nextTo = to;
	if (nextTo < text.length && text[nextTo] === '\n') nextTo += 1;
	else if (nextFrom > 0 && text[nextFrom - 1] === '\n') nextFrom -= 1;
	return { from: nextFrom, to: nextTo };
}

function removeRowBlockRange(state: EditorState, from: number, to: number): { from: number; to: number } {
	const text = state.doc.toString();
	let nextFrom = from;
	let nextTo = to;
	if (nextTo < text.length && text[nextTo] === '\n') nextTo += 1;
	else if (nextFrom > 0 && text[nextFrom - 1] === '\n') nextFrom -= 1;
	return { from: nextFrom, to: nextTo };
}

function buildStandaloneRowItems(source: SingleImageBlock | PlaceholderBlock, target: SingleImageBlock | PlaceholderBlock, side: 'before' | 'after'): (SingleImageBlock | PlaceholderBlock)[] {
	return side === 'before' ? [source, target] : [target, source];
}

function suppressNextClick(doc: Document): void {
	const swallow = (event: MouseEvent) => {
		event.preventDefault();
		event.stopPropagation();
		doc.removeEventListener('click', swallow, true);
	};
	doc.addEventListener('click', swallow, true);
}

function resolveStandaloneFrame(widgetEl: HTMLElement): HTMLElement {
	return widgetEl.querySelector<HTMLElement>('.be-image-frame, .be-image-placeholder') ?? widgetEl;
}

function computeRowInsertIndex(rowEl: HTMLElement, clientX: number): number {
	const items = Array.from(rowEl.querySelectorAll<HTMLElement>(':scope > .be-image-row-item'));
	for (let i = 0; i < items.length; i++) {
		const rect = items[i]!.getBoundingClientRect();
		if (clientX < rect.left + rect.width / 2) return i;
	}
	return items.length;
}

function computeRowIndicatorLeft(rowEl: HTMLElement, insertIndex: number): number {
	const items = Array.from(rowEl.querySelectorAll<HTMLElement>(':scope > .be-image-row-item'));
	if (items.length === 0) return rowEl.getBoundingClientRect().left;
	if (insertIndex <= 0) return items[0]!.getBoundingClientRect().left;
	if (insertIndex >= items.length) return items[items.length - 1]!.getBoundingClientRect().right;
	return items[insertIndex]!.getBoundingClientRect().left;
}

function isImageDragExcludedTarget(target: Element): boolean {
	return !!target.closest('.be-resize-handle, .be-toolbar-btn, .be-image-caption, .be-image-alt-badge, .be-replace-panel, .be-alt-popover, .be-row-toolbar-more, .be-image-row-toolbar');
}

interface MenuItemWithSubmenu extends MenuItem {
	setSubmenu(): Menu;
}

function createSubmenu(item: MenuItem): Menu {
	return (item as MenuItemWithSubmenu).setSubmenu();
}

interface ResolvedRowState {
	rowWidget: HTMLElement;
	rowEl: HTMLElement;
	from: number;
	to: number;
	block: ImageRowBlock;
	rawHtml: string;
}

function resolveRowStateFromWidget(view: EditorView, rowWidget: HTMLElement): ResolvedRowState | null {
	const from = parseInt(rowWidget.dataset.beFrom ?? '', 10);
	const to = parseInt(rowWidget.dataset.beTo ?? '', 10);
	if (Number.isNaN(from) || Number.isNaN(to)) return null;
	const rowEl = rowWidget.querySelector<HTMLElement>('.be-image-row');
	if (rowEl === null) return null;
	const rawHtml = view.state.doc.sliceString(from, to);
	const block = parseImageRowBlock(rawHtml);
	if (block === null) return null;
	return { rowWidget, rowEl, from, to, block, rawHtml };
}

function resolveRowStateByFrom(view: EditorView, rowFrom: number): ResolvedRowState | null {
	const rowWidget = view.dom.querySelector<HTMLElement>(`.be-image-row-widget[data-be-from="${rowFrom}"]`);
	return rowWidget === null ? null : resolveRowStateFromWidget(view, rowWidget);
}

function dispatchRowBlockUpdate(view: EditorView, plugin: BetterEditPlugin, row: ResolvedRowState, nextBlock: ImageRowBlock): void {
	view.dispatch({
		changes: {
			from: row.from,
			to: row.to,
			insert: imageRowHtml(
				nextBlock.images,
				nextBlock.gap,
				nextBlock.justify,
				nextBlock.wrap,
				nextBlock.alignItems,
				plugin.settings.image.imageCornerRadiusPx,
			),
		},
	});
}

function duplicateRowState(view: EditorView, row: ResolvedRowState): void {
	const doc = view.state.doc;
	const insertAt = row.to < doc.length && doc.sliceString(row.to, row.to + 1) === '\n'
		? row.to + 1
		: row.to;
	view.dispatch({ changes: { from: insertAt, to: insertAt, insert: row.rawHtml + '\n' } });
}

function deleteRowState(view: EditorView, row: ResolvedRowState): void {
	view.dispatch({ changes: { from: row.from, to: row.to, insert: '' } });
}

class ImageRowToolbarController {
	private activeRow: ResolvedRowState | null = null;
	private readonly toolbarEl: HTMLElement;
	private readonly addBtn: HTMLButtonElement;
	private readonly justifyButtons = new Map<RowJustify, HTMLButtonElement>();
	private readonly moreBtn: HTMLButtonElement;

	constructor(private readonly view: EditorView, private readonly plugin: BetterEditPlugin) {
		const doc = view.dom.ownerDocument;
		this.toolbarEl = createDiv({ cls: 'be-image-row-toolbar' });
		this.toolbarEl.setCssProps({ position: 'fixed' });
		this.addBtn = createEl('button', { cls: 'be-toolbar-btn', attr: { type: 'button' } });
		setIcon(this.addBtn, 'image');
		setTooltip(this.addBtn, 'Add image');
		this.toolbarEl.appendChild(this.addBtn);
		this.toolbarEl.appendChild(createDiv({ cls: 'be-toolbar-sep' }));

		for (const { value, icon, title } of [
			{ value: 'flex-start' as RowJustify, icon: 'row-justify-left' as ImageIconName, title: 'Justify: start' },
			{ value: 'center' as RowJustify, icon: 'row-justify-center' as ImageIconName, title: 'Justify: center' },
			{ value: 'space-between' as RowJustify, icon: 'row-justify-space-between' as ImageIconName, title: 'Justify: space between' },
		]) {
			const btn = createToolbarButton(plugin, icon, title);
			this.justifyButtons.set(value, btn);
			this.toolbarEl.appendChild(btn);
		}

		this.toolbarEl.appendChild(createDiv({ cls: 'be-toolbar-sep' }));
		this.moreBtn = createToolbarButton(plugin, 'more', 'More');
		this.moreBtn.addClass('be-row-toolbar-more');
		this.toolbarEl.appendChild(this.moreBtn);
		doc.body.appendChild(this.toolbarEl);

		plugin.registerDomEvent(this.toolbarEl, 'mousedown', (event: MouseEvent) => {
			event.preventDefault();
			event.stopPropagation();
		});
		plugin.registerDomEvent(this.addBtn, 'click', (event: MouseEvent) => {
			event.preventDefault();
			event.stopPropagation();
			const row = this.resolveActiveRow();
			if (row === null) return;
			dispatchRowBlockUpdate(view, plugin, row, { ...row.block, images: [...row.block.images, { kind: 'placeholder' }] });
			this.refreshActiveRow();
		});
		for (const [value, btn] of this.justifyButtons) {
			plugin.registerDomEvent(btn, 'click', (event: MouseEvent) => {
				event.preventDefault();
				event.stopPropagation();
				const row = this.resolveActiveRow();
				if (row === null) return;
				dispatchRowBlockUpdate(view, plugin, row, { ...row.block, justify: value });
				this.refreshActiveRow();
			});
		}
		plugin.registerDomEvent(this.moreBtn, 'click', (event: MouseEvent) => {
			event.preventDefault();
			event.stopPropagation();
			this.showMoreMenu(event);
		});

		plugin.registerDomEvent(doc, 'pointermove', (event: PointerEvent) => this.onPointerMove(event), { capture: true });
		plugin.registerDomEvent(view.scrollDOM, 'scroll', () => this.positionActiveToolbar(), { passive: true });
	}

	update(): void {
		this.refreshActiveRow();
	}

	destroy(): void {
		this.toolbarEl.remove();
	}

	private onPointerMove(event: PointerEvent): void {
		if (!this.plugin.settings.image.enabled || !this.plugin.settings.image.imageRows) {
			this.hide();
			return;
		}
		if (this.view.dom.ownerDocument.body.hasClass('be-image-dragging')) {
			this.hide();
			return;
		}

		const target = event.target;
		if (!(target instanceof Element)) {
			this.hide();
			return;
		}

		if (this.isWithinActiveToolbarZone(event.clientX, event.clientY, target)) {
			this.positionActiveToolbar();
			return;
		}

		const hoveredRow = this.findHoveredRow(event.clientX, event.clientY);
		if (hoveredRow === null) {
			this.hide();
			return;
		}
		this.activeRow = hoveredRow;
		this.positionActiveToolbar();
	}

	private findHoveredRow(clientX: number, clientY: number): ResolvedRowState | null {
		const rowWidgets = Array.from(this.view.dom.querySelectorAll<HTMLElement>('.be-image-row-widget[data-be-from]'));
		for (const rowWidget of rowWidgets) {
			const row = resolveRowStateFromWidget(this.view, rowWidget);
			if (row === null) continue;
			const rowRect = row.rowEl.getBoundingClientRect();
			const left = rowRect.left - IMAGE_ROW_TOOLBAR_LEFT_HOVER_BAND_PX;
			const right = rowRect.right + IMAGE_ROW_TOOLBAR_HOVER_PADDING_PX;
			const top = rowRect.top - IMAGE_ROW_TOOLBAR_HOVER_PADDING_PX;
			const bottom = rowRect.bottom + IMAGE_ROW_TOOLBAR_HOVER_PADDING_PX;
			if (clientX < left || clientX > right || clientY < top || clientY > bottom) continue;
			return row;
		}
		return null;
	}

	private isWithinActiveToolbarZone(clientX: number, clientY: number, target: Element): boolean {
		if (this.activeRow === null) return false;
		if (this.activeRow.rowWidget.contains(target) || this.toolbarEl.contains(target)) return true;

		const rowRect = this.activeRow.rowEl.getBoundingClientRect();
		const toolbarRect = this.toolbarEl.getBoundingClientRect();
		const left = Math.min(rowRect.left - IMAGE_ROW_TOOLBAR_LEFT_HOVER_BAND_PX, toolbarRect.left) - IMAGE_ROW_TOOLBAR_HOVER_PADDING_PX;
		const right = Math.max(rowRect.right, toolbarRect.right) + IMAGE_ROW_TOOLBAR_HOVER_PADDING_PX;
		const top = Math.min(rowRect.top, toolbarRect.top) - IMAGE_ROW_TOOLBAR_HOVER_PADDING_PX;
		const bottom = Math.max(rowRect.bottom, toolbarRect.bottom) + IMAGE_ROW_TOOLBAR_HOVER_PADDING_PX;
		return clientX >= left && clientX <= right && clientY >= top && clientY <= bottom;
	}

	private positionActiveToolbar(): void {
		if (this.activeRow === null) return;
		this.syncButtonState(this.activeRow.block);
		this.toolbarEl.removeClass('is-collapsed');
		const toolbarHeight = this.toolbarEl.scrollHeight;
		const rowRect = this.activeRow.rowEl.getBoundingClientRect();
		this.toolbarEl.toggleClass('is-collapsed', rowRect.height < toolbarHeight + IMAGE_ROW_TOOLBAR_COLLAPSE_MARGIN_PX);
		const toolbarWidth = this.toolbarEl.getBoundingClientRect().width;
		const contentRect = this.view.contentDOM.closest('.cm-contentContainer')?.getBoundingClientRect() ?? this.view.dom.getBoundingClientRect();
		const left = contentRect.left + IMAGE_ROW_TOOLBAR_RIGHT_EDGE_OFFSET_PX - toolbarWidth;
		this.toolbarEl.setCssProps({
			position: 'fixed',
			top: `${rowRect.top + IMAGE_ROW_TOOLBAR_TOP_OFFSET_PX}px`,
			left: `${left}px`,
			right: '',
		});
		this.toolbarEl.addClass('is-visible');
	}

	private syncButtonState(block: ImageRowBlock): void {
		for (const [value, button] of this.justifyButtons) {
			button.toggleClass('is-active', block.justify === value);
		}
	}

	private resolveActiveRow(): ResolvedRowState | null {
		const row = this.activeRow;
		if (row === null) return null;
		return resolveRowStateByFrom(this.view, row.from);
	}

	private refreshActiveRow(): void {
		if (this.activeRow === null) return;
		const refreshed = resolveRowStateByFrom(this.view, this.activeRow.from);
		if (refreshed === null) {
			this.hide();
			return;
		}
		this.activeRow = refreshed;
		if (this.toolbarEl.hasClass('is-visible')) this.positionActiveToolbar();
	}

	private hide(): void {
		this.toolbarEl.removeClass('is-visible');
		this.toolbarEl.removeClass('is-collapsed');
		this.activeRow = null;
	}

	private showMoreMenu(event: MouseEvent): void {
		const row = this.resolveActiveRow();
		if (row === null) return;
		const resolveMenuRow = (): ResolvedRowState | null => resolveRowStateByFrom(this.view, row.from) ?? row;
		const menu = new Menu();

		menu.addItem(item => {
			item.setTitle('Justify content');
			item.setSection('layout');
			item.setIcon('align-justify');
			const sub = createSubmenu(item);
			for (const [title, value] of [
				['Flex start', 'flex-start'],
				['Flex end', 'flex-end'],
				['Center', 'center'],
				['Space between', 'space-between'],
				['Space around', 'space-around'],
				['Space evenly', 'space-evenly'],
			] as const) {
				sub.addItem((si: MenuItem) => {
					si.setTitle(title);
					si.setChecked(row.block.justify === value);
					si.onClick(() => {
						const current = resolveMenuRow();
						if (current === null) return;
						dispatchRowBlockUpdate(this.view, this.plugin, current, { ...current.block, justify: value });
						this.refreshActiveRow();
					});
				});
			}
		});

		menu.addItem(item => {
			item.setTitle('Align items');
			item.setSection('layout');
			item.setIcon('align-vertical-distribute-center');
			const sub = createSubmenu(item);
			for (const [title, value] of [
				['Start', 'flex-start'],
				['Center', 'center'],
				['End', 'flex-end'],
				['Stretch', 'stretch'],
				['Baseline', 'baseline'],
			] as const) {
				sub.addItem((si: MenuItem) => {
					si.setTitle(title);
					si.setChecked(row.block.alignItems === value);
					si.onClick(() => {
						const current = resolveMenuRow();
						if (current === null) return;
						dispatchRowBlockUpdate(this.view, this.plugin, current, { ...current.block, alignItems: value });
						this.refreshActiveRow();
					});
				});
			}
		});

		menu.addItem(item => {
			item.setTitle('Wrap');
			item.setSection('layout');
			item.setIcon('wrap-text');
			const sub = createSubmenu(item);
			for (const [title, value] of [
				['No wrap', 'nowrap'],
				['Wrap', 'wrap'],
				['Wrap reverse', 'wrap-reverse'],
			] as const) {
				sub.addItem((si: MenuItem) => {
					si.setTitle(title);
					si.setChecked(row.block.wrap === value);
					si.onClick(() => {
						const current = resolveMenuRow();
						if (current === null) return;
						dispatchRowBlockUpdate(this.view, this.plugin, current, { ...current.block, wrap: value });
						this.refreshActiveRow();
					});
				});
			}
		});

		menu.addItem(item => {
			item.setTitle('Gap');
			item.setSection('layout');
			item.setIcon('ruler');
			const sub = createSubmenu(item);
			for (const px of [0, 8, 16, 24, 32, 40, 48, 56, 64]) {
				sub.addItem((si: MenuItem) => {
					si.setTitle(`${px}px`);
					si.setChecked(row.block.gap === px);
					si.onClick(() => {
						const current = resolveMenuRow();
						if (current === null) return;
						dispatchRowBlockUpdate(this.view, this.plugin, current, { ...current.block, gap: px });
						this.refreshActiveRow();
					});
				});
			}
		});

		menu.addItem(item => {
			item.setTitle('Reset to defaults');
			item.setSection('layout');
			item.setIcon('rotate-ccw');
			item.onClick(() => {
				const current = resolveMenuRow();
				if (current === null) return;
				dispatchRowBlockUpdate(this.view, this.plugin, current, { ...current.block, ...ROW_DEFAULTS });
				this.refreshActiveRow();
			});
		});

		menu.addItem(item => {
			item.setTitle('Add image');
			item.setSection('actions');
			item.setIcon('image');
			item.onClick(() => {
				const current = resolveMenuRow();
				if (current === null) return;
				dispatchRowBlockUpdate(this.view, this.plugin, current, { ...current.block, images: [...current.block.images, { kind: 'placeholder' }] });
				this.refreshActiveRow();
			});
		});
		menu.addItem(item => {
			item.setTitle('Copy HTML');
			item.setSection('actions');
			item.setIcon('copy');
			item.onClick(() => navigator.clipboard.writeText(row.rawHtml));
		});
		menu.addItem(item => {
			item.setTitle('Duplicate row');
			item.setSection('actions');
			item.setIcon('copy-plus');
			item.onClick(() => {
				const current = resolveMenuRow();
				if (current === null) return;
				duplicateRowState(this.view, current);
			});
		});
		menu.addItem(item => {
			item.setTitle('Delete row');
			item.setSection('actions');
			item.setIcon('trash');
			item.onClick(() => {
				const current = resolveMenuRow();
				if (current === null) return;
				deleteRowState(this.view, current);
				this.hide();
			});
		});

		menu.showAtMouseEvent(event);
	}
}

class ImageDragManager {
	private source: DragSource | null = null;
	private dragStarted = false;
	private startX = 0;
	private startY = 0;
	private lastClientX = 0;
	private lastClientY = 0;
	private ghostEl: HTMLElement | null = null;
	private rowIndicatorEl: HTMLElement | null = null;
	private createRowIndicatorEl: HTMLElement | null = null;
	private popOutIndicatorEl: HTMLElement | null = null;
	private currentTarget: DropTarget | null = null;
	private readonly doc: Document;
	private readonly scrollerEl: HTMLElement | null;
	private readonly onMouseMoveBound = (event: MouseEvent) => this.onMouseMove(event);
	private readonly onMouseUpBound = (event: MouseEvent) => this.onMouseUp(event);
	private readonly onKeyDownBound = (event: KeyboardEvent) => this.onKeyDown(event);
	private readonly onScrollBound = () => this.onScroll();

	constructor(private readonly view: EditorView, private readonly plugin: BetterEditPlugin) {
		this.doc = view.dom.ownerDocument;
		this.scrollerEl = view.scrollDOM.closest('.cm-scroller');
	}

	tryStartDrag(event: MouseEvent): DragSource | null {
		const target = event.target;
		if (!(target instanceof Element)) return null;
		if (isImageDragExcludedTarget(target)) return null;

		const source = this.resolveDragSource(target);
		if (!source) return null;

		this.cancel();
		this.source = source;
		this.startX = event.clientX;
		this.startY = event.clientY;
		this.lastClientX = event.clientX;
		this.lastClientY = event.clientY;
		this.doc.addEventListener('mousemove', this.onMouseMoveBound, true);
		this.doc.addEventListener('mouseup', this.onMouseUpBound, true);
		this.doc.addEventListener('keydown', this.onKeyDownBound, true);
		this.scrollerEl?.addEventListener('scroll', this.onScrollBound, { passive: true });
		event.preventDefault();
		return source;
	}

	destroy(): void {
		this.cancel();
	}

	private resolveDragSource(target: Element): DragSource | null {
		const rowItemEl = target.closest<HTMLElement>('.be-image-row-item');
		const rowWidgetEl = rowItemEl?.closest<HTMLElement>('.be-image-row-widget[data-be-from][data-be-to]');
		if (rowItemEl && rowWidgetEl) {
			const rowFrom = parseInt(rowWidgetEl.dataset.beFrom ?? '', 10);
			const rowTo = parseInt(rowWidgetEl.dataset.beTo ?? '', 10);
			if (Number.isNaN(rowFrom) || Number.isNaN(rowTo)) return null;
			const rowBlock = parseRowBlockAtRange(this.view.state, rowFrom, rowTo);
			if (!rowBlock) return null;
			const rowEl = rowWidgetEl.querySelector<HTMLElement>('.be-image-row');
			if (!rowEl) return null;
			const itemIndex = Array.from(rowEl.children).indexOf(rowItemEl);
			const block = rowBlock.images[itemIndex];
			if (itemIndex === -1 || !block) return null;
			return { kind: 'row-item', rowFrom, rowTo, rowBlock, itemIndex, block, sourceEl: rowItemEl };
		}

		const widgetEl = target.closest<HTMLElement>('.be-image-widget[data-be-from][data-be-to]');
		if (!widgetEl || widgetEl.dataset.beRow !== undefined) return null;
		const from = parseInt(widgetEl.dataset.beFrom ?? '', 10);
		const to = parseInt(widgetEl.dataset.beTo ?? '', 10);
		if (Number.isNaN(from) || Number.isNaN(to)) return null;
		const block = parseStandaloneBlockAtRange(this.view.state, from, to);
		if (!block) return null;
		return { kind: 'standalone', from, to, block, sourceEl: widgetEl };
	}

	private onMouseMove(event: MouseEvent): void {
		if (!this.source) return;
		this.lastClientX = event.clientX;
		this.lastClientY = event.clientY;

		if (!this.dragStarted) {
			const deltaX = event.clientX - this.startX;
			const deltaY = event.clientY - this.startY;
			if (Math.hypot(deltaX, deltaY) < IMAGE_DRAG_THRESHOLD_PX) return;
			this.startDragging();
		}

		event.preventDefault();
		this.positionGhost();
		this.updateDropTarget();
	}

	private onMouseUp(event: MouseEvent): void {
		if (!this.source) return;
		if (!this.dragStarted) {
			this.clearListeners();
			this.source = null;
			return;
		}

		event.preventDefault();
		this.executeDrop();
		suppressNextClick(this.doc);
		this.cancel();
	}

	private onKeyDown(event: KeyboardEvent): void {
		if (event.key !== 'Escape') return;
		if (!this.source) return;
		event.preventDefault();
		this.cancel();
	}

	private onScroll(): void {
		if (!this.dragStarted) return;
		this.updateDropTarget();
	}

	private startDragging(): void {
		if (!this.source || this.dragStarted) return;
		this.dragStarted = true;
		closeActiveImagePanels();
		this.doc.body.addClass('be-image-dragging');
		this.source.sourceEl.addClass('is-drag-source');
		this.positionGhost();
		this.updateDropTarget();
	}

	private ensureGhost(): HTMLElement {
		if (this.ghostEl) return this.ghostEl;
		const ghost = createDiv({ cls: 'be-image-drag-ghost' });
		const img = createEl('img');
		const sourceImg = this.source?.sourceEl.querySelector<HTMLImageElement>('img');
		if (sourceImg) img.src = sourceImg.currentSrc || sourceImg.src;
		ghost.appendChild(img);
		this.doc.body.appendChild(ghost);
		this.ghostEl = ghost;
		return ghost;
	}

	private positionGhost(): void {
		if (!this.dragStarted) return;
		const ghost = this.ensureGhost();
		ghost.style.left = `${this.lastClientX + 18}px`;
		ghost.style.top = `${this.lastClientY + 18}px`;
	}

	private ensureIndicators(): void {
		if (!this.rowIndicatorEl) {
			this.rowIndicatorEl = createDiv({ cls: 'be-image-row-drop-indicator' });
			this.doc.body.appendChild(this.rowIndicatorEl);
		}
		if (!this.createRowIndicatorEl) {
			this.createRowIndicatorEl = createDiv({ cls: 'be-image-create-row-indicator' });
			this.doc.body.appendChild(this.createRowIndicatorEl);
		}
		if (!this.popOutIndicatorEl) {
			this.popOutIndicatorEl = createDiv({ cls: 'be-image-pop-out-indicator' });
			this.doc.body.appendChild(this.popOutIndicatorEl);
		}
	}

	private updateDropTarget(): void {
		this.currentTarget = this.computeDropTarget(this.lastClientX, this.lastClientY);
		this.renderDropIndicator();
	}

	private computeDropTarget(clientX: number, clientY: number): DropTarget | null {
		const source = this.source;
		if (!source) return null;

		const rowWidgets = Array.from(this.view.dom.querySelectorAll<HTMLElement>('.be-image-row-widget[data-be-from][data-be-to]'));
		for (const rowWidgetEl of rowWidgets) {
			const rowEl = rowWidgetEl.querySelector<HTMLElement>('.be-image-row');
			if (!rowEl) continue;
			const rowRect = rowEl.getBoundingClientRect();
			if (clientY < rowRect.top - IMAGE_DRAG_ROW_Y_TOLERANCE_PX || clientY > rowRect.bottom + IMAGE_DRAG_ROW_Y_TOLERANCE_PX) continue;

			const rowFrom = parseInt(rowWidgetEl.dataset.beFrom ?? '', 10);
			const rowTo = parseInt(rowWidgetEl.dataset.beTo ?? '', 10);
			if (Number.isNaN(rowFrom) || Number.isNaN(rowTo)) continue;
			const rowBlock = parseRowBlockAtRange(this.view.state, rowFrom, rowTo);
			if (!rowBlock) continue;

			const insertIndex = clampInsertIndex(computeRowInsertIndex(rowEl, clientX), rowBlock.images.length);
			if (source.kind === 'row-item' && source.rowFrom === rowFrom && source.rowTo === rowTo) {
				if (insertIndex === source.itemIndex || insertIndex === source.itemIndex + 1) return null;
				return { kind: 'reorder', rowFrom, rowTo, rowBlock, fromIndex: source.itemIndex, toIndex: insertIndex, rowEl };
			}
			return { kind: 'into-row', rowFrom, rowTo, rowBlock, insertIndex, rowEl };
		}

		const widgets = Array.from(this.view.dom.querySelectorAll<HTMLElement>('.be-image-widget[data-be-from][data-be-to]'));
		for (const widgetEl of widgets) {
			if (widgetEl.dataset.beRow !== undefined) continue;
			if (source.kind === 'standalone' && source.from === parseInt(widgetEl.dataset.beFrom ?? '', 10)) continue;
			const frameEl = resolveStandaloneFrame(widgetEl);
			const rect = frameEl.getBoundingClientRect();
			if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) continue;

			const targetFrom = parseInt(widgetEl.dataset.beFrom ?? '', 10);
			const targetTo = parseInt(widgetEl.dataset.beTo ?? '', 10);
			if (Number.isNaN(targetFrom) || Number.isNaN(targetTo)) continue;
			const targetBlock = parseStandaloneBlockAtRange(this.view.state, targetFrom, targetTo);
			if (!targetBlock) continue;
			const side: 'before' | 'after' = clientX < rect.left + rect.width / 2 ? 'before' : 'after';
			return { kind: 'create-row', targetFrom, targetTo, targetBlock, side, targetEl: frameEl };
		}

		return null;
	}

	private renderDropIndicator(): void {
		this.ensureIndicators();
		const rowIndicatorEl = this.rowIndicatorEl!;
		const createRowIndicatorEl = this.createRowIndicatorEl!;
		const popOutIndicatorEl = this.popOutIndicatorEl!;
		rowIndicatorEl.removeClass('is-visible');
		createRowIndicatorEl.removeClass('is-visible', 'is-before', 'is-after');
		popOutIndicatorEl.removeClass('is-visible');

		if (!this.currentTarget) {
			if (this.source?.kind === 'row-item') {
				const rowState = resolveRowStateByFrom(this.view, this.source.rowFrom);
				const rowRect = rowState?.rowEl.getBoundingClientRect();
				if (rowRect) {
					popOutIndicatorEl.style.left = `${rowRect.left}px`;
					popOutIndicatorEl.style.top = `${rowRect.bottom + 8}px`;
					popOutIndicatorEl.style.width = `${rowRect.width}px`;
					popOutIndicatorEl.addClass('is-visible');
				}
			}
			return;
		}
		if (this.currentTarget.kind === 'reorder' || this.currentTarget.kind === 'into-row') {
			const rect = this.currentTarget.rowEl.getBoundingClientRect();
			const insertIndex = this.currentTarget.kind === 'reorder' ? this.currentTarget.toIndex : this.currentTarget.insertIndex;
			rowIndicatorEl.style.left = `${computeRowIndicatorLeft(this.currentTarget.rowEl, insertIndex) - 1}px`;
			rowIndicatorEl.style.top = `${rect.top}px`;
			rowIndicatorEl.style.height = `${rect.height}px`;
			rowIndicatorEl.addClass('is-visible');
			return;
		}

		const rect = this.currentTarget.targetEl.getBoundingClientRect();
		createRowIndicatorEl.style.left = `${rect.left}px`;
		createRowIndicatorEl.style.top = `${rect.top}px`;
		createRowIndicatorEl.style.width = `${rect.width}px`;
		createRowIndicatorEl.style.height = `${rect.height}px`;
		createRowIndicatorEl.addClass('is-visible', this.currentTarget.side === 'before' ? 'is-before' : 'is-after');
	}

	private executeDrop(): void {
		const source = this.source;
		const target = this.currentTarget;
		if (!source) return;

		if (target?.kind === 'reorder') {
			const rowBlock = parseRowBlockAtRange(this.view.state, target.rowFrom, target.rowTo);
			if (!rowBlock) return;
			const images = reorderRowImages(rowBlock.images, target.fromIndex, target.toIndex);
			this.view.dispatch({
				changes: {
					from: target.rowFrom,
					to: target.rowTo,
					insert: rowHtmlForBlock({ ...rowBlock, images }, this.plugin),
				},
				effects: deselectImageBlock.of(null),
			});
			return;
		}

		if (source.kind === 'standalone') {
			const sourceBlock = parseStandaloneBlockAtRange(this.view.state, source.from, source.to);
			if (!sourceBlock || !target) return;

			if (target.kind === 'into-row') {
				const rowBlock = parseRowBlockAtRange(this.view.state, target.rowFrom, target.rowTo);
				if (!rowBlock) return;
				const nextImages = [...rowBlock.images];
				nextImages.splice(clampInsertIndex(target.insertIndex, nextImages.length), 0, sourceBlock);
				const sourceRemoval = removeStandaloneBlockRange(this.view.state, source.from, source.to);
				this.view.dispatch({
					changes: orderImageDragChanges([
						{
							from: target.rowFrom,
							to: target.rowTo,
							insert: rowHtmlForBlock({ ...rowBlock, images: nextImages }, this.plugin),
						},
						{ from: sourceRemoval.from, to: sourceRemoval.to, insert: '' },
					]),
					effects: deselectImageBlock.of(null),
				});
				return;
			}

			const targetBlock = parseStandaloneBlockAtRange(this.view.state, target.targetFrom, target.targetTo);
			if (!targetBlock) return;
			const sourceRemoval = removeStandaloneBlockRange(this.view.state, source.from, source.to);
			const rowHtml = imageRowHtml(
				buildStandaloneRowItems(sourceBlock, targetBlock, target.side),
				ROW_DEFAULTS.gap,
				ROW_DEFAULTS.justify,
				ROW_DEFAULTS.wrap,
				ROW_DEFAULTS.alignItems,
				this.plugin.settings.image.imageCornerRadiusPx,
			);
			this.view.dispatch({
				changes: orderImageDragChanges([
					{ from: target.targetFrom, to: target.targetTo, insert: rowHtml },
					{ from: sourceRemoval.from, to: sourceRemoval.to, insert: '' },
				]),
				effects: deselectImageBlock.of(null),
			});
			return;
		}

		const sourceRowBlock = parseRowBlockAtRange(this.view.state, source.rowFrom, source.rowTo);
		if (!sourceRowBlock) return;
		const movedBlock = sourceRowBlock.images[source.itemIndex];
		if (!movedBlock) return;
		const sourceImages = [...sourceRowBlock.images];
		sourceImages.splice(source.itemIndex, 1);

		if (!target) {
			const poppedHtml = standaloneHtmlForBlock(movedBlock, this.plugin);
			if (sourceImages.length === 0) {
				this.view.dispatch({
					changes: {
						from: source.rowFrom,
						to: source.rowTo,
						insert: poppedHtml,
					},
					effects: deselectImageBlock.of(null),
				});
				return;
			}
			this.view.dispatch({
				changes: {
					from: source.rowFrom,
					to: source.rowTo,
					insert: `${serializeRemainingRowItems(sourceImages, sourceRowBlock, this.plugin, true)}\n\n${poppedHtml}`,
				},
				effects: deselectImageBlock.of(null),
			});
			return;
		}

		if (target.kind === 'into-row') {
			const rowBlock = parseRowBlockAtRange(this.view.state, target.rowFrom, target.rowTo);
			if (!rowBlock) return;
			const nextImages = [...rowBlock.images];
			nextImages.splice(clampInsertIndex(target.insertIndex, nextImages.length), 0, movedBlock);
			this.view.dispatch({
				changes: orderImageDragChanges(sourceImages.length === 0
					? [
						{
							from: target.rowFrom,
							to: target.rowTo,
							insert: rowHtmlForBlock({ ...rowBlock, images: nextImages }, this.plugin),
						},
						{ ...removeRowBlockRange(this.view.state, source.rowFrom, source.rowTo), insert: '' },
					]
					: [
						{
							from: target.rowFrom,
							to: target.rowTo,
							insert: rowHtmlForBlock({ ...rowBlock, images: nextImages }, this.plugin),
						},
						{
							from: source.rowFrom,
							to: source.rowTo,
							insert: serializeRemainingRowItems(sourceImages, sourceRowBlock, this.plugin, true),
						},
					]),
				effects: deselectImageBlock.of(null),
			});
			return;
		}

		const targetBlock = parseStandaloneBlockAtRange(this.view.state, target.targetFrom, target.targetTo);
		if (!targetBlock) return;
		const rowHtml = imageRowHtml(
			buildStandaloneRowItems(movedBlock, targetBlock, target.side),
			ROW_DEFAULTS.gap,
			ROW_DEFAULTS.justify,
			ROW_DEFAULTS.wrap,
			ROW_DEFAULTS.alignItems,
			this.plugin.settings.image.imageCornerRadiusPx,
		);
		this.view.dispatch({
			changes: orderImageDragChanges(sourceImages.length === 0
				? [
					{ from: target.targetFrom, to: target.targetTo, insert: rowHtml },
					{ ...removeRowBlockRange(this.view.state, source.rowFrom, source.rowTo), insert: '' },
				]
				: [
					{ from: target.targetFrom, to: target.targetTo, insert: rowHtml },
					{
						from: source.rowFrom,
						to: source.rowTo,
						insert: serializeRemainingRowItems(sourceImages, sourceRowBlock, this.plugin, true),
					},
				]),
			effects: deselectImageBlock.of(null),
		});
	}

	cancel(): void {
		this.clearListeners();
		this.ghostEl?.remove();
		this.ghostEl = null;
		this.rowIndicatorEl?.remove();
		this.rowIndicatorEl = null;
		this.createRowIndicatorEl?.remove();
		this.createRowIndicatorEl = null;
		this.popOutIndicatorEl?.remove();
		this.popOutIndicatorEl = null;
		this.doc.body.removeClass('be-image-dragging');
		this.source?.sourceEl.removeClass('is-drag-source');
		this.source = null;
		this.currentTarget = null;
		this.dragStarted = false;
	}

	private clearListeners(): void {
		this.doc.removeEventListener('mousemove', this.onMouseMoveBound, true);
		this.doc.removeEventListener('mouseup', this.onMouseUpBound, true);
		this.doc.removeEventListener('keydown', this.onKeyDownBound, true);
		this.scrollerEl?.removeEventListener('scroll', this.onScrollBound);
	}
}

// ---------------------------------------------------------------------------
// Widget — Image row
// ---------------------------------------------------------------------------

class ImageRowWidget extends WidgetType {
	private readonly block: ImageRowBlock;
	private readonly rawHtml: string;
	private readonly plugin: BetterEditPlugin;
	private readonly from: number;
	private readonly to: number;

	constructor(
		block: ImageRowBlock,
		rawHtml: string,
		plugin: BetterEditPlugin,
		from: number,
		to: number,
	) {
		super();
		this.block = block;
		this.rawHtml = rawHtml;
		this.plugin = plugin;
		this.from = from;
		this.to = to;
	}

	toDOM(view: EditorView): HTMLElement {
		const wrapper = createDiv({ cls: 'be-image-row-widget' });
		wrapper.setAttribute('data-be-from', String(this.from));
		wrapper.setAttribute('data-be-to',   String(this.to));
		wrapper.setAttribute('data-be-row',  '');

		const rowEl = createDiv({ cls: 'be-image-row' });
		rowEl.style.gap = `${this.block.gap}px`;
		rowEl.style.justifyContent = this.block.justify;
		rowEl.style.flexWrap = this.block.wrap;
		rowEl.style.alignItems = this.block.alignItems;

		for (let i = 0; i < this.block.images.length; i++) {
			rowEl.appendChild(this.buildRowItem(view, this.block.images[i]!, i));
		}

		wrapper.appendChild(rowEl);
		return wrapper;
	}

	// ── Per-item rendering ────────────────────────────────────────────────────

	private buildRowItem(view: EditorView, imgBlock: SingleImageBlock | PlaceholderBlock, index: number): HTMLElement {
		const item = createDiv({ cls: 'be-image-row-item' });
		if (imgBlock.kind === 'placeholder') {
			item.appendChild(this.buildPlaceholderFrame(view, index));
		} else {
			item.appendChild(this.buildImageFrame(view, imgBlock, index));
		}
		return item;
	}

	private buildPlaceholderFrame(view: EditorView, index: number): HTMLElement {
		const el = createDiv({ cls: 'be-image-placeholder be-image-row-placeholder' });
		const iconWrapper = createDiv({ cls: 'be-image-placeholder-icon' });
		renderImagePlaceholderIcon(iconWrapper);
		el.appendChild(iconWrapper);
		el.appendChild(createDiv({ cls: 'be-image-placeholder-text', text: 'Add an image' }));

		const moreBtn = createToolbarButton(this.plugin, 'more', 'More');
		moreBtn.addClass('be-placeholder-more');
		this.plugin.registerDomEvent(moreBtn, 'mousedown', (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); });
		this.plugin.registerDomEvent(moreBtn, 'click', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			this.showRowPlaceholderMenu(e, view, el, index);
		});
		el.appendChild(moreBtn);

		this.plugin.registerDomEvent(el, 'mousedown', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
		});
		this.plugin.registerDomEvent(el, 'click', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			this.openReplacePanelForPlaceholder(view, el, index);
		});

		return el;
	}

	private openReplacePanelForPlaceholder(view: EditorView, anchorEl: HTMLElement, index: number): void {
		openReplacePanel(anchorEl, {
			onFile: async (file) => {
				const activeFile = this.plugin.app.workspace.getActiveFile();
				if (!activeFile) return;
				const savedPath = await saveImageToVault(this.plugin, file, activeFile);
				if (savedPath) this.replacePlaceholderAt(view, index, savedPath);
			},
			onSrc: (src) => this.replacePlaceholderAt(view, index, src),
			onDelete: () => this.deleteImageAt(view, index),
			linkInitialValue: '',
			scrollAnchor: anchorEl,
		});
	}

	private showRowPlaceholderMenu(e: MouseEvent, view: EditorView, anchorEl: HTMLElement, index: number): void {
		const menu = new Menu();

		menu.addItem(item => {
			item.setTitle('Replace');
			item.setIcon('image');
			item.onClick(() => this.openReplacePanelForPlaceholder(view, anchorEl, index));
		});

		menu.addItem(item => {
			item.setTitle('Duplicate');
			item.setIcon('copy');
			item.onClick(() => {
				const images = [...this.block.images];
				images.splice(index + 1, 0, { kind: 'placeholder' });
				this.updateRow(view, { ...this.block, images });
			});
		});

		menu.addItem(item => {
			item.setTitle('Pop image');
			item.setIcon('arrow-up-right');
			item.onClick(() => this.popOutPlaceholderAt(view, index));
		});

		menu.addItem(item => {
			item.setTitle('Delete');
			item.setIcon('trash');
			item.onClick(() => this.deleteImageAt(view, index));
		});

		menu.showAtMouseEvent(e);
	}

	private popOutPlaceholderAt(view: EditorView, index: number): void {
		const images = [...this.block.images];
		images.splice(index, 1);
		const poppedHtml = placeholderHtml();
		if (images.length === 0) {
			view.dispatch({ changes: { from: this.from, to: this.to, insert: poppedHtml } });
		} else {
			const remainingHtml = serializeRemainingRowItems(images, this.block, this.plugin);
			view.dispatch({ changes: { from: this.from, to: this.to, insert: `${remainingHtml}\n\n${poppedHtml}` } });
		}
	}

	private replacePlaceholderAt(view: EditorView, index: number, src: string): void {
		const { defaultImageWidth } = this.plugin.settings.image;
		const images = [...this.block.images];
		const width = imageRowReplacementWidth(images, index, defaultImageWidth);
		images[index] = { kind: 'single', src, width, alignment: 'center' };
		this.updateRow(view, { ...this.block, images });
	}

	private buildImageFrame(view: EditorView, imgBlock: SingleImageBlock, index: number): HTMLElement {
		const frame = createDiv({ cls: 'be-image-frame' });
		frame.style.width = imgBlock.width;

		const imgSrc = resolveImageSrc(this.plugin, imgBlock.src);
		const img = createEl('img', { attr: { src: imgSrc, draggable: 'false' } });
		const r = this.plugin.settings.image.imageCornerRadiusPx;
		const media = createDiv({ cls: 'be-image-media' });

		if (imgBlock.crop) {
			const { crop } = imgBlock;
			const blockW = parseInt(imgBlock.width, 10) || 1;
			if (crop.shape === 'circle') frame.addClass('be-circle-crop');
			const clipDiv = createDiv({ cls: 'be-image-crop-clip' });
			clipDiv.style.paddingTop = `${(crop.height / blockW * 100).toFixed(3)}%`;
			if (crop.shape !== 'circle' && r > 0) clipDiv.style.borderRadius = `${r}px`;
			const widthPct = (crop.imgWidth / blockW * 100).toFixed(3);
			const leftPct  = (crop.offsetX  / blockW * 100).toFixed(3);
			const topPct   = (crop.offsetY  / crop.height * 100).toFixed(3);
			img.style.cssText = `position: absolute; width: ${widthPct}%; max-width: none; left: -${leftPct}%; top: -${topPct}%; display: block;`;
			clipDiv.appendChild(img);
			media.appendChild(clipDiv);
		} else {
			const radiusStyle = r > 0 ? ` border-radius: ${r}px;` : '';
			img.style.cssText = `width: 100%; max-width: 100%; display: block;${radiusStyle}`;
			media.appendChild(img);
		}

		if (imgBlock.alt) {
			const badge = createDiv({ cls: 'be-image-alt-badge', text: 'ALT' });
			this.plugin.registerDomEvent(badge, 'click', (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				this.openAltTextPopover(view, frame, imgBlock, index);
			});
			media.appendChild(badge);
		}

		media.appendChild(this.buildResizeHandle(view, frame, img, imgBlock, index));
		frame.appendChild(media);

		if (imgBlock.caption !== undefined && !imgBlock.captionHidden) {
			frame.appendChild(this.buildCaption(view, imgBlock, index));
		}

		frame.appendChild(this.buildImageToolbar(view, frame, imgBlock, index));

		return frame;
	}

	private buildCaption(view: EditorView, imgBlock: SingleImageBlock, index: number): HTMLElement {
		const caption = createEl('figcaption', {
			cls: 'be-image-caption',
			attr: { contenteditable: 'plaintext-only' },
		});
		caption.textContent = imgBlock.caption ?? '';

		let captionClosed = false;
		const save = () => {
			if (captionClosed) return;
			const text = (caption.textContent ?? '').trim();
			if (text !== (imgBlock.caption ?? '').trim()) {
				captionClosed = true;
				this.updateImageAt(view, index, { caption: text || undefined });
			}
		};

		this.plugin.registerDomEvent(caption, 'mousedown', (e: MouseEvent) => e.stopPropagation());
		this.plugin.registerDomEvent(caption, 'click',     (e: MouseEvent) => e.stopPropagation());
		this.plugin.registerDomEvent(caption, 'keydown', (e: KeyboardEvent) => {
			e.stopPropagation();
			if (e.key === 'Enter')  { e.preventDefault(); save(); caption.blur(); }
			if (e.key === 'Escape') { captionClosed = true; caption.textContent = imgBlock.caption ?? ''; caption.blur(); }
		});
		this.plugin.registerDomEvent(caption, 'keyup', (e: KeyboardEvent) => e.stopPropagation());
		this.plugin.registerDomEvent(caption, 'beforeinput', (e: InputEvent) => e.stopPropagation());
		this.plugin.registerDomEvent(caption, 'input', (e: InputEvent) => e.stopPropagation());
		this.plugin.registerDomEvent(caption, 'blur', save);
		return caption;
	}

	private buildResizeHandle(view: EditorView, frameEl: HTMLElement, _imgEl: HTMLImageElement, imgBlock: SingleImageBlock, index: number): HTMLElement {
		const handle = createDiv({ cls: 'be-resize-handle' });
		handle.appendChild(createDiv({ cls: 'be-resize-grip' }));

		this.plugin.registerDomEvent(handle, 'mousedown', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();

			const startX = e.clientX;
			const renderedWidth = frameEl.offsetWidth || parseInt(imgBlock.width, 10) || 320;
			const storedWidth   = parseInt(imgBlock.width, 10) || renderedWidth;
			const minWidth = Math.max(1, this.plugin.settings.image.minImageWidthPx);
			const startCrop = imgBlock.crop ? { ...imgBlock.crop } : undefined;
			frameEl.addClass('is-resizing');

			const onMove = (moveEvt: MouseEvent) => {
				const w = Math.max(minWidth, renderedWidth + moveEvt.clientX - startX);
				frameEl.style.width = `${w}px`;
			};

			const onUp = (upEvt: MouseEvent) => {
				activeDocument.removeEventListener('mousemove', onMove);
				activeDocument.removeEventListener('mouseup', onUp);
				frameEl.removeClass('is-resizing');
				const w = Math.max(minWidth, renderedWidth + upEvt.clientX - startX);
				let crop = imgBlock.crop;
				if (startCrop && storedWidth > 0) {
					const scale = w / storedWidth;
					crop = {
						...startCrop,
						offsetX:  Math.round(startCrop.offsetX  * scale),
						offsetY:  Math.round(startCrop.offsetY  * scale),
						height:   Math.round(startCrop.height   * scale),
						imgWidth: Math.round(startCrop.imgWidth * scale),
					};
					if (crop.shape === 'circle') crop.height = w;
				}
				this.updateImageAt(view, index, { width: `${w}px`, crop });
			};

			activeDocument.addEventListener('mousemove', onMove);
			activeDocument.addEventListener('mouseup', onUp);
		});

		return handle;
	}

	private buildImageToolbar(view: EditorView, frameEl: HTMLElement, imgBlock: SingleImageBlock, index: number): HTMLElement {
		const bar = createDiv({ cls: 'be-image-toolbar' });
		const w = parseInt(imgBlock.width, 10);
		const compact = !isNaN(w) && w < this.plugin.settings.image.compactToolbarThresholdPx;

		const moreBtn = createToolbarButton(this.plugin, 'more', 'More');
		this.plugin.registerDomEvent(moreBtn, 'click', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			this.showImageContextMenu(e, view, frameEl, imgBlock, index);
		});

		if (compact) {
			bar.appendChild(moreBtn);
		} else {
			const cropBtn = createToolbarButton(this.plugin, 'crop', 'Crop');
			this.plugin.registerDomEvent(cropBtn, 'click', (e: MouseEvent) => {
				e.preventDefault(); e.stopPropagation();
				this.openCropModal(view, imgBlock, index);
			});

			const captionBtn = createToolbarButton(this.plugin, 'caption', 'Caption');
			if (imgBlock.caption !== undefined && !imgBlock.captionHidden) captionBtn.addClass('is-active');
			this.plugin.registerDomEvent(captionBtn, 'click', (e: MouseEvent) => {
				e.preventDefault(); e.stopPropagation();
				this.toggleCaption(view, imgBlock, index);
			});

			const replaceBtn = createToolbarButton(this.plugin, 'replace', 'Replace');
			this.plugin.registerDomEvent(replaceBtn, 'click', (e: MouseEvent) => {
				e.preventDefault(); e.stopPropagation();
				this.openReplaceForImage(view, frameEl, imgBlock, index);
			});

			bar.appendChild(cropBtn);
			bar.appendChild(captionBtn);
			bar.appendChild(replaceBtn);
			bar.appendChild(createDiv({ cls: 'be-toolbar-sep' }));
			bar.appendChild(moreBtn);
		}

		return bar;
	}

	private showImageContextMenu(e: MouseEvent, view: EditorView, frameEl: HTMLElement, imgBlock: SingleImageBlock, index: number): void {
		const menu = new Menu();

		menu.addItem(item => {
			item.setTitle('Crop');
			item.setIcon('crop');
			item.onClick(() => this.openCropModal(view, imgBlock, index));
		});

		menu.addItem(item => {
			const visible = imgBlock.caption !== undefined && !imgBlock.captionHidden;
			item.setTitle('Caption');
			item.setIcon('captions');
			item.setChecked(visible);
			item.onClick(() => this.toggleCaption(view, imgBlock, index));
		});

		menu.addItem(item => {
			item.setTitle('Replace');
			item.setIcon('image');
			item.onClick(() => this.openReplaceForImage(view, frameEl, imgBlock, index));
		});

		menu.addSeparator();

		menu.addItem(item => {
			item.setTitle('Alt text');
			item.setIcon('badge-info');
			item.setChecked(!!imgBlock.alt);
			item.onClick(() => this.openAltTextPopover(view, frameEl, imgBlock, index));
		});

		menu.addSeparator();

		menu.addItem(item => {
			item.setTitle('Pop image');
			item.setIcon('arrow-up-right');
			item.onClick(() => this.popOutImageAt(view, index));
		});

		menu.addItem(item => {
			item.setTitle('Delete');
			item.setIcon('trash');
			item.onClick(() => this.deleteImageAt(view, index));
		});

		menu.showAtMouseEvent(e);
	}

	// ── Crop / replace / alt ──────────────────────────────────────────────────

	private openCropModal(view: EditorView, imgBlock: SingleImageBlock, index: number): void {
		const resolvedSrc  = resolveImageSrc(this.plugin, imgBlock.src);
		const docImgWidth  = imgBlock.crop?.imgWidth ?? (parseInt(imgBlock.width, 10) || 320);
		const docDisplayWidth = parseInt(imgBlock.width, 10) || 320;
		new CropModal(
			this.plugin.app, resolvedSrc, imgBlock.crop, docImgWidth, docDisplayWidth,
			(newCrop: ImageCrop, displayWidth: number) => {
				this.updateImageAt(view, index, { width: `${displayWidth}px`, crop: newCrop });
			},
		).open();
	}

	private toggleCaption(view: EditorView, imgBlock: SingleImageBlock, index: number): void {
		const enabling = imgBlock.caption === undefined || imgBlock.captionHidden;
		let patch: Partial<SingleImageBlock>;
		if (imgBlock.caption === undefined) {
			patch = { caption: '', captionHidden: undefined };
		} else {
			patch = { captionHidden: imgBlock.captionHidden ? undefined : true };
		}
		this.updateImageAt(view, index, patch);
		if (enabling) {
			window.requestAnimationFrame(() => {
				const frame = view.dom.querySelector<HTMLElement>(`[data-be-from="${this.from}"] .be-image-row-item:nth-child(${index + 1}) .be-image-caption`);
				frame?.focus();
			});
		}
	}

	private openReplaceForImage(view: EditorView, frameEl: HTMLElement, imgBlock: SingleImageBlock, index: number): void {
		openReplacePanel(frameEl, {
			onFile: async (file) => {
				const activeFile = this.plugin.app.workspace.getActiveFile();
				if (!activeFile) return;
				const savedPath = await saveImageToVault(this.plugin, file, activeFile);
				if (!savedPath) return;
				const crop = imgBlock.crop ? await recalibrateCrop(imgBlock.crop, file) : undefined;
				this.updateImageAt(view, index, { src: savedPath, crop });
			},
			onSrc: (src) => this.updateImageAt(view, index, { src }),
			linkInitialValue: imgBlock.src,
			scrollAnchor: null,
		});
	}

	private openAltTextPopover(view: EditorView, frameEl: HTMLElement, imgBlock: SingleImageBlock, index: number): void {
		activeDocument.querySelector('.be-alt-popover')?.remove();
		const popover = createDiv({ cls: 'be-alt-popover' });

		const positionPopover = () => {
			const rect = frameEl.getBoundingClientRect();
			const popW = 280;
			const left = Math.max(8, Math.min(rect.right - popW, window.innerWidth - popW - 16));
			popover.style.top  = `${rect.bottom + 8}px`;
			popover.style.left = `${left}px`;
		};

		const header = createDiv({ cls: 'be-alt-popover-header' });
		header.createSpan({ text: 'Alt text' });
		const closeBtn = createEl('button', { cls: 'be-alt-popover-close', text: '×' });
		header.appendChild(closeBtn);

		const desc = createDiv({ cls: 'be-alt-popover-desc', text: 'Describe this image for people who cannot see it.' });
		const input = createEl('input', { cls: 'be-alt-popover-input', attr: {
			type: 'text', value: imgBlock.alt ?? '', placeholder: 'Add alt text…',
		} });
		popover.append(header, desc, input);

		let altClosed = false;
		const scroller = frameEl.closest('.cm-scroller');

		const closePopover = (save: boolean) => {
			if (altClosed) return;
			altClosed = true;
			activeDocument.removeEventListener('mousedown', closeOnOutside, true);
			scroller?.removeEventListener('scroll', positionPopover);
			if (save) this.updateImageAt(view, index, { alt: input.value.trim() || undefined });
			popover.remove();
		};

		input.addEventListener('blur',    () => closePopover(true));
		input.addEventListener('keydown', ev => {
			if (ev.key === 'Enter')  closePopover(true);
			if (ev.key === 'Escape') closePopover(false);
		});
		closeBtn.addEventListener('click', () => closePopover(true));

		const closeOnOutside = (ev: MouseEvent) => {
			if (!popover.contains(ev.target as Node)) closePopover(true);
		};
		window.setTimeout(() => activeDocument.addEventListener('mousedown', closeOnOutside, true), 50);
		scroller?.addEventListener('scroll', positionPopover, { passive: true });

		activeDocument.body.appendChild(popover);
		positionPopover();
		window.requestAnimationFrame(() => input.focus());
	}

	// ── Row / image mutations ─────────────────────────────────────────────────

	private updateRow(view: EditorView, newBlock: ImageRowBlock): void {
		view.dispatch({
			changes: {
				from: this.from,
				to: this.to,
				insert: imageRowHtml(
					newBlock.images, newBlock.gap, newBlock.justify,
					newBlock.wrap, newBlock.alignItems,
					this.plugin.settings.image.imageCornerRadiusPx,
				),
			},
		});
	}

	private updateImageAt(view: EditorView, index: number, patch: Partial<SingleImageBlock>): void {
		const images = [...this.block.images];
		const current = images[index];
		if (!current || current.kind !== 'single') return;
		images[index] = { ...current, ...patch };
		this.updateRow(view, { ...this.block, images });
	}

	private popOutImageAt(view: EditorView, index: number): void {
		const images = [...this.block.images];
		const img = images.splice(index, 1)[0];
		const { defaultImageAlignment, imageCornerRadiusPx } = this.plugin.settings.image;
		let poppedHtml = '';
		if (img?.kind === 'single') {
			poppedHtml = singleImageHtml(
				img.src, img.width, defaultImageAlignment,
				img.caption, img.crop, img.alt, imageCornerRadiusPx, img.captionHidden,
			);
		}

		if (images.length === 0) {
			view.dispatch({
				changes: { from: this.from, to: this.to, insert: poppedHtml.trimStart() },
			});
		} else {
			view.dispatch({
				changes: { from: this.from, to: this.to, insert: `${serializeRemainingRowItems(images, this.block, this.plugin)}\n\n${poppedHtml}` },
			});
		}
	}

	private deleteImageAt(view: EditorView, index: number): void {
		const images = [...this.block.images];
		images.splice(index, 1);

		if (images.length === 0) {
			const text = view.state.doc.toString();
			let from = this.from;
			let to   = this.to;
			if (to < text.length && text[to] === '\n')        to++;
			else if (from > 0 && text[from - 1] === '\n') from--;
			view.dispatch({ changes: { from, to, insert: '' } });
		} else {
			view.dispatch({
				changes: {
					from: this.from,
					to: this.to,
					insert: serializeRemainingRowItems(images, this.block, this.plugin),
				},
			});
		}
	}

	eq(other: ImageRowWidget): boolean {
		return this.rawHtml === other.rawHtml && this.from === other.from && this.to === other.to;
	}

	ignoreEvent(event: Event): boolean {
		return event.type === 'mousedown';
	}
}

// ---------------------------------------------------------------------------
// ViewPlugin
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Decoration builder — uses EditorState (not EditorView) so it can be called
// from a StateField, which is required for block-level Decoration.replace.
// ViewPlugin cannot provide block decorations (CM6 throws RangeError).
// ---------------------------------------------------------------------------

function buildDecorations(
	state: EditorState,
	plugin: BetterEditPlugin,
	selection: SelectedImageBlock | null,
): DecorationSet {
	if (!plugin.settings.image.enabled) return Decoration.none;
	if (!state.field(editorLivePreviewField, false)) {
		return Decoration.none;
	}

	const decorations: Range<Decoration>[] = [];
	const fullText = state.doc.toString();
	const SINGLE_MARKER = '<div data-better-edit-image=';
	const ROW_MARKER    = '<div data-better-edit-image-row';
	const rowsEnabled   = plugin.settings.image.imageRows;
	let searchFrom = 0;

	while (true) {
		const singleIdx = fullText.indexOf(SINGLE_MARKER, searchFrom);
		const rowIdx    = rowsEnabled ? fullText.indexOf(ROW_MARKER, searchFrom) : -1;

		let openIdx: number;
		let isRow: boolean;
		if (singleIdx === -1 && rowIdx === -1) break;
		if (singleIdx === -1)        { openIdx = rowIdx;    isRow = true;  }
		else if (rowIdx === -1)      { openIdx = singleIdx; isRow = false; }
		else if (rowIdx < singleIdx) { openIdx = rowIdx;    isRow = true;  }
		else                         { openIdx = singleIdx; isRow = false; }

		const blockEnd = findBlockEnd(fullText, openIdx);
		if (blockEnd === -1) break;
		const rawHtml = fullText.slice(openIdx, blockEnd);

		let widget: WidgetType;
		if (isRow) {
			const block = parseImageRowBlock(rawHtml);
			if (!block) { searchFrom = blockEnd; continue; }
			widget = new ImageRowWidget(block, rawHtml, plugin, openIdx, blockEnd);
		} else {
			const block = parseImageBlock(rawHtml);
			if (!block || block.kind === 'row') { searchFrom = blockEnd; continue; }
			const isSelected = selection !== null && selection.from === openIdx;
			if (block.kind === 'placeholder') {
				widget = new PlaceholderWidget(plugin, openIdx, blockEnd, isSelected);
			} else {
				widget = new ImageWidget(block, rawHtml, plugin, openIdx, blockEnd, isSelected);
			}
		}

		const lineStart = state.doc.lineAt(openIdx).from;
		const hasLinePrefix = fullText.slice(lineStart, openIdx).trim().length > 0;
		decorations.push(Decoration.replace({ widget, block: !hasLinePrefix }).range(openIdx, blockEnd));
		searchFrom = blockEnd;
	}

	decorations.sort((a, b) => a.from - b.from);
	return Decoration.set(decorations);
}

// ---------------------------------------------------------------------------
// StateField — provides block decorations (allowed; ViewPlugin cannot)
// ---------------------------------------------------------------------------

export function createImageDecorationField(plugin: BetterEditPlugin): Extension {
	return StateField.define<DecorationSet>({
		create(state) {
			return buildDecorations(state, plugin, state.field(imageSelectionField, false) ?? null);
		},
		update(decos, tr) {
			const nextSelection = tr.state.field(imageSelectionField, false) ?? null;
			const prevSelection = tr.startState.field(imageSelectionField, false) ?? null;
			const selChanged = nextSelection !== prevSelection;
			const modeChanged = tr.state.field(editorLivePreviewField, false) !== tr.startState.field(editorLivePreviewField, false);
			const enabledToggled = tr.effects.some(e => e.is(imageFeatureEnabledEffect));
			if (tr.docChanged || tr.selection || selChanged || modeChanged || enabledToggled) {
				return buildDecorations(tr.state, plugin, nextSelection);
			}
			return decos.map(tr.changes);
		},
		provide: field => [
			EditorView.decorations.from(field),
			EditorView.atomicRanges.from(field, value => () => value),
		],
	});
}

// ---------------------------------------------------------------------------
// ViewPlugin — mousedown handler only (no decorations)
// ---------------------------------------------------------------------------

export function createImageWidgetExtension(plugin: BetterEditPlugin): Extension {
	return ViewPlugin.fromClass(
			class {
				private readonly view: EditorView;
				private readonly dragManager: ImageDragManager;
				private readonly rowToolbarController: ImageRowToolbarController;

				constructor(view: EditorView) {
					this.view = view;
					this.dragManager = new ImageDragManager(view, plugin);
					this.rowToolbarController = new ImageRowToolbarController(view, plugin);
					syncNativeImageEmbedClasses(view);

					plugin.registerDomEvent(view.dom, 'drop', () => {
						if (!plugin.settings.image.enabled) return;
						if (!plugin.settings.image.handleDroppedImages) return;
						notePotentialNativeImageDrop();
					}, { capture: true });

					plugin.registerDomEvent(view.dom, 'mousedown', (event: MouseEvent) => {
						const target = event.target;
						if (!(target instanceof Element)) return;

						const dragSource = this.dragManager.tryStartDrag(event);
						if (dragSource?.kind === 'standalone') {
							view.dispatch({
								selection: { anchor: dragSource.from },
								effects: selectImageBlock.of({ from: dragSource.from, to: dragSource.to }),
							});
							view.focus();
							return;
						}
						if (dragSource?.kind === 'row-item') {
							return;
						}

						if (target.closest('.be-resize-handle, .be-image-toolbar, .be-image-caption, .be-image-alt-badge, .be-image-placeholder')) return;

						const hitWidget = target.closest<HTMLElement>('[data-be-from]');
						if (hitWidget) {
							const from = parseInt(hitWidget.dataset.beFrom ?? '', 10);
							const to   = parseInt(hitWidget.dataset.beTo   ?? '', 10);
							if (isNaN(from) || isNaN(to)) return;

							if (hitWidget.dataset.beRow !== undefined) {
								// Row widget — prevent cursor placement inside source HTML but
								// do not use the single-image selection model.
								if (!target.closest('.be-resize-handle, .be-toolbar-btn, .be-image-caption, .be-image-placeholder, .be-image-row-toolbar')) {
									event.preventDefault();
								}
								return;
							}

							if (!target.closest('.be-resize-handle, .be-toolbar-btn, .be-image-caption, .be-image-placeholder')) {
								event.preventDefault();
							}
							view.dispatch({
								selection: { anchor: from },
								effects: selectImageBlock.of({ from, to }),
							});
							view.focus();
						} else if (!target.closest('.be-image-widget, .be-image-row-widget')) {
							view.dispatch({ effects: deselectImageBlock.of(null) });
						}
					}, { capture: true });
				}

				update(): void {
					syncNativeImageEmbedClasses(this.view);
					this.rowToolbarController.update();
				}

				destroy(): void {
					this.rowToolbarController.destroy();
					this.dragManager.destroy();
				}
			},
		);
	}

function syncNativeImageEmbedClasses(view: EditorView): void {
	const embedEls = view.dom.querySelectorAll<HTMLElement>('.cm-html-embed');
	for (const embedEl of Array.from(embedEls)) {
		const hasImage = embedEl.querySelector('[data-better-edit-image]') !== null;
		const hasRow = embedEl.querySelector('[data-better-edit-image-row]') !== null;
		const hasStandalonePlaceholder = !hasRow && embedEl.querySelector('[data-better-edit-image="placeholder"]') !== null;
		embedEl.toggleClass('be-native-image-embed', hasImage);
		embedEl.toggleClass('be-native-image-row-embed', hasRow);
		embedEl.toggleClass('be-native-image-placeholder-embed', hasStandalonePlaceholder);
	}
}
