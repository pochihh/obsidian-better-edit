import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { SymbolEntry } from './symbol-data';

type Tab = 'math' | 'emoji';

export interface SymbolPickerConfig {
	mathSymbols: SymbolEntry[];
	emojiSymbols: SymbolEntry[];
	getHistory: () => string[];
	setHistory: (history: string[]) => Promise<void>;
	maxHistory: number;
	view: EditorView;
	onClose: () => void;
}

export class SymbolPickerPanel {
	private panelEl: HTMLElement | null = null;
	private activeTab: Tab = 'math';
	private searchValue = '';
	private readonly documentEl: Document;
	private readonly windowEl: Window;

	constructor(private readonly config: SymbolPickerConfig) {
		this.documentEl = config.view.dom.ownerDocument;
		this.windowEl = this.documentEl.defaultView ?? window;
	}

	isOpen(): boolean {
		return this.panelEl !== null;
	}

	open(initialTab: Tab = 'math'): void {
		this.close();
		this.activeTab = initialTab;
		this.searchValue = '';
		this.panelEl = this.buildPanel();
		this.documentEl.body.appendChild(this.panelEl);
		this.position();
		this.bindGlobalListeners();
		requestAnimationFrame(() => {
			this.panelEl?.querySelector<HTMLInputElement>('.be-symbol-search-input')?.focus();
		});
	}

	close(): void {
		if (!this.panelEl) return;
		this.unbindGlobalListeners();
		this.panelEl.remove();
		this.panelEl = null;
		this.config.onClose();
	}

	private buildPanel(): HTMLElement {
		const panel = createDiv({ cls: 'be-symbol-picker' });

		// Search
		const searchEl = panel.createEl('input', {
			cls: 'be-symbol-search-input',
			attr: { type: 'text', placeholder: 'Search…' },
		});

		// History
		const historyContainerEl = panel.createDiv({ cls: 'be-symbol-history-container' });

		// Tabs
		const tabBarEl = panel.createDiv({ cls: 'be-symbol-tab-bar' });
		const mathTabEl = tabBarEl.createEl('button', {
			cls: 'be-symbol-tab',
			text: 'Math & Arrows',
			attr: { type: 'button' },
		});
		const emojiTabEl = tabBarEl.createEl('button', {
			cls: 'be-symbol-tab',
			text: 'Emoji',
			attr: { type: 'button' },
		});

		// Grid
		const gridEl = panel.createDiv({ cls: 'be-symbol-grid' });

		const setTab = (tab: Tab): void => {
			this.activeTab = tab;
			mathTabEl.toggleClass('is-active', tab === 'math');
			emojiTabEl.toggleClass('is-active', tab === 'emoji');
			renderGrid();
		};

		const renderHistory = (): void => {
			historyContainerEl.empty();
			const history = this.config.getHistory();
			const showHistory = history.length > 0 && this.searchValue.length === 0;
			historyContainerEl.style.display = showHistory ? '' : 'none';
			if (!showHistory) return;
			historyContainerEl.createDiv({ cls: 'be-symbol-section-label', text: 'Recent' });
			const hGrid = historyContainerEl.createDiv({ cls: 'be-symbol-grid be-symbol-history-grid' });
			const allSymbols = [...this.config.mathSymbols, ...this.config.emojiSymbols];
			for (const char of history) {
				const entry = allSymbols.find(s => s.char === char);
				this.addSymbolBtn(hGrid, char, entry?.name ?? char);
			}
			historyContainerEl.createDiv({ cls: 'be-symbol-divider' });
		};

		const renderGrid = (): void => {
			gridEl.empty();
			const symbols = this.activeTab === 'math' ? this.config.mathSymbols : this.config.emojiSymbols;
			const q = this.searchValue;
			const filtered = q.length === 0
				? symbols
				: symbols.filter(s =>
					s.char === q ||
					s.name.toLowerCase().includes(q) ||
					s.keywords.some(k => k.includes(q)),
				);
			if (filtered.length === 0) {
				gridEl.createDiv({ cls: 'be-symbol-empty', text: 'No results' });
				return;
			}
			for (const entry of filtered) {
				this.addSymbolBtn(gridEl, entry.char, entry.name);
			}
		};

		searchEl.addEventListener('input', () => {
			this.searchValue = searchEl.value.trim().toLowerCase();
			renderHistory();
			renderGrid();
		});

		mathTabEl.addEventListener('mousedown', e => e.preventDefault());
		mathTabEl.addEventListener('click', () => setTab('math'));
		emojiTabEl.addEventListener('mousedown', e => e.preventDefault());
		emojiTabEl.addEventListener('click', () => setTab('emoji'));

		setTab(this.activeTab);
		renderHistory();

		return panel;
	}

