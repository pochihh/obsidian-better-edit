import { App, Menu, Modal } from 'obsidian';
import { ImageCrop } from './html-schema';

interface RatioOption {
	label: string;
	ratio: number | null; // null = free; otherwise w/h
	shape: 'rect' | 'circle';
}

const RATIOS: RatioOption[] = [
	{ label: 'Free',   ratio: null, shape: 'rect'   },
	{ label: 'Square', ratio: 1,    shape: 'rect'   },
	{ label: '16 : 9', ratio: 16/9, shape: 'rect'   },
	{ label: '4 : 3',  ratio: 4/3,  shape: 'rect'   },
	{ label: '3 : 2',  ratio: 3/2,  shape: 'rect'   },
	{ label: 'Circle', ratio: 1,    shape: 'circle' },
];

export class CropModal extends Modal {
	private imgSrc: string;
	private initialCrop: ImageCrop | undefined;
	private docImgWidth: number;
	private docDisplayWidth: number;
	private onApply: (crop: ImageCrop, displayWidth: number) => void;

	private imgEl: HTMLImageElement | null = null;
	private imgRenderedW = 0;
	private imgRenderedH = 0;

	private cropX = 0;
	private cropY = 0;
	private cropW = 0;
	private cropH = 0;
	private activeRatio: RatioOption;

	private svgHoleRect: SVGRectElement | null = null;
	private cropSelectionEl: HTMLElement | null = null;
	private ratioLabelEl: HTMLElement | null = null;

	constructor(
		app: App,
		imgSrc: string,
		initialCrop: ImageCrop | undefined,
		docImgWidth: number,
		docDisplayWidth: number,
		onApply: (crop: ImageCrop, displayWidth: number) => void,
	) {
		super(app);
		this.imgSrc = imgSrc;
		this.initialCrop = initialCrop;
		this.docImgWidth = docImgWidth;
		this.docDisplayWidth = docDisplayWidth;
		this.onApply = onApply;
		this.activeRatio = RATIOS[0]!;
		if (initialCrop?.shape === 'circle') {
			this.activeRatio = RATIOS.find(r => r.shape === 'circle') ?? RATIOS[0]!;
		}
	}

