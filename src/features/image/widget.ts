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
import { editorLivePreviewField, normalizePath, TFile } from 'obsidian';

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

		frame.appendChild(this.buildResizeHandle(view, img));
		frame.appendChild(this.buildToolbar(view));
		wrapper.appendChild(frame);
		return wrapper;
	}

	// ---------------------------------------------------------------------------
	// Resize handle — Notion-style pill, anchored to right edge of frame
	// ---------------------------------------------------------------------------

	private buildResizeHandle(view: EditorView, imgEl: HTMLImageElement): HTMLElement {
		const handle = createDiv({ cls: 'be-resize-handle' });
		handle.appendChild(createDiv({ cls: 'be-resize-grip' }));

		this.plugin.registerDomEvent(handle, 'mousedown', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();

			const startX    = e.clientX;
			const startWidth = imgEl.offsetWidth || parseInt(this.block.width, 10) || 320;

			const onMove = (moveEvt: MouseEvent) => {
				const w = Math.max(80, startWidth + moveEvt.clientX - startX);
				imgEl.style.width = `${w}px`;
			};

			const onUp = (upEvt: MouseEvent) => {
				activeDocument.removeEventListener('mousemove', onMove);
				activeDocument.removeEventListener('mouseup', onUp);
				const w = Math.max(80, startWidth + upEvt.clientX - startX);
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

		const alignments: Array<{ label: string; value: ImageAlignment; title: string }> = [
			{ label: '⇤',  value: 'left',        title: 'Align left'   },
			{ label: '⊡',  value: 'center',      title: 'Align center' },
			{ label: '⇥',  value: 'right',        title: 'Align right'  },
			{ label: '↰',  value: 'float-left',  title: 'Float left'   },
			{ label: '↱',  value: 'float-right', title: 'Float right'  },
		];

		for (const { label, value, title } of alignments) {
			const btn = createEl('button', { cls: 'be-toolbar-btn', attr: { title } });
			if (value === this.block.alignment) btn.addClass('is-active');
			btn.setText(label);

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

		return bar;
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

		// Must be at the start of a line
		if (openIdx > 0 && fullText[openIdx - 1] !== '\n') {
			searchFrom = openIdx + 1;
			continue;
		}

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

		decorations.push(
			Decoration.replace({ widget, block: true }).range(openIdx, blockEnd),
		);
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
		provide: field => EditorView.decorations.from(field),
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

					const hitWidget = target.closest<HTMLElement>('[data-be-from]');
					if (hitWidget) {
						const from = parseInt(hitWidget.dataset.beFrom ?? '', 10);
						const to   = parseInt(hitWidget.dataset.beTo   ?? '', 10);
						if (isNaN(from) || isNaN(to)) return;

						view.dispatch({ effects: selectImageBlock.of({ from, to }) });
					} else if (!target.closest('.be-image-widget')) {
						view.dispatch({ effects: deselectImageBlock.of(null) });
					}
				}, { capture: true });
			}
		},
	);
}