	private addSymbolBtn(parent: HTMLElement, char: string, title: string): void {
		const btn = parent.createEl('button', {
			cls: 'be-symbol-btn',
			text: char,
			attr: { type: 'button', title },
		});
		btn.addEventListener('mousedown', e => e.preventDefault());
		btn.addEventListener('click', () => this.insertSymbol(char));
	}

	private insertSymbol(char: string): void {
		const prev = this.config.getHistory();
		const next = [char, ...prev.filter(c => c !== char)].slice(0, this.config.maxHistory);
		void this.config.setHistory(next);

		const range = this.config.view.state.selection.main;
		this.config.view.dispatch({
			changes: { from: range.to, to: range.to, insert: char },
			selection: EditorSelection.single(range.to + char.length),
			scrollIntoView: true,
		});
		this.config.view.focus();
		this.close();
	}

	private position(): boolean {
		if (!this.panelEl) return false;
		const view = this.config.view;
		const head = view.state.selection.main.head;
		const coords = view.coordsAtPos(head);
		if (!coords) return false;
		const margin = 8;
		const win = this.windowEl;

		this.panelEl.style.visibility = 'hidden';
		this.panelEl.style.top = '0px';
		this.panelEl.style.left = '0px';
		// Ancestor transform/filter can make position:fixed relative to that ancestor; subtract the offset to correct.
		const zeroRect = this.panelEl.getBoundingClientRect();
		this.panelEl.style.visibility = '';

		let targetTop = coords.bottom + margin;
		if (targetTop + zeroRect.height > win.innerHeight - margin) {
			targetTop = coords.top - zeroRect.height - margin;
		}
		targetTop = Math.max(margin, targetTop);

		let targetLeft = coords.left;
		if (targetLeft + zeroRect.width > win.innerWidth - margin) {
			targetLeft = win.innerWidth - zeroRect.width - margin;
		}
		targetLeft = Math.max(margin, targetLeft);

		this.panelEl.style.top = `${Math.round(targetTop - zeroRect.top)}px`;
		this.panelEl.style.left = `${Math.round(targetLeft - zeroRect.left)}px`;
		return true;
	}

	private readonly onDocMouseDown = (event: MouseEvent): void => {
		if (this.panelEl?.contains(event.target as Node)) return;
		this.close();
	};

	private readonly onDocKeyDown = (event: KeyboardEvent): void => {
		if (event.key === 'Escape') {
			event.preventDefault();
			this.close();
		}
	};

	private readonly onResize = (): void => {
		if (!this.position()) this.close();
	};

	private readonly onEditorScroll = (): void => {
		if (!this.position()) this.close();
	};

	private bindGlobalListeners(): void {
		this.documentEl.addEventListener('mousedown', this.onDocMouseDown, true);
		this.documentEl.addEventListener('keydown', this.onDocKeyDown, true);
		this.windowEl.addEventListener('resize', this.onResize, { passive: true });
		this.config.view.scrollDOM.addEventListener('scroll', this.onEditorScroll, { passive: true });
	}

	private unbindGlobalListeners(): void {
		this.documentEl.removeEventListener('mousedown', this.onDocMouseDown, true);
		this.documentEl.removeEventListener('keydown', this.onDocKeyDown, true);
		this.windowEl.removeEventListener('resize', this.onResize);
		this.config.view.scrollDOM.removeEventListener('scroll', this.onEditorScroll);
	}
}
