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
	placeholderHtml,
	findBlockEnd,
} from './html-schema';
import { CropModal } from './crop-modal';
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

const ROW_DEFAULTS = { gap: 10, justify: 'flex-start' as const, wrap: 'nowrap', alignItems: 'flex-start' };

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
			if (e.key === 'Enter')  { e.preventDefault(); save(); caption.blur(); }
			if (e.key === 'Escape') { captionClosed = true; caption.textContent = this.block.caption ?? ''; caption.blur(); }
		});

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
		for (const { title, value } of [
			{ title: 'Align left',   value: 'left'   as ImageAlignment },
			{ title: 'Align center', value: 'center' as ImageAlignment },
			{ title: 'Align right',  value: 'right'  as ImageAlignment },
		]) {
			menu.addItem(item => {
				item.setTitle(title);
				if (this.block.alignment === value) item.setChecked(true);
				item.onClick(() => this.updateBlock(view, { alignment: value }));
			});
		}

		menu.addSeparator();

		// Group 2 — Caption, Crop, Replace
		menu.addItem(item => {
			const visible = this.block.caption !== undefined && !this.block.captionHidden;
			item.setTitle('Caption');
			item.setChecked(visible);
			item.onClick(() => this.toggleCaption(view));
		});

		menu.addItem(item => {
			item.setTitle('Crop');
			item.onClick(() => this.openCropModal(view));
		});

		menu.addItem(item => {
			item.setTitle('Replace');
			item.onClick(() => this.openReplacePanel(view, frameEl));
		});

		menu.addSeparator();

		// Group 3 — Alt text
		menu.addItem(item => {
			item.setTitle('Alt text');
			item.setChecked(!!this.block.alt);
			item.onClick(() => this.openAltTextPopover(view, frameEl));
		});

		menu.addSeparator();

		// Group 4 — Copy, Duplicate, Add to row, Delete
		menu.addItem(item => {
			item.setTitle('Copy');
			item.onClick(() => this.copyBlock());
		});

		menu.addItem(item => {
			item.setTitle('Duplicate');
			item.onClick(() => this.duplicateBlock(view));
		});

		if (this.plugin.settings.image.imageRows) {
			menu.addItem(item => {
				item.setTitle('Add to row');
				item.onClick(() => this.convertToRow(view));
			});
		}

		menu.addItem(item => {
			item.setTitle('Delete');
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
			requestAnimationFrame(() => {
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
		} }) as HTMLInputElement;

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
		setTimeout(() => activeDocument.addEventListener('mousedown', closeOnOutside, true), 50);

		scroller?.addEventListener('scroll', positionPopover, { passive: true });

		activeDocument.body.appendChild(popover);
		positionPopover();
		requestAnimationFrame(() => input.focus());
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

	const linkPane  = createDiv({ cls: 'be-replace-pane', attr: { style: 'display:none' } });
	const linkInput = createEl('input', { cls: 'be-replace-link-input', attr: {
		type: 'text', value: opts.linkInitialValue, placeholder: 'Paste image URL or vault path…',
	} }) as HTMLInputElement;
	linkPane.appendChild(linkInput);

	panel.append(tabBar, uploadPane, linkPane);

	uploadTab.addEventListener('click', () => {
		uploadTab.addClass('is-active'); linkTab.removeClass('is-active');
		uploadPane.style.display = ''; linkPane.style.display = 'none';
	});
	linkTab.addEventListener('click', () => {
		linkTab.addClass('is-active'); uploadTab.removeClass('is-active');
		linkPane.style.display = ''; uploadPane.style.display = 'none';
		requestAnimationFrame(() => { linkInput.focus(); if (opts.linkInitialValue) linkInput.select(); });
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
		const src = linkInput.value.trim();
		if (!src) return;
		opts.onSrc(src);
		closePanel();
	});

	const closeOnOutside = (ev: MouseEvent) => {
		if (!panel.contains(ev.target as Node)) closePanel();
	};
	setTimeout(() => activeDocument.addEventListener('mousedown', closeOnOutside, true), 50);

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

		wrapper.appendChild(this.buildRowToolbar(view));

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

	// ── Row-level toolbar ─────────────────────────────────────────────────────

	private buildRowToolbar(view: EditorView): HTMLElement {
		const bar = createDiv({ cls: 'be-image-row-toolbar' });

		// Add image — Lucide 'image' icon, colour-safe in all themes
		const addBtn = createEl('button', { cls: 'be-toolbar-btn', attr: { type: 'button' } });
		setIcon(addBtn, 'image');
		setTooltip(addBtn, 'Add image');
		this.plugin.registerDomEvent(addBtn, 'click', (e: MouseEvent) => {
			e.preventDefault(); e.stopPropagation();
			this.updateRow(view, { ...this.block, images: [...this.block.images, { kind: 'placeholder' }] });
		});
		bar.appendChild(addBtn);

		bar.appendChild(createDiv({ cls: 'be-toolbar-sep' }));

		// Justify inline toggles — flex-start, center, space-between (flex-end is removed from here)
		const justifyOptions: Array<{ value: RowJustify; icon: ImageIconName; title: string }> = [
			{ value: 'flex-start',    icon: 'row-justify-left',          title: 'Justify: start'         },
			{ value: 'center',        icon: 'row-justify-center',        title: 'Justify: center'        },
			{ value: 'space-between', icon: 'row-justify-space-between', title: 'Justify: space between' },
		];
		for (const { value, icon, title } of justifyOptions) {
			const btn = createToolbarButton(this.plugin, icon, title);
			if (this.block.justify === value) btn.addClass('is-active');
			this.plugin.registerDomEvent(btn, 'click', (e: MouseEvent) => {
				e.preventDefault(); e.stopPropagation();
				this.updateRow(view, { ...this.block, justify: value });
			});
			bar.appendChild(btn);
		}

		bar.appendChild(createDiv({ cls: 'be-toolbar-sep' }));

		// More — wrap, align-items, space-around/evenly, copy, duplicate, delete
		const moreBtn = createToolbarButton(this.plugin, 'more', 'More');
		moreBtn.addClass('be-row-toolbar-more');
		this.plugin.registerDomEvent(moreBtn, 'click', (e: MouseEvent) => {
			e.preventDefault(); e.stopPropagation();
			this.showMoreMenu(e, view);
		});
		bar.appendChild(moreBtn);

		return bar;
	}

	private showMoreMenu(e: MouseEvent, view: EditorView): void {
		const menu = new Menu();

		// Justify content submenu — all 6 options including the 4 toolbar presets
		menu.addItem(item => {
			item.setTitle('Justify content');
			item.setSection('layout');
			item.setIcon('align-justify');
			const sub = (item as any).setSubmenu() as Menu;
			for (const [title, value] of [
				['Flex start',    'flex-start'   ],
				['Flex end',      'flex-end'     ],
				['Center',        'center'       ],
				['Space between', 'space-between'],
				['Space around',  'space-around' ],
				['Space evenly',  'space-evenly' ],
			] as const) {
				sub.addItem((si: MenuItem) => {
					si.setTitle(title);
					si.setChecked(this.block.justify === value);
					si.onClick(() => this.updateRow(view, { ...this.block, justify: value }));
				});
			}
		});

		// Align items submenu
		menu.addItem(item => {
			item.setTitle('Align items');
			item.setSection('layout');
			item.setIcon('align-vertical-distribute-center');
			const sub = (item as any).setSubmenu() as Menu;
			for (const [title, value] of [
				['Start',    'flex-start'],
				['Center',   'center'   ],
				['End',      'flex-end' ],
				['Stretch',  'stretch'  ],
				['Baseline', 'baseline' ],
			] as const) {
				sub.addItem((si: MenuItem) => {
					si.setTitle(title);
					si.setChecked(this.block.alignItems === value);
					si.onClick(() => this.updateRow(view, { ...this.block, alignItems: value }));
				});
			}
		});

		// Wrap submenu
		menu.addItem(item => {
			item.setTitle('Wrap');
			item.setSection('layout');
			item.setIcon('wrap-text');
			const sub = (item as any).setSubmenu() as Menu;
			for (const [title, value] of [
				['No wrap',      'nowrap'      ],
				['Wrap',         'wrap'        ],
				['Wrap reverse', 'wrap-reverse'],
			] as const) {
				sub.addItem((si: MenuItem) => {
					si.setTitle(title);
					si.setChecked(this.block.wrap === value);
					si.onClick(() => this.updateRow(view, { ...this.block, wrap: value }));
				});
			}
		});

		// Gap submenu — preset pixel values
		menu.addItem(item => {
			item.setTitle('Gap');
			item.setSection('layout');
			item.setIcon('ruler');
			const sub = (item as any).setSubmenu() as Menu;
			for (const px of [0, 8, 16, 24, 32, 40, 48, 56, 64]) {
				sub.addItem((si: MenuItem) => {
					si.setTitle(`${px}px`);
					si.setChecked(this.block.gap === px);
					si.onClick(() => this.updateRow(view, { ...this.block, gap: px }));
				});
			}
		});

		menu.addItem(item => {
			item.setTitle('Reset to defaults');
			item.setSection('layout');
			item.setIcon('rotate-ccw');
			item.onClick(() => this.updateRow(view, { ...this.block, ...ROW_DEFAULTS }));
		});

		// Actions
		menu.addItem(item => {
			item.setTitle('Add image');
			item.setSection('actions');
			item.setIcon('image');
			item.onClick(() => this.updateRow(view, { ...this.block, images: [...this.block.images, { kind: 'placeholder' }] }));
		});
		menu.addItem(item => {
			item.setTitle('Copy HTML');
			item.setSection('actions');
			item.setIcon('copy');
			item.onClick(() => navigator.clipboard.writeText(this.rawHtml));
		});
		menu.addItem(item => {
			item.setTitle('Duplicate row');
			item.setSection('actions');
			item.setIcon('copy-plus');
			item.onClick(() => this.duplicateRow(view));
		});
		menu.addItem(item => {
			item.setTitle('Delete row');
			item.setSection('actions');
			item.setIcon('trash');
			item.onClick(() => view.dispatch({ changes: { from: this.from, to: this.to, insert: '' } }));
		});

		menu.showAtMouseEvent(e);
	}

	private duplicateRow(view: EditorView): void {
		const doc = view.state.doc;
		const insertAt = this.to < doc.length && doc.sliceString(this.to, this.to + 1) === '\n'
			? this.to + 1
			: this.to;
		view.dispatch({ changes: { from: insertAt, to: insertAt, insert: this.rawHtml + '\n' } });
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
		const poppedHtml = '\n' + placeholderHtml();
		if (images.length === 0) {
			view.dispatch({ changes: { from: this.from, to: this.to, insert: poppedHtml.trimStart() } });
		} else {
			const { imageCornerRadiusPx } = this.plugin.settings.image;
			const newRowHtml = imageRowHtml(images, this.block.gap, this.block.justify, this.block.wrap, this.block.alignItems, imageCornerRadiusPx);
			view.dispatch({ changes: { from: this.from, to: this.to, insert: newRowHtml + poppedHtml } });
		}
	}

	private replacePlaceholderAt(view: EditorView, index: number, src: string): void {
		const { defaultImageWidth, imageCornerRadiusPx } = this.plugin.settings.image;
		const images = [...this.block.images];
		images[index] = { kind: 'single', src, width: defaultImageWidth, alignment: 'center' };
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
			if (e.key === 'Enter')  { e.preventDefault(); save(); caption.blur(); }
			if (e.key === 'Escape') { captionClosed = true; caption.textContent = imgBlock.caption ?? ''; caption.blur(); }
		});
		this.plugin.registerDomEvent(caption, 'blur', save);
		return caption;
	}

	private buildResizeHandle(view: EditorView, frameEl: HTMLElement, imgEl: HTMLImageElement, imgBlock: SingleImageBlock, index: number): HTMLElement {
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
			item.onClick(() => this.openCropModal(view, imgBlock, index));
		});

		menu.addItem(item => {
			const visible = imgBlock.caption !== undefined && !imgBlock.captionHidden;
			item.setTitle('Caption');
			item.setChecked(visible);
			item.onClick(() => this.toggleCaption(view, imgBlock, index));
		});

		menu.addItem(item => {
			item.setTitle('Replace');
			item.onClick(() => this.openReplaceForImage(view, frameEl, imgBlock, index));
		});

		menu.addSeparator();

		menu.addItem(item => {
			item.setTitle('Alt text');
			item.setChecked(!!imgBlock.alt);
			item.onClick(() => this.openAltTextPopover(view, frameEl, imgBlock, index));
		});

		menu.addSeparator();

		menu.addItem(item => {
			item.setTitle('Pop image');
			item.onClick(() => this.popOutImageAt(view, index));
		});

		menu.addItem(item => {
			item.setTitle('Delete');
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
			requestAnimationFrame(() => {
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
		} }) as HTMLInputElement;
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
		setTimeout(() => activeDocument.addEventListener('mousedown', closeOnOutside, true), 50);
		scroller?.addEventListener('scroll', positionPopover, { passive: true });

		activeDocument.body.appendChild(popover);
		positionPopover();
		requestAnimationFrame(() => input.focus());
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
			poppedHtml = '\n' + singleImageHtml(
				img.src, img.width, defaultImageAlignment,
				img.caption, img.crop, img.alt, imageCornerRadiusPx, img.captionHidden,
			);
		}

		if (images.length === 0) {
			view.dispatch({
				changes: { from: this.from, to: this.to, insert: poppedHtml.trimStart() },
			});
		} else {
			const newRowHtml = imageRowHtml(images, this.block.gap, this.block.justify, this.block.wrap, this.block.alignItems, imageCornerRadiusPx);
			view.dispatch({
				changes: { from: this.from, to: this.to, insert: newRowHtml + poppedHtml },
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
			this.updateRow(view, { ...this.block, images });
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
				constructor(view: EditorView) {
					plugin.registerDomEvent(view.dom, 'drop', () => {
						if (!plugin.settings.image.enabled) return;
						if (!plugin.settings.image.handleDroppedImages) return;
						notePotentialNativeImageDrop();
					}, { capture: true });

					plugin.registerDomEvent(view.dom, 'mousedown', (event: MouseEvent) => {
						const target = event.target;
					if (!(target instanceof Element)) return;
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
			},
		);
	}
