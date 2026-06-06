import { EditorSelection, Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { TFile } from 'obsidian';
import type BetterEditPlugin from '../../main';
import { renderTextStylingIcon } from '../../icons';
import type { TextStylingIconName } from '../../icons';

type FormatActionId = 'bold' | 'italic' | 'strikethrough' | 'code' | 'highlight' | 'equation';

type FormatAction = {
	id: FormatActionId;
	label: string;
	icon: TextStylingIconName;
	delimiter: string;
	unitSize: number;
	family: 'stars' | 'pairs' | 'code';
	open: string;
	close: string;
};

type FormattingAnalysis = {
	changeFrom: number;
	changeTo: number;
	raw: string;
	leftRun: number;
	rightRun: number;
	active: boolean;
};

type FormattedSpan = {
	outerFrom: number;
	innerFrom: number;
	innerTo: number;
	outerTo: number;
};

type TransformationResult = {
	replaceFrom: number;
	replaceTo: number;
	insert: string;
	selectionFrom: number;
	selectionTo: number;
};

const TOOLBAR_DELAY_MS = 200;

const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;
const MATH_BLOCK_RE = /^\s*\$\$\s*$/;

const FORMAT_ACTIONS: FormatAction[] = [
	{
		id: 'bold',
		label: 'Bold',
		icon: 'bold',
		delimiter: '*',
		unitSize: 2,
		family: 'stars',
		open: '**',
		close: '**',
	},
	{
		id: 'italic',
		label: 'Italic',
		icon: 'italic',
		delimiter: '*',
		unitSize: 1,
		family: 'stars',
		open: '*',
		close: '*',
	},
	{
		id: 'strikethrough',
		label: 'Strikethrough',
		icon: 'strikethrough',
		delimiter: '~',
		unitSize: 2,
		family: 'pairs',
		open: '~~',
		close: '~~',
	},
	{
		id: 'code',
		label: 'Inline code',
		icon: 'code',
		delimiter: '`',
		unitSize: 1,
		family: 'code',
		open: '`',
		close: '`',
	},
	{
		id: 'equation',
		label: 'Inline equation',
		icon: 'equation',
		delimiter: '$',
		unitSize: 1,
		family: 'code',
		open: '$',
		close: '$',
	},
	{
		id: 'highlight',
		label: 'Highlight',
		icon: 'highlight',
		delimiter: '=',
		unitSize: 2,
		family: 'pairs',
		open: '==',
		close: '==',
	},
];

type ToolbarItem = FormatActionId | 'link';

const TOOLBAR_ROWS: Array<Array<ToolbarItem>> = [
	['bold', 'italic', 'strikethrough', 'highlight'],
	['code', 'equation', 'link'],
];

export function createTextStylingExtension(plugin: BetterEditPlugin): Extension {
	return ViewPlugin.fromClass(
		class {
			private readonly toolbarEl: HTMLElement;
			private readonly buttons = new Map<FormatActionId, HTMLButtonElement>();
			private readonly documentEl: Document;
			private readonly windowEl: Window;
			private readonly scrollerEl: HTMLElement | null;
			private linkPopoverEl: HTMLElement | null = null;
			private linkPopoverAnchorEl: HTMLElement | null = null;
			private linkPopoverPending = false;
			private lastSelectionRect: DOMRect | null = null;
			private visible = false;
			private showTimer = 0;
			private pointerDown = false;

			constructor(private readonly view: EditorView) {
				this.documentEl = view.dom.ownerDocument;
				this.windowEl = this.documentEl.defaultView ?? window;
				this.scrollerEl = view.scrollDOM;
				this.toolbarEl = this.buildToolbar(plugin);
				this.documentEl.body.appendChild(this.toolbarEl);
				this.bindEvents();
				this.scheduleRefresh();
			}

			update(update: ViewUpdate): void {
				if (update.docChanged || update.selectionSet || update.focusChanged || update.viewportChanged) {
					this.scheduleRefresh();
				}
			}

			destroy(): void {
				this.clearShowTimer();
				this.documentEl.removeEventListener('mousedown', this.onDocumentMouseDown, true);
				this.documentEl.removeEventListener('keydown', this.onDocumentKeyDown, true);
				this.scrollerEl?.removeEventListener('scroll', this.onScroll);
				this.windowEl.removeEventListener('resize', this.onResize);
				this.closeLinkPopover();
				this.toolbarEl.remove();
			}

			private bindEvents(): void {
				this.toolbarEl.addEventListener('mousedown', event => {
					event.preventDefault();
					this.pointerDown = true;
				});
				this.toolbarEl.addEventListener('mouseup', () => {
					this.pointerDown = false;
				});
				this.toolbarEl.addEventListener('mouseleave', () => {
					this.pointerDown = false;
				});
				this.documentEl.addEventListener('mousedown', this.onDocumentMouseDown, true);
				this.documentEl.addEventListener('keydown', this.onDocumentKeyDown, true);
				this.scrollerEl?.addEventListener('scroll', this.onScroll, { passive: true });
				this.windowEl.addEventListener('resize', this.onResize, { passive: true });
			}

			private readonly onDocumentMouseDown = (event: MouseEvent): void => {
				if (this.toolbarEl.contains(event.target as Node)) return;
				if (this.linkPopoverEl?.contains(event.target as Node)) return;
				this.hideToolbar();
			};

			private readonly onDocumentKeyDown = (event: KeyboardEvent): void => {
				if (event.key !== 'Escape') return;
				if (this.linkPopoverEl !== null) {
					event.preventDefault();
					this.closeLinkPopover();
					return;
				}
				this.hideToolbar();
			};

			private readonly onScroll = (): void => {
				if (this.visible) this.positionToolbar();
				if (this.linkPopoverEl !== null) this.positionLinkPopover();
			};

			private readonly onResize = (): void => {
				if (this.visible) this.positionToolbar();
				if (this.linkPopoverEl !== null) this.positionLinkPopover();
			};

			private buildToolbar(plugin: BetterEditPlugin): HTMLElement {
				const toolbar = createDiv({ cls: 'be-text-toolbar' });
				for (const rowItems of TOOLBAR_ROWS) {
					const rowEl = createDiv({ cls: 'be-text-toolbar-row' });
					for (const item of rowItems) {
						if (item === 'link') {
							const button = this.createToolbarButton(plugin, 'Link', 'link');
							plugin.registerDomEvent(button, 'mousedown', event => {
								event.preventDefault();
								event.stopPropagation();
								this.linkPopoverPending = true;
								this.openLinkPopover(button, plugin);
							});
							rowEl.appendChild(button);
							continue;
						}
						const action = findFormatAction(item);
						const button = this.createToolbarButton(plugin, action.label, action.icon, () => {
							this.applyFormat(action);
						});
						rowEl.appendChild(button);
						this.buttons.set(action.id, button);
					}
					toolbar.appendChild(rowEl);
				}
				return toolbar;
			}

			private createToolbarButton(
				plugin: BetterEditPlugin,
				label: string,
				icon: TextStylingIconName,
				onClick?: () => void,
			): HTMLButtonElement {
				const button = createEl('button', {
					cls: 'be-toolbar-btn',
					attr: {
						type: 'button',
						'aria-label': label,
					},
				});
				renderTextStylingIcon(button, icon);
				button.setAttribute('title', label);
				if (onClick) {
					plugin.registerDomEvent(button, 'click', event => {
						event.preventDefault();
						onClick();
					});
				}
				return button;
			}

			private scheduleRefresh(): void {
				this.clearShowTimer();
				if (!this.shouldShowToolbar()) {
					this.hideToolbar();
					return;
				}
				// Already visible — reposition after the current update cycle finishes.
				// coordsAtPos cannot be called during a CM6 update, so defer via rAF.
				if (this.visible) {
					this.updateButtonState();
					this.windowEl.requestAnimationFrame(() => {
						if (this.visible) this.positionToolbar();
					});
					return;
				}
				this.showTimer = this.windowEl.setTimeout(() => {
					this.showTimer = 0;
					if (!this.shouldShowToolbar()) {
						this.hideToolbar();
						return;
					}
					this.updateButtonState();
					this.positionToolbar();
					this.toolbarEl.addClass('is-visible');
					this.visible = true;
				}, TOOLBAR_DELAY_MS);
			}

			private shouldShowToolbar(): boolean {
				if (!plugin.settings.textStyling.enabled) return false;

				const range = this.view.state.selection.main;
				if (range.empty) return false;
				if (range.from === range.to) return false;
				if (this.isSuppressedContext(range.from, range.to)) return false;
				if (!this.visible && this.linkPopoverEl === null && !this.linkPopoverPending && !this.view.hasFocus) return false;

				const selectedText = this.view.state.sliceDoc(range.from, range.to);
				return selectedText.trim().length > 0;
			}

			private isSuppressedContext(from: number, to: number): boolean {
				const start = this.view.state.doc.lineAt(from).number;
				const end = this.view.state.doc.lineAt(Math.max(from, to - 1)).number;
				for (let line = start; line <= end; line += 1) {
					if (isInsideFencedCodeBlock(this.view.state, line) || isInsideMathBlock(this.view.state, line)) {
						return true;
					}
				}
				return false;
			}

			private updateButtonState(): void {
				for (const action of FORMAT_ACTIONS) {
					const button = this.buttons.get(action.id);
					if (!button) continue;
					const range = this.effectiveTargetRange(action);
					const active = this.analyzeFormatting(action, range.from, range.to).active;
					const disabled =
						(action.id === 'code' || action.id === 'equation') &&
						!active &&
						(this.selectedText().includes('\n') || this.selectedText().includes(action.delimiter));
					button.toggleClass('is-active', active);
					button.toggleClass('is-disabled', disabled);
					button.toggleAttribute('disabled', disabled);
				}
			}

			private selectedText(): string {
				const range = this.view.state.selection.main;
				return this.view.state.sliceDoc(range.from, range.to);
			}

			private effectiveTargetRange(action: FormatAction): { from: number; to: number } {
				const range = this.view.state.selection.main;
				if (action.id === 'highlight') return { from: range.from, to: range.to };
				const highlightSpan = findContainingSpan(this.view.state.doc.toString(), highlightAction(), range.from, range.to);
				if (!highlightSpan) return { from: range.from, to: range.to };
				return { from: highlightSpan.innerFrom, to: highlightSpan.innerTo };
			}

			private analyzeFormatting(action: FormatAction, from: number, to: number): FormattingAnalysis {
				const docText = this.view.state.doc.toString();
				const leftOutside = countRunBackward(docText, from, action.delimiter);
				const rightOutside = countRunForward(docText, to, action.delimiter);
				let changeFrom = from - leftOutside;
				let changeTo = to + rightOutside;
				const spans = collectFormattedSpans(docText, action);
				let expanded = true;
				while (expanded) {
					expanded = false;
					for (const span of spans) {
						if (!rangesOverlap(changeFrom, changeTo, span.outerFrom, span.outerTo)) continue;
						const nextFrom = Math.min(changeFrom, span.outerFrom);
						const nextTo = Math.max(changeTo, span.outerTo);
						if (nextFrom === changeFrom && nextTo === changeTo) continue;
						changeFrom = nextFrom;
						changeTo = nextTo;
						expanded = true;
					}
				}
				const raw = this.view.state.sliceDoc(changeFrom, changeTo);
				const leftRun = countLeadingRun(raw, action.delimiter);
				const rightRun = countTrailingRun(raw, action.delimiter);
				return {
					changeFrom,
					changeTo,
					raw,
					leftRun,
					rightRun,
					active: isLogicalLayerActive(action, leftRun, rightRun),
				};
			}

			private applyFormat(action: FormatAction): void {
				const button = this.buttons.get(action.id);
				if (!button || button.disabled) return;

				const range = this.view.state.selection.main;
				if (range.empty) return;

				const { anchor, head } = range;
				const backwards = anchor > head;
				const transformed = this.transformSelection(action);
				if (transformed === null) return;
				this.view.dispatch({
					changes: {
						from: transformed.replaceFrom,
						to: transformed.replaceTo,
						insert: transformed.insert,
					},
					selection: EditorSelection.single(
						backwards ? transformed.selectionTo : transformed.selectionFrom,
						backwards ? transformed.selectionFrom : transformed.selectionTo,
					),
					scrollIntoView: true,
				});

				this.scheduleRefresh();
			}

			private transformSelection(action: FormatAction): TransformationResult | null {
				const range = this.view.state.selection.main;
				const docText = this.view.state.doc.toString();
				const target = this.effectiveTargetRange(action);
				const analysis = this.analyzeFormatting(action, target.from, target.to);
				let replaceFrom = analysis.changeFrom;
				let replaceTo = analysis.changeTo;
				let wrapperPrefix = '';
				let wrapperSuffix = '';

				if (action.id !== 'highlight') {
					const highlightSpan = findContainingSpan(docText, highlightAction(), range.from, range.to);
					if (highlightSpan) {
						replaceFrom = highlightSpan.outerFrom;
						replaceTo = highlightSpan.outerTo;
						wrapperPrefix = docText.slice(highlightSpan.outerFrom, highlightSpan.innerFrom);
						wrapperSuffix = docText.slice(highlightSpan.innerTo, highlightSpan.outerTo);
					}
				}

				if (analysis.active) {
					const remainingLeft = remainingRunLengthAfterRemoval(action, analysis.leftRun);
					const remainingRight = remainingRunLengthAfterRemoval(action, analysis.rightRun);
					const coreText = analysis.raw.slice(analysis.leftRun, analysis.raw.length - analysis.rightRun);
					const normalizedCore = normalizeSelectionForApply(coreText, action) ?? coreText;
					const transformedInner =
						action.delimiter.repeat(remainingLeft) +
						normalizedCore +
						action.delimiter.repeat(remainingRight);
					return {
						replaceFrom,
						replaceTo,
						insert: wrapperPrefix + transformedInner + wrapperSuffix,
						selectionFrom: replaceFrom + wrapperPrefix.length + remainingLeft,
						selectionTo: replaceFrom + wrapperPrefix.length + remainingLeft + normalizedCore.length,
					};
				}

				const normalized = normalizeSelectionForApply(analysis.raw, action);
				if (normalized === null) return null;
				const wrapped = `${action.open}${normalized}${action.close}`;
				return {
					replaceFrom,
					replaceTo,
					insert: wrapperPrefix + wrapped + wrapperSuffix,
					selectionFrom: replaceFrom + wrapperPrefix.length + action.open.length,
					selectionTo: replaceFrom + wrapperPrefix.length + action.open.length + normalized.length,
				};
			}

			private positionToolbar(): void {
				const rect = this.selectionRect();
				if (rect === null) {
					this.hideToolbar();
					return;
				}

				this.toolbarEl.addClass('is-visible');
				this.toolbarEl.addClass('is-measuring');
				const toolbarRect = this.toolbarEl.getBoundingClientRect();
				const margin = 8;
				const aboveTop = rect.top - toolbarRect.height - margin;
				const belowTop = rect.bottom + margin;
				const placeAbove = aboveTop >= margin;
				const top = placeAbove ? aboveTop : belowTop;
				const left = Math.max(
					margin,
					Math.min(
						rect.right + margin,
						this.documentEl.defaultView!.innerWidth - toolbarRect.width - margin,
					),
				);

				this.toolbarEl.setCssProps({
					'--be-text-toolbar-left': `${Math.round(left)}px`,
					'--be-text-toolbar-top': `${Math.round(top)}px`,
				});
				this.toolbarEl.removeClass('is-measuring');
			}

			private selectionRect(): DOMRect | null {
				const range = this.view.state.selection.main;
				if (range.empty) return null;

				// Use CM6 layout coords — works even when content is virtualised out of the DOM.
				const fromCoords = this.view.coordsAtPos(range.from);
				const toCoords = this.view.coordsAtPos(range.to);

				if (fromCoords === null && toCoords === null) {
					// Both ends scrolled out of view — keep last known rect for link popover, hide toolbar.
					return this.linkPopoverEl !== null ? this.lastSelectionRect : null;
				}

				const top = (fromCoords ?? toCoords!).top;
				const bottom = (toCoords ?? fromCoords!).bottom;
				const left = (fromCoords ?? toCoords!).left;
				const right = (toCoords ?? fromCoords!).right;
				const rect = new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
				this.lastSelectionRect = rect;
				return rect;
			}

			private hideToolbar(): void {
				if (this.pointerDown) return;
				this.clearShowTimer();
				this.closeLinkPopover();
				this.toolbarEl.removeClass('is-visible');
				this.visible = false;
			}

			private clearShowTimer(): void {
				if (this.showTimer === 0) return;
				this.windowEl.clearTimeout(this.showTimer);
				this.showTimer = 0;
			}

			private openLinkPopover(anchorEl: HTMLElement, plugin: BetterEditPlugin): void {
				this.closeLinkPopover();
				this.linkPopoverAnchorEl = anchorEl;
				const popover = createDiv({ cls: 'be-replace-panel be-text-link-panel' });
				const tabs = createDiv({ cls: 'be-replace-tabs' });
				const pageTab = createLinkModeTab('Page', '[[Page]]', true);
				const urlTab = createLinkModeTab('Link', '[text](...)', false);
				tabs.append(pageTab, urlTab);

				const pagePane = createDiv({ cls: 'be-replace-pane' });
				pagePane.createDiv({
					cls: 'be-replace-upload-desc',
					text: 'Search notes in the vault. Press Enter to create a new link if no matching note is found.',
				});
				const pageInput = createEl('input', {
					cls: 'be-replace-link-input',
					attr: {
						type: 'text',
						placeholder: 'Page name…',
					},
				});
				const suggestionsMenuEl = createDiv({ cls: 'be-slash-menu be-text-link-menu is-visible' });
				const suggestionsEl = suggestionsMenuEl.createDiv({ cls: 'be-slash-menu-list be-text-link-suggestions' });
				pagePane.append(pageInput, suggestionsMenuEl);

				const urlPane = createDiv({ cls: 'be-replace-pane', attr: { style: 'display:none' } });
				urlPane.createDiv({
					cls: 'be-replace-upload-desc',
					text: 'Insert a standard markdown link. Works for URLs or typed local paths.',
				});
				const urlInput = createEl('input', {
					cls: 'be-replace-link-input',
					attr: {
						type: 'text',
						placeholder: 'Paste URL…',
					},
				});
				const footer = createDiv({ cls: 'be-text-link-footer' });
				footer.createSpan({ text: 'Enter to apply' });
				const applyBtn = createEl('button', {
					cls: 'be-replace-apply-btn',
					text: 'Apply',
					attr: { type: 'button' },
				});
				footer.appendChild(applyBtn);
				urlPane.append(urlInput, footer);
				popover.append(tabs, pagePane, urlPane);

				let mode: 'page' | 'url' = 'page';
				const pageItems = this.getPageItems(plugin);
				let pageSuggestions = this.filterPageSuggestions(pageItems, '');
				let selectedPageIndex = pageSuggestions.length > 0 ? 0 : -1;
				let lastMouseX = -1;
				let lastMouseY = -1;
				const setMode = (nextMode: 'page' | 'url'): void => {
					mode = nextMode;
					pageTab.toggleClass('is-active', mode === 'page');
					urlTab.toggleClass('is-active', mode === 'url');
					pagePane.style.display = mode === 'page' ? '' : 'none';
					urlPane.style.display = mode === 'url' ? '' : 'none';
					this.windowEl.requestAnimationFrame(() => {
						if (mode === 'page') pageInput.focus();
						else urlInput.focus();
					});
				};

				const apply = (): void => {
					const target = (mode === 'page' ? pageInput.value : urlInput.value).trim();
					if (!target) return;
					if (mode === 'page') {
						if (selectedPageIndex >= 0) {
							const suggested = pageSuggestions[selectedPageIndex];
							this.applyPageLink(target, suggested?.path ?? null, plugin);
						} else {
							this.applyPageLink(target, null, plugin);
						}
					} else {
						this.applyExternalLink(target);
					}
					this.closeLinkPopover();
				};

				const ensureSelectedVisible = (): void => {
					if (selectedPageIndex < 0) return;
					suggestionsEl.querySelector<HTMLElement>(`[data-link-index="${selectedPageIndex}"]`)
						?.scrollIntoView({ block: 'nearest' });
				};

				const updateSuggestionFadeState = (): void => {
					suggestionsMenuEl.toggleClass('is-scrolled', suggestionsEl.scrollTop > 4);
					const isAtBottom = suggestionsEl.scrollTop + suggestionsEl.clientHeight >= suggestionsEl.scrollHeight - 4;
					suggestionsMenuEl.toggleClass('is-not-at-bottom', !isAtBottom);
				};

				const selectPageIndex = (index: number, source: 'keyboard' | 'mouse'): void => {
					if (selectedPageIndex === index) return;
					selectedPageIndex = index;
					renderSuggestions();
					if (source === 'keyboard') {
						ensureSelectedVisible();
						this.windowEl.requestAnimationFrame(() => ensureSelectedVisible());
					}
				};

				const hoveredSuggestionAtPoint = (clientX: number, clientY: number): HTMLElement | null => {
					const hovered = this.documentEl.elementFromPoint(clientX, clientY);
					if (!(hovered instanceof HTMLElement)) return null;
					if (!suggestionsEl.contains(hovered)) return null;
					return hovered.closest<HTMLElement>('[data-link-index]');
				};

				const renderSuggestions = (): void => {
					suggestionsEl.empty();
					if (pageSuggestions.length === 0) {
						const emptyEl = suggestionsEl.createDiv({ cls: 'be-slash-empty be-text-link-empty' });
						emptyEl.createDiv({
							cls: 'be-text-link-empty-title',
							text: 'No matching notes',
						});
						const query = pageInput.value.trim();
						if (query.length > 0) {
							emptyEl.createDiv({
								cls: 'be-text-link-empty-hint',
								text: `Press Enter to create [[${query}]]`,
							});
						}
					}
					for (const [index, suggestion] of pageSuggestions.entries()) {
						const row = suggestionsEl.createDiv({
							cls: selectedPageIndex === index
								? 'be-slash-item be-text-link-suggestion is-selected'
								: 'be-slash-item be-text-link-suggestion',
						});
						row.setAttribute('data-link-index', String(index));
						const label = row.createDiv({ cls: 'be-slash-item-label be-text-link-suggestion-label' });
						const title = label.createDiv({ cls: 'be-slash-item-name be-text-link-suggestion-title', text: suggestion.name });
						const subtitle = normalizeSuggestionSubtitle(suggestion.path, suggestion.name);
						if (subtitle.length > 0) label.createDiv({ cls: 'be-text-link-suggestion-path', text: subtitle });
						else title.addClass('is-single-line');
						row.addEventListener('mousedown', event => event.preventDefault());
						row.addEventListener('click', () => {
							this.applyPageLink(suggestion.linktext, suggestion.path, plugin);
							this.closeLinkPopover();
						});
					}
					updateSuggestionFadeState();
				};

				const updateSuggestions = (): void => {
					pageSuggestions = this.filterPageSuggestions(pageItems, pageInput.value);
					selectedPageIndex = pageSuggestions.length > 0 ? 0 : -1;
					renderSuggestions();
					ensureSelectedVisible();
				};

				pageTab.addEventListener('click', () => setMode('page'));
				urlTab.addEventListener('click', () => setMode('url'));
				applyBtn.addEventListener('click', apply);
				suggestionsEl.addEventListener('mousemove', event => {
					if (event.clientX === lastMouseX && event.clientY === lastMouseY) return;
					lastMouseX = event.clientX;
					lastMouseY = event.clientY;
					const hovered = hoveredSuggestionAtPoint(event.clientX, event.clientY);
					if (hovered === null) return;
					const index = parseInt(hovered.dataset.linkIndex ?? '', 10);
					if (Number.isNaN(index)) return;
					selectPageIndex(index, 'mouse');
				});
				suggestionsEl.addEventListener('mouseleave', () => {
					lastMouseX = -1;
					lastMouseY = -1;
				});
				suggestionsEl.addEventListener('scroll', () => {
					updateSuggestionFadeState();
				}, { passive: true });
				suggestionsEl.addEventListener('wheel', event => {
					event.preventDefault();
					event.stopPropagation();
					let delta = event.deltaY;
					if (event.deltaMode === 1) delta *= 40;
					else if (event.deltaMode === 2) delta *= suggestionsEl.clientHeight;
					suggestionsEl.scrollTop += delta;
				}, { passive: false });
				pageInput.addEventListener('input', updateSuggestions);
				pageInput.addEventListener('keydown', event => {
					if (event.key === 'ArrowDown') {
						event.preventDefault();
						if (pageSuggestions.length === 0) {
							selectPageIndex(-1, 'keyboard');
						} else if (selectedPageIndex === -1) {
							selectPageIndex(0, 'keyboard');
						} else if (selectedPageIndex < pageSuggestions.length - 1) {
							selectPageIndex(selectedPageIndex + 1, 'keyboard');
						} else {
							selectPageIndex(pageSuggestions.length - 1, 'keyboard');
						}
						return;
					}
					if (event.key === 'ArrowUp') {
						event.preventDefault();
						if (pageSuggestions.length === 0) {
							selectPageIndex(-1, 'keyboard');
						} else if (selectedPageIndex === -1) {
							selectPageIndex(0, 'keyboard');
						} else if (selectedPageIndex > 0) {
							selectPageIndex(selectedPageIndex - 1, 'keyboard');
						} else {
							selectPageIndex(0, 'keyboard');
						}
						return;
					}
					if (event.key !== 'Enter') return;
					event.preventDefault();
					apply();
				});
				urlInput.addEventListener('keydown', event => {
					if (event.key !== 'Enter') return;
					event.preventDefault();
					apply();
				});

				this.documentEl.body.appendChild(popover);
				this.linkPopoverEl = popover;
				this.positionLinkPopover();
				renderSuggestions();
				this.windowEl.requestAnimationFrame(() => updateSuggestionFadeState());
				this.windowEl.requestAnimationFrame(() => {
					this.linkPopoverPending = false;
					pageInput.focus();
				});
			}

			private positionLinkPopover(): void {
				if (this.linkPopoverEl === null || this.linkPopoverAnchorEl === null) return;
				const anchorRect = this.linkPopoverAnchorEl.getBoundingClientRect();
				const popoverWidth = 360;
				const left = Math.max(
					8,
					Math.min(anchorRect.left, this.windowEl.innerWidth - popoverWidth - 8),
				);
				this.linkPopoverEl.style.top = `${anchorRect.bottom + 8}px`;
				this.linkPopoverEl.style.left = `${left}px`;
			}

			private closeLinkPopover(): void {
				this.linkPopoverEl?.remove();
				this.linkPopoverEl = null;
				this.linkPopoverAnchorEl = null;
				this.linkPopoverPending = false;
			}

			private getPageItems(plugin: BetterEditPlugin): Array<{ name: string; linktext: string; path: string }> {
				const sourcePath = plugin.app.workspace.getActiveFile()?.path ?? '';
				return plugin.app.vault.getMarkdownFiles().map(file => ({
					name: file.basename,
					linktext: plugin.app.metadataCache.fileToLinktext(file, sourcePath, true),
					path: file.path,
				}));
			}

			private filterPageSuggestions(
				items: Array<{ name: string; linktext: string; path: string }>,
				query: string,
			): Array<{ name: string; linktext: string; path: string }> {
				const normalizedQuery = query.trim().toLowerCase();
				if (normalizedQuery.length === 0) {
					return items.slice(0, 8);
				}
				return items
					.filter(suggestion =>
						suggestion.name.toLowerCase().includes(normalizedQuery) ||
						suggestion.linktext.toLowerCase().includes(normalizedQuery) ||
						suggestion.path.toLowerCase().includes(normalizedQuery),
					)
					.sort((left, right) => {
						const leftStarts = startsWithQuery(left.name, normalizedQuery);
						const rightStarts = startsWithQuery(right.name, normalizedQuery);
						if (leftStarts !== rightStarts) return leftStarts ? -1 : 1;
						return left.name.localeCompare(right.name);
					})
					.slice(0, 8);
			}

			private applyPageLink(target: string, filePath: string | null, plugin: BetterEditPlugin): void {
				const range = this.view.state.selection.main;
				const selectedText = this.selectedText();
				const sourcePath = plugin.app.workspace.getActiveFile()?.path ?? '';
				const linkedFile = filePath
					? plugin.app.vault.getAbstractFileByPath(filePath)
					: plugin.app.metadataCache.getFirstLinkpathDest(target, sourcePath);
				const linktext = linkedFile instanceof TFile
					? plugin.app.metadataCache.fileToLinktext(linkedFile, sourcePath, true)
					: target;
				const insert = buildPageLink(linktext, selectedText);
				const visibleText = extractVisibleLinkText('page', linktext, selectedText);
				const visibleIndex = insert.indexOf(visibleText);
				const selectionFrom = range.from + Math.max(0, visibleIndex);
				const selectionTo = selectionFrom + visibleText.length;
				this.view.dispatch({
					changes: { from: range.from, to: range.to, insert },
					selection: EditorSelection.single(selectionFrom, selectionTo),
					scrollIntoView: true,
				});
			}

			private applyExternalLink(target: string): void {
				const range = this.view.state.selection.main;
				const selectedText = this.selectedText();
				const insert = buildExternalLink(target, selectedText);
				const visibleText = extractVisibleLinkText('url', target, selectedText);
				const visibleIndex = insert.indexOf(visibleText);
				const selectionFrom = range.from + Math.max(0, visibleIndex);
				const selectionTo = selectionFrom + visibleText.length;
				this.view.dispatch({
					changes: { from: range.from, to: range.to, insert },
					selection: EditorSelection.single(selectionFrom, selectionTo),
					scrollIntoView: true,
				});
			}
		},
	);
}

function isLogicalLayerActive(action: FormatAction, leftRun: number, rightRun: number): boolean {
	switch (action.family) {
		case 'stars':
			if (action.id === 'bold') return leftRun >= 2 && rightRun >= 2;
			return leftRun % 2 === 1 && rightRun % 2 === 1;
		case 'pairs':
			return leftRun >= action.unitSize && rightRun >= action.unitSize;
		case 'code':
			return leftRun === 1 && rightRun === 1;
	}
}

function remainingRunLengthAfterRemoval(action: FormatAction, runLength: number): number {
	return Math.max(0, runLength - action.unitSize);
}

function normalizeSelectionForApply(raw: string, action: FormatAction): string | null {
	switch (action.family) {
		case 'stars':
			return raw.replace(/\*+/g, run => '*'.repeat(normalizeStarRunForApply(run.length, action.id)));
		case 'pairs':
			return normalizePairRunsForApply(raw, action);
		case 'code':
			return raw.includes(action.delimiter) ? null : raw;
	}
}

function normalizeStarRunForApply(runLength: number, actionId: FormatActionId): number {
	if (actionId === 'bold') return runLength >= 2 ? runLength - 2 : runLength;
	if (actionId === 'italic' && runLength % 2 === 1) return runLength - 1;
	return runLength;
}

function normalizePairRunsForApply(raw: string, action: FormatAction): string {
	const pattern = new RegExp(`${escapeRegExp(action.delimiter)}+`, 'g');
	return raw.replace(pattern, run => action.delimiter.repeat(Math.max(0, run.length - action.unitSize)));
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countRunBackward(docText: string, from: number, delimiter: string): number {
	let count = 0;
	for (let index = from - 1; index >= 0; index -= 1) {
		if (docText[index] !== delimiter) break;
		count += 1;
	}
	return count;
}

function countRunForward(docText: string, from: number, delimiter: string): number {
	let count = 0;
	for (let index = from; index < docText.length; index += 1) {
		if (docText[index] !== delimiter) break;
		count += 1;
	}
	return count;
}

function countLeadingRun(value: string, delimiter: string): number {
	let count = 0;
	while (count < value.length && value[count] === delimiter) count += 1;
	return count;
}

function countTrailingRun(value: string, delimiter: string): number {
	let count = 0;
	while (count < value.length && value[value.length - 1 - count] === delimiter) count += 1;
	return count;
}

function collectFormattedSpans(docText: string, action: FormatAction): FormattedSpan[] {
	const runs = collectDelimiterRuns(docText, action.delimiter).filter(run => qualifiesForAction(run.length, action));
	const spans: FormattedSpan[] = [];
	for (let index = 0; index < runs.length - 1; index += 2) {
		const left = runs[index];
		const right = runs[index + 1];
		if (left === undefined || right === undefined) continue;
		const wrapperSize = wrapperSizeForRun(left.length, right.length, action);
		if (wrapperSize === 0) continue;
		spans.push({
			outerFrom: left.from,
			innerFrom: left.from + wrapperSize,
			innerTo: right.to - wrapperSize,
			outerTo: right.to,
		});
	}
	return spans.filter(span => span.innerFrom <= span.innerTo);
}

function findContainingSpan(docText: string, action: FormatAction, from: number, to: number): FormattedSpan | null {
	const spans = collectFormattedSpans(docText, action);
	for (const span of spans) {
		if (from >= span.outerFrom && to <= span.outerTo) return span;
	}
	return null;
}

function collectDelimiterRuns(docText: string, delimiter: string): Array<{ from: number; to: number; length: number }> {
	const runs: Array<{ from: number; to: number; length: number }> = [];
	let index = 0;
	while (index < docText.length) {
		if (docText[index] !== delimiter) {
			index += 1;
			continue;
		}
		const from = index;
		while (index < docText.length && docText[index] === delimiter) index += 1;
		runs.push({ from, to: index, length: index - from });
	}
	return runs;
}

function qualifiesForAction(runLength: number, action: FormatAction): boolean {
	switch (action.family) {
		case 'stars':
			return action.id === 'bold' ? runLength >= 2 : runLength % 2 === 1;
		case 'pairs':
			return runLength >= action.unitSize;
		case 'code':
			return runLength === 1;
	}
}

function wrapperSizeForRun(leftRun: number, rightRun: number, action: FormatAction): number {
	switch (action.family) {
		case 'stars':
			return action.id === 'bold' ? 2 : 1;
		case 'pairs':
			return Math.min(action.unitSize, leftRun, rightRun);
		case 'code':
			return 1;
	}
}

function rangesOverlap(fromA: number, toA: number, fromB: number, toB: number): boolean {
	return fromA < toB && fromB < toA;
}

function highlightAction(): FormatAction {
	const action = FORMAT_ACTIONS.find(candidate => candidate.id === 'highlight');
	if (!action) throw new Error('Missing highlight action');
	return action;
}

function findFormatAction(id: FormatActionId): FormatAction {
	const action = FORMAT_ACTIONS.find(candidate => candidate.id === id);
	if (!action) throw new Error(`Missing format action: ${id}`);
	return action;
}

function createLinkModeTab(label: string, syntax: string, active: boolean): HTMLButtonElement {
	const button = createEl('button', {
		cls: active ? 'be-replace-tab be-text-link-tab is-active' : 'be-replace-tab be-text-link-tab',
		attr: { type: 'button' },
	});
	button.createSpan({ cls: 'be-text-link-tab-label', text: label });
	button.createSpan({ cls: 'be-text-link-tab-syntax', text: syntax });
	return button;
}

function buildPageLink(target: string, selectedText: string): string {
	const text = selectedText.trim();
	if (text.length === 0 || text === target) return `[[${target}]]`;
	return `[[${target}|${selectedText}]]`;
}

function buildExternalLink(target: string, selectedText: string): string {
	return `[${selectedText}](${target})`;
}

function extractVisibleLinkText(
	mode: 'page' | 'url',
	target: string,
	selectedText: string,
): string {
	if (mode === 'url') return selectedText;
	const text = selectedText.trim();
	return text.length === 0 || text === target ? target : selectedText;
}

function startsWithQuery(value: string, query: string): boolean {
	return value.toLowerCase().startsWith(query);
}

function normalizeSuggestionSubtitle(path: string, name: string): string {
	if (path === `${name}.md`) return '';
	return path;
}

function isInsideFencedCodeBlock(state: EditorView['state'], lineNumber: number): boolean {
	let openLine: number | null = null;

	for (let n = 1; n <= state.doc.lines; n += 1) {
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

	for (let n = 1; n <= state.doc.lines; n += 1) {
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
