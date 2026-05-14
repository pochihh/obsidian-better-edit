import { Extension, Prec, StateEffect, StateEffectType, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, keymap, showTooltip, Tooltip, TooltipView, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import type BetterEditPlugin from '../../main';
import { SlashCommandDefinition, SLASH_CURSOR_TOKEN } from './settings';
import { renderSlashCommandIcon } from '../../icons';

interface SlashMenuState {
	query: string;
	from: number;
	to: number;
	selectedIndex: number;
	items: SlashCommandDefinition[];
}

let slashMenuScrollMemory = 0;

const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;
const MATH_BLOCK_RE = /^\s*\$\$\s*$/;

class EmptyLineHintWidget extends WidgetType {
	toDOM(): HTMLElement {
		return createSpan({ cls: 'be-slash-empty-hint', text: "Press '/' for commands" });
	}

	ignoreEvent(): boolean {
		return true;
	}
}

export function createSlashCommandExtension(plugin: BetterEditPlugin): Extension {
	const moveSelectionEffect = StateEffect.define<number>();
	const setSelectionEffect = StateEffect.define<number>();
	const closeMenuEffect = StateEffect.define<void>();
	let cachedTooltip: Tooltip | null = null;
	let cachedTooltipFrom = -1;

	const slashMenuField = StateField.define<SlashMenuState | null>({
		create(state) {
			return menuStateAtCursor(state, plugin, null);
		},
		update(value, transaction) {
			for (const effect of transaction.effects) {
				if (effect.is(closeMenuEffect)) return null;
			}

			let next = value;
			if (transaction.docChanged || transaction.selection) {
				next = menuStateAtCursor(transaction.state, plugin, value);
			}

			for (const effect of transaction.effects) {
				if (effect.is(moveSelectionEffect) && next !== null && next.items.length > 0) {
					next = {
						...next,
						selectedIndex: clampIndex(next.selectedIndex + effect.value, next.items.length),
					};
				}
				if (effect.is(setSelectionEffect) && next !== null && next.items.length > 0) {
					next = {
						...next,
						selectedIndex: clampIndex(effect.value, next.items.length),
					};
				}
			}
			return next;
		},
		provide: field => showTooltip.from(field, value => {
			if (value === null) {
				cachedTooltip = null;
				cachedTooltipFrom = -1;
				slashMenuScrollMemory = 0;
				return null;
			}
			if (cachedTooltip === null || cachedTooltipFrom !== value.from) {
				cachedTooltip = createSlashTooltip(value.from, field, setSelectionEffect, closeMenuEffect);
				cachedTooltipFrom = value.from;
				slashMenuScrollMemory = 0;
			}
			return cachedTooltip;
		}),
	});

	const insertSlashTrigger = (view: EditorView): boolean => {
		const range = view.state.selection.main;
		if (!plugin.settings.slashCommand.enabled || !range.empty) return false;

		const line = view.state.doc.lineAt(range.head);
		if (line.text.trim().length > 0) return false;
		if (isSuppressedSlashContext(view, line.number)) return false;

		view.dispatch({
			changes: { from: line.from, to: line.to, insert: '/' },
			selection: { anchor: line.from + 1 },
			scrollIntoView: true,
		});
		return true;
	};

	const closeMenu = (view: EditorView): boolean => {
		if (view.state.field(slashMenuField, false) === undefined || view.state.field(slashMenuField) === null) return false;
		view.dispatch({ effects: closeMenuEffect.of() });
		return true;
	};

	const moveSelection = (view: EditorView, delta: number): boolean => {
		const state = view.state.field(slashMenuField, false);
		if (state === undefined || state === null) return false;
		view.dispatch({ effects: moveSelectionEffect.of(delta) });
		return true;
	};

	const acceptSelection = (view: EditorView): boolean => {
		const state = view.state.field(slashMenuField, false);
		if (state === undefined || state === null) return false;
		return selectSlashCommand(view, state, state.selectedIndex, closeMenuEffect);
	};

	return [
		slashMenuField,
		createEmptyLineHintExtension(plugin),
		Prec.highest(EditorView.inputHandler.of((view, _from, _to, text): boolean => {
			if (text !== '/') return false;
			return insertSlashTrigger(view);
		})),
		Prec.highest(keymap.of([
			{
				key: '/',
				preventDefault: true,
				run: insertSlashTrigger,
			},
			{
				key: 'Escape',
				preventDefault: true,
				run: closeMenu,
			},
			{
				key: 'ArrowDown',
				preventDefault: true,
				run: view => moveSelection(view, 1),
			},
			{
				key: 'ArrowUp',
				preventDefault: true,
				run: view => moveSelection(view, -1),
			},
			{
				key: 'Enter',
				preventDefault: true,
				run: acceptSelection,
			},
		])),
	];
}

function createEmptyLineHintExtension(plugin: BetterEditPlugin): Extension {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			private readonly view: EditorView;

			constructor(view: EditorView) {
				this.view = view;
				this.decorations = this.buildDecorations();
			}

			update(update: ViewUpdate): void {
				if (update.docChanged || update.selectionSet || update.viewportChanged || update.focusChanged) {
					this.decorations = this.buildDecorations();
				}
			}

			private buildDecorations(): DecorationSet {
				if (!plugin.settings.slashCommand.enabled) return Decoration.none;
				const range = this.view.state.selection.main;
				if (!range.empty) return Decoration.none;

				const line = this.view.state.doc.lineAt(range.head);
				if (line.text.length > 0) return Decoration.none;
				if (!this.view.hasFocus) return Decoration.none;
				if (isSuppressedSlashContext(this.view, line.number)) return Decoration.none;

				return Decoration.set([
					Decoration.widget({ widget: new EmptyLineHintWidget(), side: 1 }).range(line.from),
				]);
			}
		},
		{
			decorations: value => value.decorations,
		},
	);
}

