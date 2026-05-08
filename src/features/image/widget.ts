/**
 * widget.ts
 *
 * CM6 ViewPlugin that replaces image HTML blocks with interactive widgets in
 * Live Preview mode.
 *
 * Placeholder widget: dashed border, "Paste or drop an image here".
 *
 * Filled image widget:
 *   - Renders the image with correct alignment
 *   - Click → selected state (blue ring, keyboard ops enabled)
 *   - Hover → right-edge resize handle + alignment toolbar
 *   - ignoreEvent(mousedown) = true → CM6 never places cursor inside the block
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
		const el = createDiv({
			attr: {
				'data-better-edit': 'image-placeholder',
				style: [
					'border: 2px dashed #ccc',
					'border-radius: 4px',
					'padding: 32px 16px',
					'text-align: center',
					'color: #999',
					'font-size: 0.9em',
					'min-height: 80px',
					'cursor: pointer',
					'user-select: none',
				].join('; '),
			},
		});
		el.setText('Paste or drop an image here');
		return el;
	}

	eq(_other: PlaceholderWidget): boolean { return true; }

	ignoreEvent(event: Event): boolean {
		// Prevent CM6 from placing the cursor inside the HTML block
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
		const outerStyle = this.outerStyleForAlignment(this.block.alignment);

		// Selection ring via outline when selected
		const ringStyle = this.selected
			? 'outline: 2px solid var(--interactive-accent); border-radius: 2px;'
			: '';

		const wrapper = createDiv({
			attr: {
				'data-better-edit': 'image-widget',
				style: `position: relative; display: inline-block; ${outerStyle} ${ringStyle}`,
			},
		});

		// Image
		const imgSrc = this.resolveImageSrc(this.block.src);
		const imgStyle = this.block.caption
			? 'width: 100%; max-width: 100%; display: block;'
			: `width: ${this.block.width}; max-width: 100%; display: block;`;

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

		// Resize handle (right edge, shown on hover)
		const resizeHandle = this.buildResizeHandle(view, img);
		resizeHandle.setCssProps({ display: 'none' });
		wrapper.appendChild(resizeHandle);

		// Alignment toolbar (shown on hover)
		const toolbar = this.buildToolbar(view);
		toolbar.setCssProps({ display: 'none' });
		wrapper.appendChild(toolbar);

		// Hover: show resize handle + toolbar
		this.plugin.registerDomEvent(wrapper, 'mouseenter', () => {
			resizeHandle.setCssProps({ display: 'flex' });
			toolbar.setCssProps({ display: 'flex' });
		});
		this.plugin.registerDomEvent(wrapper, 'mouseleave', () => {
			resizeHandle.setCssProps({ display: 'none' });
			toolbar.setCssProps({ display: 'none' });
		});

		// Click: select this block (cursor stays out of the HTML block)
		this.plugin.registerDomEvent(wrapper, 'mousedown', (e: MouseEvent) => {
			e.preventDefault(); // prevent CM6 cursor placement
			view.dispatch({
				effects: selectImageBlock.of({ from: this.from, to: this.to }),
			});
		});

		return wrapper;
	}

	// ---------------------------------------------------------------------------
	// Resize handle
	// ---------------------------------------------------------------------------

	private buildResizeHandle(view: EditorView, imgEl: HTMLImageElement): HTMLElement {
		const handle = createDiv({
			attr: {
				'data-better-edit': 'resize-handle',
				style: [
					'position: absolute',
					'top: 0',
					'right: -5px',
					'width: 10px',
					'height: 100%',
					'cursor: col-resize',
					'display: flex',
					'align-items: center',
					'justify-content: center',
					'z-index: 5',
				].join('; '),
			},
		});

		const grip = createDiv({
			attr: {
				style: [
					'width: 4px',
					'height: 32px',
					'background: var(--interactive-accent)',
					'border-radius: 2px',
					'opacity: 0.8',
				].join('; '),
			},
		});
		handle.appendChild(grip);

		this.plugin.registerDomEvent(handle, 'mousedown', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();

			const startX = e.clientX;
			const startWidth = imgEl.offsetWidth || parseInt(this.block.width, 10) || 320;

			// Transient drag handlers — cleaned up on mouseup, no leak risk
			const onMove = (moveEvt: MouseEvent) => {
				const delta = moveEvt.clientX - startX;
				const newWidth = Math.max(80, startWidth + delta);
				imgEl.style.width = `${newWidth}px`;
			};

			const onUp = (upEvt: MouseEvent) => {
				activeDocument.removeEventListener('mousemove', onMove);
				activeDocument.removeEventListener('mouseup', onUp);

				const delta = upEvt.clientX - startX;
				const newWidth = Math.max(80, startWidth + delta);
				const newHtml = singleImageHtml(
					this.block.src,
					`${newWidth}px`,
					this.block.alignment,
					this.block.caption,
				);
				view.dispatch({
					changes: { from: this.from, to: this.to, insert: newHtml },
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
		const bar = createDiv({
			attr: {
				style: [
					'position: absolute',
					'top: 4px',
					'left: 50%',
					'transform: translateX(-50%)',
					'gap: 2px',
					'background: var(--background-primary)',
					'border: 1px solid var(--background-modifier-border)',
					'border-radius: 4px',
					'padding: 2px 4px',
					'z-index: 10',
					'box-shadow: 0 2px 6px rgba(0,0,0,0.15)',
				].join('; '),
			},
		});

		const alignments: Array<{ label: string; value: ImageAlignment; title: string }> = [
			{ label: '⬅', value: 'left',        title: 'Align left' },
			{ label: '⬛', value: 'center',      title: 'Align center' },
			{ label: '➡', value: 'right',        title: 'Align right' },
			{ label: '↙', value: 'float-left',  title: 'Float left' },
			{ label: '↘', value: 'float-right', title: 'Float right' },
		];

		for (const { label, value, title } of alignments) {
			const isActive = value === this.block.alignment;
			const btn = createEl('button', {
				attr: {
					title,
					style: [
						'background: none',
						'border: none',
						'cursor: pointer',
						'padding: 2px 5px',
						'font-size: 0.9em',
						'border-radius: 3px',
						isActive
							? 'background: var(--interactive-accent); color: var(--text-on-accent);'
							: 'color: var(--text-normal);',
					].join('; '),
				},
			});
			btn.setText(label);

			this.plugin.registerDomEvent(btn, 'click', (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				const newHtml = singleImageHtml(
					this.block.src,
					this.block.width,
					value,
					this.block.caption,
				);
				view.dispatch({
					changes: { from: this.from, to: this.to, insert: newHtml },
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

	private outerStyleForAlignment(alignment: ImageAlignment): string {
		switch (alignment) {
			case 'left':        return 'text-align: left;';
			case 'center':      return 'text-align: center;';
			case 'right':       return 'text-align: right;';
			case 'float-left':  return 'float: left; margin: 0 16px 12px 0;';
			case 'float-right': return 'float: right; margin: 0 0 12px 16px;';
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
		// Return true for mousedown so CM6 doesn't place the cursor inside the HTML block.
		// Our own registerDomEvent('mousedown') handler still fires (native DOM is unaffected).
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

				// Deselect when clicking anywhere outside an image widget
				plugin.registerDomEvent(view.dom, 'mousedown', (e: MouseEvent) => {
					const target = e.target as Element;
					if (!target.closest('[data-better-edit]')) {
						view.dispatch({ effects: deselectImageBlock.of(null) });
					}
				});
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
					const selection = update.state.field(imageSelectionField);
					this.decorations = buildDecorations(update.view, plugin, selection);
				}
			}
		},
		{ decorations: instance => instance.decorations },
	);
}
