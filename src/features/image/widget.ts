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
import { EditorState, Extension, Range, StateField } from '@codemirror/state';
// syntaxTree removed — Obsidian uses a custom HyperMD parser with non-standard
// node names (no 'HTMLBlock'); we scan raw document text for our marker instead.
import { editorLivePreviewField, Menu, normalizePath, TFile } from 'obsidian';

import {
	ImageBlock,
	ImageAlignment,
	ImageCrop,
	SingleImageBlock,
	parseImageBlock,
	singleImageHtml,
} from './html-schema';
import { buildImageToolbarIcon, type ImageIconName } from './icons';
import { CropModal } from './crop-modal';
import { notePotentialNativeImageDrop } from './paste-handler';
import {
	imageSelectionField,
	selectImageBlock,
	deselectImageBlock,
	SelectedImageBlock,
} from './selection';
import type BetterEditPlugin from '../../main';

// ---------------------------------------------------------------------------
// Widget — Placeholder
// ---------------------------------------------------------------------------

class PlaceholderWidget extends WidgetType {
	toDOM(_view: EditorView): HTMLElement {
		const el = createDiv({ cls: 'be-image-placeholder' });
		el.setText('Paste or drop an image here');
		return el;
	}

	eq(_other: PlaceholderWidget): boolean { return true; }

	ignoreEvent(event: Event): boolean {
		return event.type === 'mousedown';
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

		if (this.block.crop) {
			const { crop } = this.block;
			const blockW = parseInt(this.block.width, 10) || 1;
			// aspect-ratio instead of explicit height: max-width:100% then scales
			// width AND height together, preventing oval / extra-crop bugs.
			frame.style.aspectRatio = `${blockW} / ${crop.height}`;
			if (crop.shape === 'circle') frame.addClass('be-circle-crop');
			// Express img size as % of crop-window width so it scales automatically
			// when the frame is constrained — no JS needed during resize.
			const widthPct = (crop.imgWidth / blockW * 100).toFixed(3);
			const mlPct    = (crop.offsetX  / blockW * 100).toFixed(3);
			const mtPct    = (crop.offsetY  / blockW * 100).toFixed(3);
			img.style.cssText = `width: ${widthPct}%; max-width: none; margin-left: -${mlPct}%; margin-top: -${mtPct}%; display: block;`;
			const clipDiv = createDiv({ cls: 'be-image-crop-clip' });
			clipDiv.appendChild(img);
			frame.appendChild(clipDiv);
		} else {
			img.style.cssText = 'width: 100%; max-width: 100%; display: block;';
			frame.appendChild(img);
		}

		if (this.block.caption) {
			frame.appendChild(this.buildCaption(view));
		}

		frame.appendChild(this.buildResizeHandle(view, frame, img));
		frame.appendChild(this.buildToolbar(view));
		wrapper.appendChild(frame);
		return wrapper;
	}