function menuStateAtCursor(
	state: EditorView['state'],
	plugin: BetterEditPlugin,
	previous: SlashMenuState | null,
): SlashMenuState | null {
	if (!plugin.settings.slashCommand.enabled) return null;

	const range = state.selection.main;
	if (!range.empty) return null;

	const line = state.doc.lineAt(range.head);
	if (isSuppressedSlashStateContext(state, line.number)) return null;

	const beforeCursor = state.doc.sliceString(line.from, range.head);
	const match = /^\/([^/]*)$/.exec(beforeCursor);
	if (match === null) return null;

	const query = match[1] ?? '';
	const items = filteredCommands(plugin, query);
	const selectedIndex = previous?.query === query
		? Math.min(previous.selectedIndex, Math.max(0, items.length - 1))
		: 0;

	return { query, from: line.from, to: line.to, selectedIndex, items };
}

function filteredCommands(plugin: BetterEditPlugin, query: string): SlashCommandDefinition[] {
	const normalizedQuery = query.trim().toLowerCase();
	const enabledCommands = plugin.settings.slashCommand.commands.filter(command => command.enabled);
	if (normalizedQuery.length === 0) return enabledCommands;

	return enabledCommands.filter(command => {
		const searchable = [command.name, ...command.aliases].join(' ').toLowerCase();
		return searchable.includes(normalizedQuery);
	});
}

function isSuppressedSlashContext(view: EditorView, lineNumber: number): boolean {
	if (isSuppressedSlashStateContext(view.state, lineNumber)) return true;

	const lineElement = lineElementForLine(view, lineNumber);
	return lineElement?.matches('.HyperMD-codeblock, .HyperMD-math, .cm-math, .math-block') === true;
}

function isSuppressedSlashStateContext(state: EditorView['state'], lineNumber: number): boolean {
	return isInsideFencedCodeBlock(state, lineNumber) || isInsideMathBlock(state, lineNumber);
}

function isInsideFencedCodeBlock(state: EditorView['state'], lineNumber: number): boolean {
	let openLine: number | null = null;

	for (let n = 1; n <= state.doc.lines; n++) {
		if (!FENCE_RE.test(state.doc.line(n).text)) continue;

		if (openLine === null) {
			openLine = n;
			continue;
		}

		if (lineNumber >= openLine && lineNumber <= n) return true;
		if (n >= lineNumber) return false;
		openLine = null;
	}

	return openLine !== null && lineNumber >= openLine;
}