	onOpen(): void {
		this.modalEl.addClass('be-crop-modal');
		this.contentEl.style.padding = '0';
		this.contentEl.addClass('be-crop-modal-content');
		this.buildUI();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private buildUI(): void {
		const { contentEl } = this;

		// ── Top bar ──────────────────────────────────────────────────────────
		const topBar = contentEl.createDiv({ cls: 'be-crop-topbar' });

		const ratioBtn = topBar.createDiv({ cls: 'be-crop-ratio-btn' });
		this.ratioLabelEl = ratioBtn.createSpan({ text: this.activeRatio.label });
		const chevron = ratioBtn.createSvg('svg', { attr: { viewBox: '0 0 16 16', width: '14', height: '14', fill: 'currentColor' } });
		chevron.createSvg('path', { attr: { d: 'm12.76 6.52-4.32 4.32a.62.62 0 0 1-.44.18.62.62 0 0 1-.44-.18L3.24 6.52a.63.63 0 0 1 0-.88c.24-.24.64-.24.88 0L8 9.52l3.88-3.88c.24-.24.64-.24.88 0s.24.64 0 .88' } });
		ratioBtn.addEventListener('click', (e) => this.showRatioMenu(e));

		topBar.createDiv({ cls: 'be-crop-title', text: 'Crop image' });

		const actions = topBar.createDiv({ cls: 'be-crop-topbar-actions' });
		const cancelBtn = actions.createEl('button', { cls: 'be-crop-action-btn', text: 'Cancel' });
		const saveBtn   = actions.createEl('button', { cls: 'be-crop-action-btn be-crop-save-btn', text: 'Save' });
		cancelBtn.addEventListener('click', () => this.close());
		saveBtn.addEventListener('click', () => this.applyAndClose());

		// ── Image area ───────────────────────────────────────────────────────
		const imageArea = contentEl.createDiv({ cls: 'be-crop-image-area' });
		const container = imageArea.createDiv({ cls: 'be-crop-container' });

		this.imgEl = container.createEl('img', {
			attr: { src: this.imgSrc, alt: 'Image to crop', draggable: 'false' },
		});

		// SVG mask overlay
		const svgNs = 'http://www.w3.org/2000/svg';
		const svg = document.createElementNS(svgNs, 'svg') as SVGSVGElement;
		svg.setAttribute('class', 'be-crop-svg-overlay');
		svg.setAttribute('width', '100%');
		svg.setAttribute('height', '100%');

		const defs = document.createElementNS(svgNs, 'defs');
		const mask = document.createElementNS(svgNs, 'mask');
		mask.setAttribute('id', 'be-crop-mask');
		const maskBg = document.createElementNS(svgNs, 'rect');
		maskBg.setAttribute('width', '100%');
		maskBg.setAttribute('height', '100%');
		maskBg.setAttribute('fill', 'white');
		this.svgHoleRect = document.createElementNS(svgNs, 'rect') as SVGRectElement;
		this.svgHoleRect.setAttribute('fill', 'black');
		mask.appendChild(maskBg);
		mask.appendChild(this.svgHoleRect);
		defs.appendChild(mask);
		svg.appendChild(defs);

		const overlayRect = document.createElementNS(svgNs, 'rect');
		overlayRect.setAttribute('fill', 'black');
		overlayRect.setAttribute('fill-opacity', '0.5');
		overlayRect.setAttribute('width', '100%');
		overlayRect.setAttribute('height', '100%');
		overlayRect.setAttribute('mask', 'url(#be-crop-mask)');
		svg.appendChild(overlayRect);
		container.appendChild(svg);

		// Crop selection + handles
		this.cropSelectionEl = container.createDiv({ cls: 'be-crop-selection' });
		const dragEls = this.cropSelectionEl.createDiv({ cls: 'be-crop-drag-elements' });

		for (const dir of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const) {
			const handle = dragEls.createDiv({ cls: `be-crop-handle be-crop-handle-${dir}` });
			handle.addEventListener('mousedown', (e) => this.onHandleMouseDown(e, dir));
		}

		// Drag the whole selection by its interior (handles stop propagation, so
		// any event reaching here is a click on the interior — not a handle)
		this.cropSelectionEl.addEventListener('mousedown', (e) => {
			if ((e.target as Element).closest('.be-crop-handle')) return;
			this.onMoveMouseDown(e);
		});

		if (this.imgEl.complete && this.imgEl.naturalWidth > 0) {
			this.onImageLoaded();
		} else {
			this.imgEl.addEventListener('load', () => this.onImageLoaded(), { once: true });
		}
	}

	private onImageLoaded(): void {
		if (!this.imgEl) return;
		this.imgRenderedW = this.imgEl.offsetWidth;
		this.imgRenderedH = this.imgEl.offsetHeight;

		const scale = this.docImgWidth > 0 ? this.imgRenderedW / this.docImgWidth : 1;

		if (this.initialCrop) {
			this.cropX = this.initialCrop.offsetX * scale;
			this.cropY = this.initialCrop.offsetY * scale;
			this.cropW = this.docDisplayWidth * scale;
			this.cropH = this.initialCrop.height * scale;
		} else {
			this.cropX = 0;
			this.cropY = 0;
			this.cropW = this.imgRenderedW;
			this.cropH = this.imgRenderedH;
		}

		if (this.activeRatio.shape === 'circle') {
			this.cropSelectionEl?.addClass('be-crop-circle');
		}

		this.updateCropUI();
	}

	private updateCropUI(): void {
		if (!this.cropSelectionEl || !this.svgHoleRect || this.imgRenderedW === 0) return;

		const x = Math.round(this.cropX), y = Math.round(this.cropY);
		const w = Math.round(this.cropW), h = Math.round(this.cropH);

		this.svgHoleRect.setAttribute('x', String(x));
		this.svgHoleRect.setAttribute('y', String(y));
		this.svgHoleRect.setAttribute('width', String(w));
		this.svgHoleRect.setAttribute('height', String(h));

		const iw = this.imgRenderedW, ih = this.imgRenderedH;
		this.cropSelectionEl.style.left   = `${(this.cropX / iw) * 100}%`;
		this.cropSelectionEl.style.top    = `${(this.cropY / ih) * 100}%`;
		this.cropSelectionEl.style.width  = `${(this.cropW / iw) * 100}%`;
		this.cropSelectionEl.style.height = `${(this.cropH / ih) * 100}%`;
	}

	private onHandleMouseDown(e: MouseEvent, dir: string): void {
		e.preventDefault();
		e.stopPropagation();
		const startX = e.clientX, startY = e.clientY;
		const ox = this.cropX, oy = this.cropY, ow = this.cropW, oh = this.cropH;
		const MIN = 40;

		const onMove = (me: MouseEvent) => {
			const dx = me.clientX - startX, dy = me.clientY - startY;
			let nx = ox, ny = oy, nw = ow, nh = oh;

			if (dir.includes('w')) { nx = Math.max(0, Math.min(ox + dx, ox + ow - MIN)); nw = ow + ox - nx; }
			if (dir.includes('e')) { nw = Math.max(MIN, Math.min(ow + dx, this.imgRenderedW - ox)); }
			if (dir.includes('n')) { ny = Math.max(0, Math.min(oy + dy, oy + oh - MIN)); nh = oh + oy - ny; }
			if (dir.includes('s')) { nh = Math.max(MIN, Math.min(oh + dy, this.imgRenderedH - oy)); }

			if (this.activeRatio.ratio !== null) {
				const r = this.activeRatio.ratio;
				if (dir === 'n' || dir === 's') {
					nw = nh * r;
					if (nx + nw > this.imgRenderedW) { nw = this.imgRenderedW - nx; nh = nw / r; }
				} else if (dir === 'e' || dir === 'w') {
					nh = nw / r;
					if (ny + nh > this.imgRenderedH) { nh = this.imgRenderedH - ny; nw = nh * r; }
				} else {
					nh = nw / r;
					if (nx + nw > this.imgRenderedW) { nw = this.imgRenderedW - nx; nh = nw / r; }
					if (ny + nh > this.imgRenderedH) { nh = this.imgRenderedH - ny; nw = nh * r; }
				}
			}

			this.cropX = nx; this.cropY = ny;
			this.cropW = Math.max(MIN, nw); this.cropH = Math.max(MIN, nh);
			this.updateCropUI();
		};
		const onUp = () => {
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
		};
		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
	}

	private onMoveMouseDown(e: MouseEvent): void {
		e.preventDefault();
		e.stopPropagation();
		const startX = e.clientX, startY = e.clientY;
		const ox = this.cropX, oy = this.cropY;

		const onMove = (me: MouseEvent) => {
			this.cropX = Math.max(0, Math.min(ox + me.clientX - startX, this.imgRenderedW - this.cropW));
			this.cropY = Math.max(0, Math.min(oy + me.clientY - startY, this.imgRenderedH - this.cropH));
			this.updateCropUI();
		};
		const onUp = () => {
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
		};
		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
	}

	private showRatioMenu(e: MouseEvent): void {
		const menu = new Menu();
		for (const option of RATIOS) {
			menu.addItem(item => {
				item.setTitle(option.label);
				if (this.activeRatio === option) item.setChecked(true);
				item.onClick(() => {
					this.activeRatio = option;
					if (this.ratioLabelEl) this.ratioLabelEl.textContent = option.label;
					if (this.cropSelectionEl) {
						option.shape === 'circle'
							? this.cropSelectionEl.addClass('be-crop-circle')
							: this.cropSelectionEl.removeClass('be-crop-circle');
					}
					if (option.ratio !== null) this.applyRatioToCurrentCrop(option.ratio);
					this.updateCropUI();
				});
			});
		}
		menu.showAtMouseEvent(e);
	}

	private applyRatioToCurrentCrop(ratio: number): void {
		let nw = this.cropW;
		let nh = nw / ratio;
		if (nh > this.imgRenderedH) { nh = this.imgRenderedH; nw = nh * ratio; }
		if (nw > this.imgRenderedW) { nw = this.imgRenderedW; nh = nw / ratio; }
		this.cropW = Math.round(nw);
		this.cropH = Math.round(nh);
		if (this.cropX + this.cropW > this.imgRenderedW) this.cropX = Math.max(0, this.imgRenderedW - this.cropW);
		if (this.cropY + this.cropH > this.imgRenderedH) this.cropY = Math.max(0, this.imgRenderedH - this.cropH);
	}

	private applyAndClose(): void {
		if (this.imgRenderedW === 0) { this.close(); return; }
		const scale = this.docImgWidth / this.imgRenderedW;
		const newCrop: ImageCrop = {
			offsetX:  Math.round(this.cropX * scale),
			offsetY:  Math.round(this.cropY * scale),
			height:   Math.round(this.cropH * scale),
			imgWidth: this.docImgWidth,
		};
		if (this.activeRatio.shape === 'circle') newCrop.shape = 'circle';
		this.onApply(newCrop, Math.max(40, Math.round(this.cropW * scale)));
		this.close();
	}
}
