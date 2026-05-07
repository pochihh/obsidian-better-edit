/**
 * widget.ts
 *
 * CM6 ViewPlugin that replaces image HTML blocks with interactive widgets
 * in Live Preview mode.
 *
 * Placeholder widget: dashed border, "Paste or drop an image here".
 * Filled image widget: renders the image with an alignment toolbar on hover.
 *   All interactions rewrite the underlying HTML in the document.
 */

import {
	ViewPlugin,
	Decoration,
	DecorationSet,
	EditorView,
	ViewUpdate,
	WidgetType,
} from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { Extension, Range } from '@codemirror/state';
import { editorLivePreviewField } from 'obsidian';

import {
	ImageBlock,
	ImageAlignment,
	parseImageBlock,
	isImageBlock,
	singleImageHtml,
} from './html-schema';
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

	eq(_other: PlaceholderWidget): boolean {
		return true; // all placeholders are visually identical
	}

	ignoreEvent(_event: Event): boolean {
		return false; // let the paste/drop handlers deal with it
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

	constructor(
		block: ImageBlock & { kind: 'single' },
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
		const wrapper = createDiv({
			attr: {
				'data-better-edit': 'image-widget',
				style: 'position: relative; display: inline-block; max-width: 100%;',
			},
		});

		const img = createEl('img', {
			attr: {
				src: this.resolveImageSrc(this.block.src),
				style: [
					`width: ${this.block.width}`,
					'display: block',
					this.marginForAlignment(this.block.alignment),
					'max-width: 100%',
				].filter(Boolean).join('; '),
				draggable: 'false',
			},
		});

		wrapper.appendChild(img);

		if (this.block.caption) {
			const caption = createEl('p', {
				attr: {
					style: 'font-size: 0.85em; color: #888; margin: 4px 0 0; text-align: center;',
				},
			});
			caption.setText(this.block.caption);
			wrapper.appendChild(caption);
		}

		// Alignment toolbar — hidden until hover
		const toolbar = this.buildToolbar(view);
		toolbar.setCssProps({ display: 'none' });
		wrapper.appendChild(toolbar);

		this.plugin.registerDomEvent(wrapper, 'mouseenter', () => {
			toolbar.setCssProps({ display: 'flex' });
		});
		this.plugin.registerDomEvent(wrapper, 'mouseleave', () => {
			toolbar.setCssProps({ display: 'none' });
		});

		return wrapper;
	}

	private resolveImageSrc(src: string): string {
		// If it's already a full URL or app:// URI, return as-is
		if (src.startsWith('http') || src.startsWith('app://')) return src;
		// Otherwise resolve via the vault adapter
		const adapter = this.plugin.app.vault.adapter as { getResourcePath?: (p: string) => string };
		if (adapter.getResourcePath) return adapter.getResourcePath(src);
		return src;
	}

	private marginForAlignment(alignment: ImageAlignment): string {
		switch (alignment) {
			case 'left':       return 'margin: 0 auto 0 0';
			case 'center':     return 'margin: 0 auto';
			case 'right':      return 'margin: 0 0 0 auto';
			case 'float-left': return 'float: left; margin: 0 16px 12px 0';
			case 'float-right': return 'float: right; margin: 0 0 12px 16px';
		}
	}

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
				this.updateAlignment(view, value);
			});

			bar.appendChild(btn);
		}

		return bar;
	}

	private updateAlignment(view: EditorView, alignment: ImageAlignment): void {
		const newHtml = singleImageHtml(
			this.block.src,
			this.block.width,
			alignment,
			this.block.caption,
		);
		view.dispatch({
			changes: { from: this.from, to: this.to, insert: newHtml },
		});
	}

	eq(other: ImageWidget): boolean {
		return (
			this.rawHtml === other.rawHtml &&
			this.from === other.from &&
			this.to === other.to
		);
	}

	ignoreEvent(_event: Event): boolean {
		return false;
	}
}

// ---------------------------------------------------------------------------
// ViewPlugin — scans the document for image HTML blocks and replaces them
// ---------------------------------------------------------------------------

function buildDecorations(view: EditorView, plugin: BetterEditPlugin): DecorationSet {
	// Only decorate in Live Preview mode
	if (!view.state.field(editorLivePreviewField)) {
		return Decoration.none;
	}

	const decorations: Range<Decoration>[] = [];
	const doc = view.state.doc;

	syntaxTree(view.state).iterate({
		enter(node) {
			// Lezer node type for an HTML block is "HtmlBlock"
			if (node.name !== 'HtmlBlock') return;

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
				widget = new ImageWidget(block, rawHtml, plugin, from, to);
			}

			decorations.push(
				Decoration.replace({
					widget,
					block: true,
				}).range(from, to),
			);
		},
	});

	// Sort is required by CM6
	decorations.sort((a, b) => a.from - b.from);

	return Decoration.set(decorations);
}

// ---------------------------------------------------------------------------
// Extension factory — exported and consumed by index.ts
// ---------------------------------------------------------------------------

export function createImageWidgetExtension(plugin: BetterEditPlugin): Extension {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = buildDecorations(view, plugin);
			}

			update(update: ViewUpdate) {
				if (
					update.docChanged ||
					update.viewportChanged ||
					update.startState.field(editorLivePreviewField) !==
						update.state.field(editorLivePreviewField)
				) {
					this.decorations = buildDecorations(update.view, plugin);
				}
			}
		},
		{
			decorations: instance => instance.decorations,
		},
	);
}