function isInsideMathBlock(state: EditorView['state'], lineNumber: number): boolean {
	let openLine: number | null = null;

	for (let n = 1; n <= state.doc.lines; n++) {
		if (!MATH_BLOCK_RE.test(state.doc.line(n).text)) continue;

		if (openLine === null) {
			openLine = n;
			continue;
		}

		if (lineNumber >= openLine && lineNumber <= n) return true;
		if (n >= lineNumber) return false;
		openLine = null;
	}

	return openLine !== null && lineNumber >= openLine;
}

function lineElementForLine(view: EditorView, lineNumber: number): Element | null {
	const line = view.state.doc.line(lineNumber);
	const node = view.domAtPos(line.from).node;
	const element = node.instanceOf(Element) ? node : node.parentElement;
	return element?.closest('.cm-line') ?? null;
}

function createSlashTooltip(
	from: number,
	field: StateField<SlashMenuState | null>,
	setSelectionEffect: StateEffectType<number>,
	closeMenuEffect: StateEffectType<void>,
): Tooltip {
	return {
		pos: from,
		above: false,
		strictSide: false,
		clip: false,
		create(view) {
			return new SlashCommandTooltipView(view, field, setSelectionEffect, closeMenuEffect);
		},
	};
}

class SlashCommandTooltipView implements TooltipView {
	readonly dom: HTMLElement;
	private selectedEl: HTMLElement | null = null;
	private readonly menuEl: HTMLElement;
	private readonly listEl: HTMLElement;
	private readonly footerEl: HTMLElement;
	private lastRenderedQuery: string | undefined = undefined;
	private lastSelectedIndex = -1;
	private lastSelectionWasMouse = false;
	private interactionMode: 'keyboard' | 'mouse' = 'keyboard';
	private lastMouseX = -1;
	private lastMouseY = -1;
	private selectedScrollFrame = 0;

	constructor(
		private readonly view: EditorView,
		private readonly field: StateField<SlashMenuState | null>,
		private readonly setSelectionEffect: StateEffectType<number>,
		private readonly closeMenuEffect: StateEffectType<void>,
	) {
		this.dom = createDiv({ cls: 'be-slash-tooltip is-visible' });
		this.menuEl = createDiv({ cls: 'be-slash-menu' });
		this.listEl = this.menuEl.createDiv({ cls: 'be-slash-menu-list' });
		this.footerEl = this.menuEl.createDiv({ cls: 'be-slash-footer' });
		this.dom.appendChild(this.menuEl);
		this.dom.addEventListener('mousedown', e => this.onMouseDown(e));
		this.dom.addEventListener('click', e => this.onClick(e));
		this.dom.addEventListener('mouseleave', () => {
			this.lastMouseX = -1;
			this.lastMouseY = -1;
			this.interactionMode = 'keyboard';
		});
		this.listEl.addEventListener('mousemove', event => this.onListMouseMove(event));
		// Toggle top-fade class while the list is scrolled.
		this.listEl.addEventListener('scroll', () => {
			slashMenuScrollMemory = this.listEl.scrollTop;
			this.menuEl.classList.toggle('is-scrolled', this.listEl.scrollTop > 4);
		}, { passive: true });
		this.listEl.addEventListener('wheel', event => this.onListWheel(event), { passive: false });

		this.render();
	}

	destroy(): void {
		if (this.selectedScrollFrame !== 0) {
			cancelAnimationFrame(this.selectedScrollFrame);
			this.selectedScrollFrame = 0;
		}
	}

	update(): void {
		const state = this.view.state.field(this.field, false);

		if (!state) {
			this.lastRenderedQuery = undefined;
			this.render();
			return;
		}

		// Query (= item list) changed → full re-render.
		if (state.query !== this.lastRenderedQuery) {
			this.render();
			return;
		}

		// Only the selected index changed → patch in place (no DOM rebuild,
		// so the scroll position is never disturbed).
		if (state.selectedIndex !== this.lastSelectedIndex) {
			this.patchSelectedItem(state.selectedIndex);
		}
	}

	mount(): void {
	}