	private buildCaption(view: EditorView): HTMLElement {
		const caption = createEl('figcaption', {
			cls: 'be-image-caption',
			attr: { contenteditable: 'plaintext-only' },
		});
		caption.textContent = this.block.caption ?? '';

		this.plugin.registerDomEvent(caption, 'mousedown', (e: MouseEvent) => e.stopPropagation());
		this.plugin.registerDomEvent(caption, 'click',     (e: MouseEvent) => e.stopPropagation());

		this.plugin.registerDomEvent(caption, 'keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter')  { e.preventDefault(); caption.blur(); }
			if (e.key === 'Escape') { caption.textContent = this.block.caption ?? ''; caption.blur(); }
		});

		this.plugin.registerDomEvent(caption, 'blur', () => {
			const text = (caption.textContent ?? '').trim();
			if (text === (this.block.caption ?? '').trim()) return;
			this.updateBlock(view, { caption: text || undefined });
		});

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

	private buildToolbar(view: EditorView): HTMLElement {
		const bar = createDiv({ cls: 'be-image-toolbar' });

		if (this.isCompactToolbar()) {
			// ── Compact: single "More" button opens native Obsidian menu ────────
			const moreBtn = createToolbarButton(this.plugin, 'more', 'More');
			this.plugin.registerDomEvent(moreBtn, 'click', (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				this.showContextMenu(e, view);
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
			if (this.block.caption) captionBtn.addClass('is-active');
			this.plugin.registerDomEvent(captionBtn, 'click', (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				this.updateBlock(view, { caption: this.block.caption ? undefined : 'Caption' });
			});
			bar.appendChild(captionBtn);

			const cropBtn = createToolbarButton(this.plugin, 'crop', 'Crop');
			this.plugin.registerDomEvent(cropBtn, 'click', (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				this.openCropModal(view);
			});
			bar.appendChild(cropBtn);
		}

		return bar;
	}

	private showContextMenu(e: MouseEvent, view: EditorView): void {
		const menu = new Menu();

		const alignItems: Array<{ title: string; value: ImageAlignment }> = [
			{ title: 'Align left',   value: 'left'   },
			{ title: 'Align center', value: 'center' },
			{ title: 'Align right',  value: 'right'  },
		];

		for (const { title, value } of alignItems) {
			menu.addItem(item => {
				item.setTitle(title);
				if (this.block.alignment === value) item.setChecked(true);
				item.onClick(() => {
					this.updateBlock(view, { alignment: value });
				});
			});
		}

		menu.addSeparator();

		menu.addItem(item => {
			item.setTitle(this.block.caption ? 'Remove caption' : 'Add caption');
			if (this.block.caption) item.setChecked(true);
			item.onClick(() => {
				this.updateBlock(view, { caption: this.block.caption ? undefined : 'Caption' });
			});
		});

		menu.addItem(item => {
			item.setTitle('Crop');
			item.onClick(() => this.openCropModal(view));
		});

		menu.showAtMouseEvent(e);
	}

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------

	private resolveImageSrc(src: string): string {
		const rawSrc = src.trim();
		if (/^(https?:|app:|file:|data:|blob:)/.test(rawSrc)) return rawSrc;

		const sourceFile = this.plugin.app.workspace.getActiveFile();
		const sourcePath = sourceFile?.path ?? '';
		const decodedSrc = decodeImageSrc(rawSrc);
		const normalizedSrc = normalizePath(decodedSrc.replace(/^\/+/, ''));
		const directFile = this.plugin.app.vault.getFileByPath(normalizedSrc);
		if (directFile instanceof TFile) return this.plugin.app.vault.getResourcePath(directFile);

		const linkedFile = this.plugin.app.metadataCache.getFirstLinkpathDest(decodedSrc, sourcePath);
		if (linkedFile instanceof TFile) return this.plugin.app.vault.getResourcePath(linkedFile);

		return src;
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
		return !Number.isNaN(px) && px < 220;
	}

	private computeMinResizeWidth(frameEl: HTMLElement, imgEl: HTMLImageElement): number {
		const minWidth = Math.max(1, this.plugin.settings.minImageWidthPx);
		const minHeight = Math.max(1, this.plugin.settings.minImageHeightPx);

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

	private updateBlock(view: EditorView, patch: Partial<SingleImageBlock>): void {
		const next: SingleImageBlock = { ...this.block, ...patch };
		view.dispatch({
			changes: {
				from: this.from,
				to: this.to,
				insert: singleImageHtml(next.src, next.width, next.alignment, next.caption, next.crop),
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

function createToolbarButton(plugin: BetterEditPlugin, icon: ImageIconName, title: string): HTMLButtonElement {
	const btn = createEl('button', {
		cls: 'be-toolbar-btn',
		attr: {
			'aria-label': title,
			type: 'button',
		},
	});
	btn.appendChild(buildImageToolbarIcon(activeDocument, icon));
	attachToolbarTooltip(plugin, btn, title);
	return btn;
}

function attachToolbarTooltip(plugin: BetterEditPlugin, btn: HTMLButtonElement, title: string): void {
	const show = (): void => {
		const tooltip = ensureToolbarTooltip();
		tooltip.textContent = title;
		const rect = btn.getBoundingClientRect();
		const top = Math.max(8, rect.top - 10);
		tooltip.style.left = `${rect.left + rect.width / 2}px`;
		tooltip.style.top = `${top}px`;
		tooltip.classList.add('is-visible');
	};

	const hide = (): void => {
		const tooltip = activeDocument.body.querySelector<HTMLElement>('.be-toolbar-tooltip');
		tooltip?.classList.remove('is-visible');
	};

	plugin.registerDomEvent(btn, 'mouseenter', show);
	plugin.registerDomEvent(btn, 'mouseleave', hide);
	plugin.registerDomEvent(btn, 'focus', show);
	plugin.registerDomEvent(btn, 'blur', hide);
	plugin.registerDomEvent(btn, 'mousedown', hide);
}

function ensureToolbarTooltip(): HTMLElement {
	let tooltip = activeDocument.body.querySelector<HTMLElement>('.be-toolbar-tooltip');
	if (tooltip) return tooltip;

	tooltip = createDiv({ cls: 'be-toolbar-tooltip' });
	activeDocument.body.appendChild(tooltip);
	return tooltip;
}

function decodeImageSrc(src: string): string {
	try {
		return decodeURIComponent(src);
	} catch {
		return src;
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
	if (!state.field(editorLivePreviewField, false)) {
		return Decoration.none;
	}

	const decorations: Range<Decoration>[] = [];
	const fullText = state.doc.toString();
	const OPEN_MARKER = '<div data-better-edit-image=';
	const CLOSE_TAG   = '</div>';
	let searchFrom = 0;

	while (true) {
		const openIdx = fullText.indexOf(OPEN_MARKER, searchFrom);
		if (openIdx === -1) break;

		const closeIdx = fullText.indexOf(CLOSE_TAG, openIdx);
		if (closeIdx === -1) break;

		const blockEnd = closeIdx + CLOSE_TAG.length;
		const rawHtml  = fullText.slice(openIdx, blockEnd);
		const block    = parseImageBlock(rawHtml);
		if (!block) { searchFrom = blockEnd; continue; }

		let widget: WidgetType;
		if (block.kind === 'placeholder') {
			widget = new PlaceholderWidget();
		} else {
			const isSelected = selection !== null && selection.from === openIdx;
			widget = new ImageWidget(block, rawHtml, plugin, openIdx, blockEnd, isSelected);
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
			if (tr.docChanged || tr.selection || selChanged || modeChanged) {
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
						if (!plugin.settings.imageArrangementEnabled) return;
						if (!plugin.settings.handleDroppedImages) return;
						notePotentialNativeImageDrop();
					}, { capture: true });

					plugin.registerDomEvent(view.dom, 'mousedown', (event: MouseEvent) => {
						const target = event.target;
					if (!(target instanceof Element)) return;
					if (target.closest('.be-resize-handle, .be-image-toolbar, .be-image-caption')) return;

					const hitWidget = target.closest<HTMLElement>('[data-be-from]');
					if (hitWidget) {
						const from = parseInt(hitWidget.dataset.beFrom ?? '', 10);
						const to   = parseInt(hitWidget.dataset.beTo   ?? '', 10);
						if (isNaN(from) || isNaN(to)) return;

						if (!target.closest('.be-resize-handle, .be-toolbar-btn, .be-image-caption')) {
							event.preventDefault();
						}
						view.dispatch({
							selection: { anchor: from },
							effects: selectImageBlock.of({ from, to }),
						});
						view.focus();
					} else if (!target.closest('.be-image-widget')) {
						view.dispatch({ effects: deselectImageBlock.of(null) });
					}
				}, { capture: true });
			}
			},
		);
	}
