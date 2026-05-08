/**
 * widget.ts
 *
 * CM6 ViewPlugin that replaces image HTML blocks with interactive widgets in
 * Live Preview mode.
 *
 * Placeholder widget: dashed border, "Paste or drop an image here".
 *
 * Filled image widget:
 *   - Click → selected state (blue ring, keyboard ops)
 *   - Hover → right-edge resize handle + alignment toolbar (via CSS classes)
 *   - ignoreEvent(mousedown) + stopPropagation → cursor never enters the block
 */

import {
	ViewPlugin,
	Decoration,
	DecorationSet,
	EditorView,
	ViewUpdate,
	WidgetType,
} from '@codemirror/view';
import { Extension, Range } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { editorLivePreviewField } from 'obsidian';

import {
	ImageBlock,
	ImageAlignment,
	parseImageBlock,
	isImageBlock,
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
		const el = createDiv({ cls: 'better-edit-image-placeholder' });
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
		const wrapper = createDiv({ cls: 'better-edit-image-widget' });

		// Alignment via CSS classes
		const alignClass = this.cssClassForAlignment(this.block.alignment);
		wrapper.addClass(alignClass);

		// Selection ring via CSS class
		if (this.selected) wrapper.addClass('is-selected');

		// Image
		const imgSrc = this.resolveImageSrc(this.block.src);
		const imgStyle = this.block.caption
			? 'width: 100%; max-width: 100%;'
			: `width: ${this.block.width}; max-width: 100%;`;

		const img = createEl('img', {
			attr: { src: imgSrc, style: imgStyle, draggable: 'false' },
		});
		wrapper.appendChild(img);

		// Caption
		if (this.block.caption) {
			const caption = createEl('p', {
				attr: { style: 'font-size: 0.85em; color: #888; margin: 4px 0 0;' },
			});
			caption.setText(this.block.caption);
			wrapper.appendChild(caption);
		}

		// Resize handle (CSS shows it on hover via .better-edit-image-widget:hover)
		wrapper.appendChild(this.buildResizeHandle(view, img));

		// Alignment toolbar (same hover mechanism)
		wrapper.appendChild(this.buildToolbar(view));

		// Click/selection is handled by EditorView.domEventHandlers in index.ts,
		// which intercepts mousedown inside CM6's own event pipeline (before cursor positioning).

		return wrapper;
	}

	// ---------------------------------------------------------------------------
	// Resize handle
	// ---------------------------------------------------------------------------

	private buildResizeHandle(view: EditorView, imgEl: HTMLImageElement): HTMLElement {
		const handle = createDiv({ cls: 'better-edit-resize-handle' });
		handle.appendChild(createDiv({ cls: 'better-edit-resize-grip' }));

		this.plugin.registerDomEvent(handle, 'mousedown', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();

			const startX = e.clientX;
			const startWidth = imgEl.offsetWidth || parseInt(this.block.width, 10) || 320;

			// Transient drag handlers — removed on mouseup, no leak
			const onMove = (moveEvt: MouseEvent) => {
				const newWidth = Math.max(80, startWidth + moveEvt.clientX - startX);
				imgEl.style.width = `${newWidth}px`;
			};

			const onUp = (upEvt: MouseEvent) => {
				activeDocument.removeEventListener('mousemove', onMove);
				activeDocument.removeEventListener('mouseup', onUp);
				const newWidth = Math.max(80, startWidth + upEvt.clientX - startX);
				view.dispatch({
					changes: {
						from: this.from,
						to: this.to,
						insert: singleImageHtml(this.block.src, `${newWidth}px`, this.block.alignment, this.block.caption),
					},
				});
			};

			activeDocument.addEventListener('mousemove', onMove);
			activeDocument.addEventListener('mouseup', onUp);
		});

		return handle;
	}

	// ---------------------------------------------------------------------------
	// Alignment toolbar
	// ---------------------------------------------------------------------------

	private buildToolbar(view: EditorView): HTMLElement {
		const bar = createDiv({ cls: 'better-edit-image-toolbar' });

		const alignments: Array<{ label: string; value: ImageAlignment; title: string }> = [
			{ label: '⬅', value: 'left',        title: 'Align left' },
			{ label: '⬛', value: 'center',      title: 'Align center' },
			{ label: '➡', value: 'right',        title: 'Align right' },
			{ label: '↙', value: 'float-left',  title: 'Float left' },
			{ label: '↘', value: 'float-right', title: 'Float right' },
		];

		for (const { label, value, title } of alignments) {
			const btn = createEl('button', { cls: 'better-edit-toolbar-btn', attr: { title } });
			if (value === this.block.alignment) btn.addClass('is-active');
			btn.setText(label);

			this.plugin.registerDomEvent(btn, 'click', (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				view.dispatch({
					changes: {
						from: this.from,
						to: this.to,
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
		if (src.startsWith('http') || src.startsWith('app://')) return src;
		const adapter = this.plugin.app.vault.adapter as { getResourcePath?: (p: string) => string };
		if (adapter.getResourcePath) return adapter.getResourcePath(src);
		return src;
	}

	private cssClassForAlignment(alignment: ImageAlignment): string {
		switch (alignment) {
			case 'left':        return 'is-align-left';
			case 'right':       return 'is-align-right';
			case 'float-left':  return 'is-float-left';
			case 'float-right': return 'is-float-right';
			case 'center':
			default:            return 'is-align-center';
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

// ---------------------------------------------------------------------------
// ViewPlugin
// ---------------------------------------------------------------------------

function buildDecorations(
	view: EditorView,
	plugin: BetterEditPlugin,
	selection: SelectedImageBlock | null,
): DecorationSet {
	if (!view.state.field(editorLivePreviewField)) {
		return Decoration.none;
	}

	const decorations: Range<Decoration>[] = [];
	const doc = view.state.doc;

	syntaxTree(view.state).iterate({
		enter(node) {
			if (node.name !== 'HTMLBlock') return;

			const from = node.from;
			const to = node.to;
			const rawHtml = doc.sliceString(from, to).trim();

			if (!isImageBlock(rawHtml)) return;

			const block = parseImageBlock(rawHtml);
			if (!block) return;

			let widget: WidgetType;
			if (block.kind === 'placeholder') {
				widget = new PlaceholderWidget();
			} else {
				const isSelected = selection !== null && selection.from === from;
				widget = new ImageWidget(block, rawHtml, plugin, from, to, isSelected);
			}

			decorations.push(
				Decoration.replace({ widget, block: true }).range(from, to),
			);
		},
	});

	decorations.sort((a, b) => a.from - b.from);
	return Decoration.set(decorations);
}

export function createImageWidgetExtension(plugin: BetterEditPlugin): Extension {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				const selection = view.state.field(imageSelectionField);
				this.decorations = buildDecorations(view, plugin, selection);

				// Capture-phase mousedown: fires before Obsidian's own source-reveal handler.
				// stopImmediatePropagation prevents ALL subsequent handlers (capture + bubble).
				plugin.registerDomEvent(view.dom, 'mousedown', (e: MouseEvent) => {
					const target = e.target as Element;
					const widget = target.closest<HTMLElement>('[data-be-from]');

					if (widget) {
						e.preventDefault();
						e.stopImmediatePropagation();

						const from = parseInt(widget.dataset.beFrom ?? '', 10);
						const to   = parseInt(widget.dataset.beTo   ?? '', 10);
						if (isNaN(from) || isNaN(to)) return;

						// Cursor one char past the block — safely outside the HTML range
						const safePos = Math.min(to + 1, view.state.doc.length);
						view.dispatch({
							selection: { anchor: safePos },
							effects: selectImageBlock.of({ from, to }),
						});
					} else if (!target.closest('.better-edit-image-widget')) {
						view.dispatch({ effects: deselectImageBlock.of(null) });
					}
				}, { capture: true }); // capture = runs before Obsidian's handlers
			}

			update(update: ViewUpdate) {
				const selectionChanged =
					update.state.field(imageSelectionField) !==
					update.startState.field(imageSelectionField);

				if (
					update.docChanged ||
					update.viewportChanged ||
					selectionChanged ||
					update.startState.field(editorLivePreviewField) !==
						update.state.field(editorLivePreviewField)
				) {
					this.decorations = buildDecorations(update.view, plugin, update.state.field(imageSelectionField));
				}
			}
		},
		{ decorations: instance => instance.decorations },
	);
}