	private render(): void {
		const state = this.view.state.field(this.field, false);
		this.listEl.empty();
		this.footerEl.empty();
		this.menuEl.removeClass('is-visible', 'is-scrolled');
		this.selectedEl = null;
		this.lastRenderedQuery = undefined;
		this.lastSelectedIndex = -1;
		if (state === undefined || state === null) return;

		this.menuEl.addClass('is-visible');
		this.lastRenderedQuery = state.query;
		this.lastSelectedIndex = state.selectedIndex;

		this.listEl.setAttribute('role', 'listbox');

		if (state.items.length === 0) {
			this.listEl.createDiv({ cls: 'be-slash-empty', text: 'No commands' });
		} else {
			this.listEl.createDiv({ cls: 'be-slash-section-title', text: 'Commands' });
			for (const [index, command] of state.items.entries()) {
				const itemEl = this.listEl.createDiv({ cls: 'be-slash-item' });
				itemEl.setAttribute('role', 'option');
				itemEl.setAttribute('tabindex', '-1');
				if (index === state.selectedIndex) {
					itemEl.addClass('is-selected');
					itemEl.setAttribute('aria-selected', 'true');
					this.selectedEl = itemEl;
				}
				itemEl.setAttribute('data-command-index', String(index));
				const iconEl = itemEl.createDiv({ cls: 'be-slash-item-icon' });
				iconEl.setAttribute('aria-hidden', 'true');
				renderCommandIcon(iconEl, command);

				const labelEl = itemEl.createDiv({ cls: 'be-slash-item-label' });
				labelEl.createDiv({ cls: 'be-slash-item-name', text: command.name });

				const shortcut = commandShortcut(command);
				if (shortcut.length > 0) itemEl.createSpan({ cls: 'be-slash-item-shortcut', text: shortcut });
			}
		}

		this.footerEl.createSpan({ cls: 'be-slash-close-button', text: 'Close menu' });
		this.footerEl.createSpan({ cls: 'be-slash-close-shortcut', text: 'esc' });
		this.footerEl.addEventListener('click', () => {
			this.view.dispatch({ effects: this.closeMenuEffect.of() });
		});

		this.listEl.scrollTop = slashMenuScrollMemory;
		this.menuEl.classList.toggle('is-scrolled', this.listEl.scrollTop > 4);
		this.scrollSelectedItemIntoView();
		slashMenuScrollMemory = this.listEl.scrollTop;
	}

	private patchSelectedItem(newIndex: number): void {
		if (this.selectedEl) {
			this.selectedEl.removeClass('is-selected');
			this.selectedEl.removeAttribute('aria-selected');
		}
		this.selectedEl = this.listEl.querySelector<HTMLElement>(`[data-command-index="${newIndex}"]`);
		if (this.selectedEl) {
			this.selectedEl.addClass('is-selected');
			this.selectedEl.setAttribute('aria-selected', 'true');
		}
		this.lastSelectedIndex = newIndex;
		const wasMouse = this.lastSelectionWasMouse;
		this.lastSelectionWasMouse = false;
		if (wasMouse) {
			this.interactionMode = 'mouse';
		} else {
			this.interactionMode = 'keyboard';
			this.scrollSelectedItemIntoView();
			this.scheduleSelectedItemIntoView();
		}
	}

	private scrollSelectedItemIntoView(): void {
		if (this.selectedEl === null) return;
		this.selectedEl.scrollIntoView({ block: 'nearest' });
		slashMenuScrollMemory = this.listEl.scrollTop;
	}

	private scheduleSelectedItemIntoView(): void {
		if (this.selectedScrollFrame !== 0) cancelAnimationFrame(this.selectedScrollFrame);
		this.selectedScrollFrame = requestAnimationFrame(() => {
			this.selectedScrollFrame = 0;
			this.scrollSelectedItemIntoView();
		});
	}

	private onListWheel(event: WheelEvent): void {
		if (this.selectedScrollFrame !== 0) {
			cancelAnimationFrame(this.selectedScrollFrame);
			this.selectedScrollFrame = 0;
		}
		event.preventDefault();
		event.stopPropagation();
		let delta = event.deltaY;
		if (event.deltaMode === 1) delta *= 40;
		else if (event.deltaMode === 2) delta *= this.listEl.clientHeight;
		this.listEl.scrollTop += delta;
		slashMenuScrollMemory = this.listEl.scrollTop;
	}

