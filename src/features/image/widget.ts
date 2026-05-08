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
	parseImageBlock,
	singleImageHtml,
} from './html-schema';
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
		// Outer wrapper: full-width, controls alignment, holds data attributes for click detection
		const wrapper = createDiv({ cls: 'be-image-widget' });
		wrapper.setAttribute('data-be-from', String(this.from));
		wrapper.setAttribute('data-be-to',   String(this.to));
		wrapper.addClass(this.cssClassForAlignment(this.block.alignment));

		// Inner frame: shrinks to image width → correct position context for handle + toolbar
		const frame = createDiv({ cls: 'be-image-frame' });
		frame.style.width = this.block.width;
		if (this.selected) frame.addClass('is-selected');

		// Image
		const imgSrc = this.resolveImageSrc(this.block.src);
		const img = createEl('img', {
			attr: {
				src:       imgSrc,
				style:     'width: 100%; max-width: 100%; display: block;',
				draggable: 'false',
			},
		});
		frame.appendChild(img);

		// Caption
		if (this.block.caption) {
			const caption = createEl('figcaption', { cls: 'be-image-caption' });
			caption.setText(this.block.caption);
			frame.appendChild(caption);
		}

		frame.appendChild(this.buildResizeHandle(view, frame));
		frame.appendChild(this.buildToolbar(view));
		wrapper.appendChild(frame);
		return wrapper;
	}

	// ---------------------------------------------------------------------------
	// Resize handle — Notion-style pill, anchored to right edge of frame
	// ---------------------------------------------------------------------------

	private buildResizeHandle(view: EditorView, frameEl: HTMLElement): HTMLElement {
		const handle = createDiv({ cls: 'be-resize-handle' });
		handle.appendChild(createDiv({ cls: 'be-resize-grip' }));

		this.plugin.registerDomEvent(handle, 'mousedown', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();

			const startX = e.clientX;
			const startWidth = frameEl.offsetWidth || parseInt(this.block.width, 10) || 320;
			frameEl.addClass('is-resizing');

			const onMove = (moveEvt: MouseEvent) => {
				const w = Math.max(80, startWidth + moveEvt.clientX - startX);
				frameEl.style.width = `${w}px`;
			};

			const onUp = (upEvt: MouseEvent) => {
				activeDocument.removeEventListener('mousemove', onMove);
				activeDocument.removeEventListener('mouseup', onUp);
				frameEl.removeClass('is-resizing');
				const w = Math.max(80, startWidth + upEvt.clientX - startX);
				frameEl.style.width = `${w}px`;
				view.dispatch({
					changes: {
						from: this.from,
						to:   this.to,
						insert: singleImageHtml(this.block.src, `${w}px`, this.block.alignment, this.block.caption),
					},
				});
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
			const alignments: Array<{ icon: string; value: ImageAlignment; title: string }> = [
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
					view.dispatch({
						changes: {
							from: this.from,
							to:   this.to,
							insert: singleImageHtml(this.block.src, this.block.width, value, this.block.caption),
						},
					});
				});
				bar.appendChild(btn);
			}

			bar.appendChild(createDiv({ cls: 'be-toolbar-sep' }));

			const captionBtn = createToolbarButton(this.plugin, 'caption', 'Caption');
			if (this.block.caption) captionBtn.addClass('is-active');
			this.plugin.registerDomEvent(captionBtn, 'click', (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				view.dispatch({
					changes: {
						from: this.from,
						to:   this.to,
						insert: singleImageHtml(this.block.src, this.block.width, this.block.alignment, this.block.caption ? undefined : 'Caption'),
					},
				});
			});
			bar.appendChild(captionBtn);

			const cropBtn = createToolbarButton(this.plugin, 'crop', 'Crop');
			this.plugin.registerDomEvent(cropBtn, 'click', (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
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
					view.dispatch({
						changes: {
							from: this.from,
							to:   this.to,
							insert: singleImageHtml(this.block.src, this.block.width, value, this.block.caption),
						},
					});
				});
			});
		}

		menu.addSeparator();

		menu.addItem(item => {
			item.setTitle(this.block.caption ? 'Remove caption' : 'Add caption');
			if (this.block.caption) item.setChecked(true);
			item.onClick(() => {
				view.dispatch({
					changes: {
						from: this.from,
						to:   this.to,
						insert: singleImageHtml(this.block.src, this.block.width, this.block.alignment, this.block.caption ? undefined : 'Caption'),
					},
				});
			});
		});

		menu.addItem(item => {
			item.setTitle('Crop');
			item.onClick(() => { /* stub */ });
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

function createToolbarButton(plugin: BetterEditPlugin, icon: string, title: string): HTMLButtonElement {
	const btn = createEl('button', {
		cls: 'be-toolbar-btn',
		attr: {
			'aria-label': title,
			type: 'button',
		},
	});
	btn.appendChild(buildToolbarIcon(icon));
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


function buildToolbarIcon(kind: string): SVGElement {
	const ns = 'http://www.w3.org/2000/svg';
	const svg = activeDocument.createElementNS(ns, 'svg');
	svg.setAttribute('aria-hidden', 'true');
	svg.setAttribute('width', '16');
	svg.setAttribute('height', '16');
	svg.setAttribute('fill', 'currentColor');
	svg.addClass('be-toolbar-icon');

	const addPath = (d: string): void => {
		const el = activeDocument.createElementNS(ns, 'path');
		el.setAttribute('d', d);
		svg.appendChild(el);
	};

	const fillIcon = (viewBox: string, d: string): void => {
		svg.setAttribute('viewBox', viewBox);
		addPath(d);
	};

	switch (kind) {
		// ── Notion icons (exact paths from Notion source) ─────────────────────
		case 'caption':
			svg.setAttribute('viewBox', '2.87 0 10.97 16');
			addPath('M4.75 2.125c-1.036 0-1.875.84-1.875 1.875v3.5c0 1.036.84 1.875 1.875 1.875h5.5c1.036 0 1.875-.84 1.875-1.875V4c0-1.036-.84-1.875-1.875-1.875zM4.125 4c0-.345.28-.625.625-.625h5.5c.345 0 .625.28.625.625v3.5c0 .345-.28.625-.625.625h-5.5a.625.625 0 0 1-.625-.625zM3.5 10.375a.625.625 0 1 0 0 1.25h9.72a.625.625 0 1 0 0-1.25zm0 2.25a.625.625 0 1 0 0 1.25h6.84a.625.625 0 1 0 0-1.25z');
			break;
		case 'crop':
			svg.setAttribute('viewBox', '0 0 16 16');
			addPath('M4.625 1.6a.625.625 0 0 0-1.25 0v1.775H1.6a.625.625 0 1 0 0 1.25h1.775V10.8c0 1.008.817 1.825 1.825 1.825h6.175V14.4a.625.625 0 1 0 1.25 0v-1.775H14.4a.625.625 0 1 0 0-1.25h-1.775V5.2A1.825 1.825 0 0 0 10.8 3.375H4.625zm0 3.025H10.8c.318 0 .575.258.575.575v6.175H5.2a.575.575 0 0 1-.575-.575z');
			break;
		case 'more':
			svg.setAttribute('viewBox', '1.92 0 12.16 16');
			addPath('M3.2 6.725a1.275 1.275 0 1 0 0 2.55 1.275 1.275 0 0 0 0-2.55m4.8 0a1.275 1.275 0 1 0 0 2.55 1.275 1.275 0 0 0 0-2.55m4.8 0a1.275 1.275 0 1 0 0 2.55 1.275 1.275 0 0 0 0-2.55');
			break;

		// ── Alignment icons (Notion-style, derived from align-center source) ──
		case 'align-left':
			fillIcon('1.77 0 12.45 16',
				'M2.4 2.175a.625.625 0 1 0 0 1.25h11.2a.625.625 0 1 0 0-1.25zm1.2 2A1.825 1.825 0 0 0 1.775 6v4c0 1.008.817 1.825 1.825 1.825H8A1.825 1.825 0 0 0 9.825 10V6A1.825 1.825 0 0 0 8 4.175zM3.025 6c0-.318.258-.575.575-.575H8c.318 0 .575.257.575.575v4a.575.575 0 0 1-.575.575H3.6A.575.575 0 0 1 3.025 10zM2.4 12.575a.625.625 0 1 0 0 1.25h11.2a.625.625 0 1 0 0-1.25z',
			);
			break;
		case 'align-center':
			// Exact path from Notion source
			fillIcon('1.77 0 12.45 16',
				'M2.4 2.175a.625.625 0 1 0 0 1.25h11.2a.625.625 0 1 0 0-1.25zm3.4 2h4.4c1.008 0 1.825.817 1.825 1.825v4a1.825 1.825 0 0 1-1.825 1.825H5.8A1.825 1.825 0 0 1 3.975 10V6c0-1.008.817-1.825 1.825-1.825M5.225 6v4c0 .318.258.575.575.575h4.4a.575.575 0 0 0 .575-.575V6a.575.575 0 0 0-.575-.575H5.8A.575.575 0 0 0 5.225 6M2.4 12.575a.625.625 0 1 0 0 1.25h11.2a.625.625 0 1 0 0-1.25z',
			);
			break;
		case 'align-right':
			fillIcon('1.77 0 12.45 16',
				'M2.4 2.175a.625.625 0 1 0 0 1.25h11.2a.625.625 0 1 0 0-1.25zm5.6 2A1.825 1.825 0 0 0 6.175 6v4c0 1.008.817 1.825 1.825 1.825h4.4A1.825 1.825 0 0 0 14.225 10V6A1.825 1.825 0 0 0 12.4 4.175zM7.425 6c0-.318.257-.575.575-.575h4.4c.318 0 .575.257.575.575v4a.575.575 0 0 1-.575.575H8A.575.575 0 0 1 7.425 10zM2.4 12.575a.625.625 0 1 0 0 1.25h11.2a.625.625 0 1 0 0-1.25z',
			);
			break;
		case 'align-float-left':
			fillIcon('0 0 16 16',
				'M1 2h5.5v6H1zM8 3h7v1.25H8zM8 5.25h6v1.25H8zM8 7.5h5v1.25H8zM1 10h14v1.25H1zM1 12.5h12v1.25H1z',
			);
			break;
		case 'align-float-right':
			fillIcon('0 0 16 16',
				'M9.5 2H15v6H9.5zM1 3h7v1.25H1zM1 5.25h6v1.25H1zM1 7.5h5v1.25H1zM1 10h14v1.25H1zM3 12.5h12v1.25H3z',
			);
			break;
	}

	return svg;
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
	if (!state.field(editorLivePreviewField)) {
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
			return buildDecorations(state, plugin, state.field(imageSelectionField));
		},
		update(decos, tr) {
			const selChanged  = tr.state.field(imageSelectionField) !== tr.startState.field(imageSelectionField);
			const modeChanged = tr.state.field(editorLivePreviewField) !== tr.startState.field(editorLivePreviewField);
			if (tr.docChanged || tr.selection || selChanged || modeChanged) {
				return buildDecorations(tr.state, plugin, tr.state.field(imageSelectionField));
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
				plugin.registerDomEvent(view.dom, 'mousedown', (event: MouseEvent) => {
					const target = event.target;
					if (!(target instanceof Element)) return;
					if (target.closest('.be-resize-handle, .be-image-toolbar, .be-toolbar-popover')) return;

					const hitWidget = target.closest<HTMLElement>('[data-be-from]');
					if (hitWidget) {
						const from = parseInt(hitWidget.dataset.beFrom ?? '', 10);
						const to   = parseInt(hitWidget.dataset.beTo   ?? '', 10);
						if (isNaN(from) || isNaN(to)) return;

						if (!target.closest('.be-resize-handle, .be-toolbar-btn')) {
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