	private onMouseDown(event: MouseEvent): void {
		if (this.selectedScrollFrame !== 0) {
			cancelAnimationFrame(this.selectedScrollFrame);
			this.selectedScrollFrame = 0;
		}
		const target = event.target;
		if (!(target instanceof Element)) return;
		if (target.closest('[data-command-index], .be-slash-footer') !== null) {
			event.preventDefault();
		}
	}

	private onClick(event: MouseEvent): void {
		const target = event.target;
		if (!(target instanceof Element)) return;

		const itemEl = target.closest<HTMLElement>('[data-command-index]');
		if (itemEl === null) return;

		const index = parseInt(itemEl.dataset.commandIndex ?? '', 10);
		if (Number.isNaN(index)) return;

		const state = this.view.state.field(this.field, false);
		if (state === undefined || state === null) return;

		selectSlashCommand(this.view, state, index);
	}

	private onListMouseMove(event: MouseEvent): void {
		if (this.selectedScrollFrame !== 0) {
			cancelAnimationFrame(this.selectedScrollFrame);
			this.selectedScrollFrame = 0;
		}
		if (event.clientX === this.lastMouseX && event.clientY === this.lastMouseY) return;
		this.lastMouseX = event.clientX;
		this.lastMouseY = event.clientY;
		const hovered = this.hoveredItemAtPoint(event.clientX, event.clientY);
		if (hovered === null) return;
		const index = parseInt(hovered.dataset.commandIndex ?? '', 10);
		if (Number.isNaN(index)) return;
		this.selectItem(index);
	}

	private hoveredItemAtPoint(clientX: number, clientY: number): HTMLElement | null {
		const hovered = this.view.dom.ownerDocument.elementFromPoint(clientX, clientY);
		if (!(hovered instanceof HTMLElement)) return null;
		if (!this.listEl.contains(hovered)) return null;
		return hovered.closest<HTMLElement>('[data-command-index]');
	}

	private selectItem(index: number): void {
		const state = this.view.state.field(this.field, false);
		if (state === undefined || state === null || state.selectedIndex === index) return;
		this.lastSelectionWasMouse = true;
		this.view.dispatch({ effects: this.setSelectionEffect.of(index) });
	}
}

function clampIndex(index: number, itemCount: number): number {
	return Math.max(0, Math.min(index, itemCount - 1));
}

function renderCommandIcon(parent: HTMLElement, command: SlashCommandDefinition): void {
	renderSlashCommandIcon(parent, command);
}

function commandShortcut(command: SlashCommandDefinition): string {
	switch (command.id) {
		case 'heading-1':
			return '#';
		case 'heading-2':
			return '##';
		case 'heading-3':
			return '###';
		case 'bullet-list':
			return '-';
		case 'numbered-list':
			return '1.';
		case 'checkbox':
			return '- [ ]';
		case 'quote':
			return '>';
		case 'code-block':
			return '```';
		case 'math-block':
			return '$$';
		case 'divider':
			return '---';
		case 'image':
			return '<img/>';
		default:
			return '';
	}
}

function selectSlashCommand(
	view: EditorView,
	state: SlashMenuState,
	index: number,
	closeEffect?: StateEffectType<void>,
): boolean {
	const command = state.items[index];
	if (command === undefined) return false;

	const { text, cursorOffset } = resolveTemplate(command.template);
	view.dispatch({
		changes: { from: state.from, to: state.to, insert: text },
		selection: { anchor: state.from + cursorOffset },
		effects: closeEffect === undefined ? undefined : closeEffect.of(),
		scrollIntoView: true,
	});
	view.focus();
	return true;
}

function resolveTemplate(template: string): { text: string; cursorOffset: number } {
	const tokenIndex = template.indexOf(SLASH_CURSOR_TOKEN);
	if (tokenIndex === -1) return { text: template, cursorOffset: template.length };
	return {
		text: template.replace(SLASH_CURSOR_TOKEN, ''),
		cursorOffset: tokenIndex,
	};
}
