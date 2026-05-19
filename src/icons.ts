import { setIcon } from 'obsidian';
import type { SlashCommandDefinition } from './features/slash-command/settings';

type SvgIconDefinition = {
	viewBox: string;
	paths: string[];
};

export type ImageIconName =
	| 'caption'
	| 'crop'
	| 'replace'
	| 'alt-text'
	| 'copy'
	| 'duplicate'
	| 'delete'
	| 'more'
	| 'align-left'
	| 'align-center'
	| 'align-right'
	| 'align-float-left'
	| 'align-float-right'
	| 'add-image'
	| 'pop-out'
	| 'row-justify-left'
	| 'row-justify-center'
	| 'row-justify-right'
	| 'row-justify-space-between'
	| 'row-wrap'
	| 'row-align-items';

const SLASH_COMMAND_ICON_DEFINITIONS: Record<string, SvgIconDefinition> = {
	'heading-1': {
		viewBox: '0 0 20 20',
		paths: [
			'M4.1 4.825a.625.625 0 0 0-1.25 0v10.35a.625.625 0 0 0 1.25 0V10.4h6.4v4.775a.625.625 0 0 0 1.25 0V4.825a.625.625 0 1 0-1.25 0V9.15H4.1zM17.074 8.45a.6.6 0 0 1 .073.362q.003.03.003.063v6.3a.625.625 0 1 1-1.25 0V9.802l-1.55.846a.625.625 0 1 1-.6-1.098l2.476-1.35a.625.625 0 0 1 .848.25',
		],
	},
	'heading-2': {
		viewBox: '0 0 20 20',
		paths: [
			'M3.65 4.825a.625.625 0 1 0-1.25 0v10.35a.625.625 0 0 0 1.25 0V10.4h6.4v4.775a.625.625 0 0 0 1.25 0V4.825a.625.625 0 1 0-1.25 0V9.15h-6.4zm10.104 5.164c.19-.457.722-.84 1.394-.84.89 0 1.48.627 1.48 1.238 0 .271-.104.53-.302.746l-3.837 3.585a.625.625 0 0 0 .427 1.082h4.5a.625.625 0 1 0 0-1.25H14.5l2.695-2.518.027-.028c.406-.43.657-.994.657-1.617 0-1.44-1.299-2.488-2.731-2.488-1.128 0-2.145.643-2.548 1.608a.625.625 0 0 0 1.154.482',
		],
	},
	'heading-3': {
		viewBox: '0 0 20 20',
		paths: [
			'M3.65 4.825a.625.625 0 1 0-1.25 0v10.35a.625.625 0 0 0 1.25 0V10.4h6.4v4.775a.625.625 0 0 0 1.25 0V4.825a.625.625 0 1 0-1.25 0V9.15h-6.4zm9.152 4.467c.439-.845 1.358-1.393 2.346-1.393 1.432 0 2.73 1.048 2.73 2.488 0 .603-.235 1.15-.617 1.574.382.424.617.971.617 1.574 0 1.44-1.298 2.488-2.73 2.488-.988 0-1.907-.548-2.346-1.393a.625.625 0 0 1 1.11-.576c.21.405.692.719 1.236.719.89 0 1.48-.627 1.48-1.238 0-.612-.59-1.239-1.48-1.239h-.54a.625.625 0 1 1 0-1.25h.54c.89 0 1.48-.627 1.48-1.239s-.59-1.238-1.48-1.238c-.544 0-1.026.314-1.236.719a.625.625 0 0 1-1.11-.576',
		],
	},
	'bullet-list': {
		viewBox: '0 0 20 20',
		paths: [
			'M5 6.25a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0M7.5 5.625a.625.625 0 1 0 0 1.25h9.375a.625.625 0 1 0 0-1.25zM5 10a1.25 1.25 0 1 1-2.5 0A1.25 1.25 0 0 1 5 10m2.5-.625a.625.625 0 1 0 0 1.25h9.375a.625.625 0 1 0 0-1.25zM3.75 15a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5m3.75-1.875a.625.625 0 1 0 0 1.25h9.375a.625.625 0 1 0 0-1.25z',
		],
	},
	'numbered-list': {
		viewBox: '0 0 20 20',
		paths: [
			'M4.55 3.875a.625.625 0 0 1 .625.625v3a.625.625 0 1 1-1.25 0V5.51l-.287.143a.625.625 0 0 1-.56-1.118l1.192-.596a.6.6 0 0 1 .28-.064M7.5 5.625a.625.625 0 1 0 0 1.25h9.375a.625.625 0 1 0 0-1.25zM3.125 10.5c0-1.04.86-1.875 1.9-1.875s1.9.835 1.9 1.875c0 .506-.206.969-.535 1.305l-1.115 1.07h1.025a.625.625 0 1 1 0 1.25H3.75a.625.625 0 0 1-.433-1.075l2.194-2.106a.6.6 0 0 0 .164-.444c0-.33-.287-.625-.65-.625s-.65.295-.65.625a.625.625 0 1 1-1.25 0m4.375.125a.625.625 0 1 0 0 1.25h9.375a.625.625 0 1 0 0-1.25z',
		],
	},
	checkbox: {
		viewBox: '0 0 20 20',
		paths: [
			'M5.25 4.125h9.5c.621 0 1.125.504 1.125 1.125v9.5c0 .621-.504 1.125-1.125 1.125h-9.5a1.125 1.125 0 0 1-1.125-1.125v-9.5c0-.621.504-1.125 1.125-1.125m.125 1.25v9.25h9.25v-9.25z',
		],
	},
	quote: {
		viewBox: '0 0 20 20',
		paths: [
			'M7.75 5.25a.75.75 0 0 1 .75.75v4.5A3.25 3.25 0 0 1 5.25 13.75a.625.625 0 1 1 0-1.25A2 2 0 0 0 7.25 10.5H5.5A1.5 1.5 0 0 1 4 9V6.75a1.5 1.5 0 0 1 1.5-1.5zm7 0a.75.75 0 0 1 .75.75v4.5a3.25 3.25 0 0 1-3.25 3.25.625.625 0 1 1 0-1.25 2 2 0 0 0 2-2h-1.75A1.5 1.5 0 0 1 11 9V6.75a1.5 1.5 0 0 1 1.5-1.5z',
		],
	},
	'code-block': {
		viewBox: '0 0 20 20',
		paths: [
			'M12.6 3.172a.625.625 0 0 0-1.201-.344l-4 14a.625.625 0 0 0 1.202.344zM5.842 5.158a.625.625 0 0 1 0 .884L1.884 10l3.958 3.958a.625.625 0 0 1-.884.884l-4.4-4.4a.625.625 0 0 1 0-.884l4.4-4.4a.625.625 0 0 1 .884 0m8.316 0a.625.625 0 0 1 .884 0l4.4 4.4a.625.625 0 0 1 0 .884l-4.4 4.4a.625.625 0 0 1-.884-.884L18.116 10l-3.958-3.958a.625.625 0 0 1 0-.884',
		],
	},
	divider: {
		viewBox: '0 0 20 20',
		paths: [
			'M3.125 10a.625.625 0 0 1 .625-.625h12.5a.625.625 0 1 1 0 1.25H3.75A.625.625 0 0 1 3.125 10',
		],
	},
	'math-block': {
		viewBox: '0 0 20 20',
		// π — two vertical legs hanging from a horizontal bar
		paths: ['M3 5H17V6.5H14V16H12.5V6.5H7.5V16H6V6.5H3V5Z'],
	},
	image: {
		viewBox: '0 0 20 20',
		paths: [
			'M8.5 9.31a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3',
			'M2.375 6.25c0-1.174.951-2.125 2.125-2.125h11c1.174 0 2.125.951 2.125 2.125v7.5a2.125 2.125 0 0 1-2.125 2.125h-11a2.125 2.125 0 0 1-2.125-2.125zM4.5 5.375a.875.875 0 0 0-.875.875v5.491l1.996-1.995a.625.625 0 0 1 .883 0l1.98 1.98 4.137-4.137a.625.625 0 0 1 .883 0l2.871 2.87V6.25a.875.875 0 0 0-.875-.875zm11.875 6.852-3.312-3.312-4.137 4.136a.625.625 0 0 1-.884 0l-1.98-1.98-2.437 2.438v.241c0 .483.392.875.875.875h11a.875.875 0 0 0 .875-.875z',
		],
	},
};

function renderSvg(parent: HTMLElement, icon: SvgIconDefinition): void {
	const svg = parent.createSvg('svg');
	svg.setAttribute('viewBox', icon.viewBox);
	svg.setAttribute('aria-hidden', 'true');
	svg.setAttribute('focusable', 'false');
	for (const path of icon.paths) {
		svg.createSvg('path').setAttribute('d', path);
	}
}

export function renderSlashCommandIcon(parent: HTMLElement, command: SlashCommandDefinition): void {
	const icon = command.builtIn ? SLASH_COMMAND_ICON_DEFINITIONS[command.id] : undefined;
	if (icon !== undefined) {
		renderSvg(parent, icon);
		return;
	}

	setIcon(parent, command.icon);
}

export function renderImagePlaceholderIcon(parent: HTMLElement): void {
	renderSvg(parent, SLASH_COMMAND_ICON_DEFINITIONS.image!);
}

// Fill-based icon: a single SVG path rendered with fill="currentColor"
type FillIconDef = {
	viewBox: string;
	path: string;
};

// Stroke-based icon: one or more primitives rendered with stroke="currentColor", fill="none"
type StrokePrimitive =
	| { tag: 'line'; x1: number; y1: number; x2: number; y2: number; sw?: number }
	| { tag: 'rect'; x: number; y: number; w: number; h: number; rx?: number; sw?: number }
	| { tag: 'path'; d: string; sw?: number };

type StrokeIconDef = {
	viewBox: string;
	stroke: StrokePrimitive[];
	sw?: number;       // default stroke-width for all primitives
	linecap?: string;  // default stroke-linecap
};

type ImageIconDef = FillIconDef | StrokeIconDef;

const IMAGE_TOOLBAR_ICONS: Record<ImageIconName, ImageIconDef> = {
	caption: {
		viewBox: '0 0 20 20',
		path: 'M5.5 2.375A2.125 2.125 0 0 0 3.375 4.5v5.25c0 1.174.951 2.125 2.125 2.125H13a2.125 2.125 0 0 0 2.125-2.125V4.5A2.125 2.125 0 0 0 13 2.375zM4.625 4.5c0-.483.392-.875.875-.875H13c.483 0 .875.392.875.875v5.25a.875.875 0 0 1-.875.875H5.5a.875.875 0 0 1-.875-.875zm-1.25 9.62c0-.345.28-.625.625-.625h12a.625.625 0 1 1 0 1.25H4a.625.625 0 0 1-.625-.625m0 2.88c0-.345.28-.625.625-.625h8.55a.625.625 0 1 1 0 1.25H4A.625.625 0 0 1 3.375 17',
	},
	crop: {
		viewBox: '0 0 20 20',
		path: 'M5.625 2a.625.625 0 1 0-1.25 0v2.375H2a.625.625 0 1 0 0 1.25h2.375V13.5c0 1.174.951 2.125 2.125 2.125h7.875V18a.625.625 0 1 0 1.25 0v-2.375H18a.625.625 0 1 0 0-1.25h-2.375V6.5A2.125 2.125 0 0 0 13.5 4.375H5.625zm0 3.625H13.5c.483 0 .875.392.875.875v7.875H6.5a.875.875 0 0 1-.875-.875z',
	},
	replace: {
		viewBox: '0 0 20 20',
		path: 'm3.625 11.151 1.187-1.187a.625.625 0 1 1 .884.884l-2.254 2.254a.625.625 0 0 1-.884 0L.304 10.848a.625.625 0 0 1 .884-.884l1.187 1.187V10a7.625 7.625 0 0 1 12.813-5.587.625.625 0 1 1-.85.915A6.375 6.375 0 0 0 3.625 10zm14-2.302 1.187 1.187a.625.625 0 1 0 .884-.884l-2.254-2.254a.625.625 0 0 0-.884 0l-2.254 2.254a.625.625 0 1 0 .884.884l1.187-1.187V10a6.375 6.375 0 0 1-10.713 4.672.625.625 0 0 0-.85.915A7.625 7.625 0 0 0 17.625 10z',
	},
	duplicate: {
		viewBox: '0 0 20 20',
		path: 'M4.5 2.375A2.125 2.125 0 0 0 2.375 4.5V12c0 1.174.951 2.125 2.125 2.125h1.625v1.625c0 1.174.951 2.125 2.125 2.125h7.5a2.125 2.125 0 0 0 2.125-2.125v-7.5a2.125 2.125 0 0 0-2.125-2.125h-1.625V4.5A2.125 2.125 0 0 0 12 2.375zm8.375 3.75H8.25A2.125 2.125 0 0 0 6.125 8.25v4.625H4.5A.875.875 0 0 1 3.625 12V4.5c0-.483.392-.875.875-.875H12c.483 0 .875.392.875.875zm-5.5 2.125c0-.483.392-.875.875-.875h7.5c.483 0 .875.392.875.875v7.5a.875.875 0 0 1-.875.875h-7.5a.875.875 0 0 1-.875-.875z',
	},
	delete: {
		viewBox: '0 0 20 20',
		path: 'M8.806 8.505a.55.55 0 0 0-1.1 0v5.979a.55.55 0 1 0 1.1 0zm3.488 0a.55.55 0 0 0-1.1 0v5.979a.55.55 0 1 0 1.1 0z M6.386 3.925v1.464H3.523a.625.625 0 1 0 0 1.25h.897l.393 8.646A2.425 2.425 0 0 0 7.236 17.6h5.528a2.425 2.425 0 0 0 2.422-2.315l.393-8.646h.898a.625.625 0 1 0 0-1.25h-2.863V3.925c0-.842-.683-1.525-1.525-1.525H7.91c-.842 0-1.524.683-1.524 1.525M7.91 3.65h4.18c.15 0 .274.123.274.275v1.464H7.636V3.925c0-.152.123-.275.274-.275m-.9 2.99h7.318l-.39 8.588a1.175 1.175 0 0 1-1.174 1.122H7.236a1.175 1.175 0 0 1-1.174-1.122l-.39-8.589z',
	},
	more: {
		viewBox: '0 0 20 20',
		path: 'M4 11.375a1.375 1.375 0 1 0 0-2.75 1.375 1.375 0 0 0 0 2.75m6 0a1.375 1.375 0 1 0 0-2.75 1.375 1.375 0 0 0 0 2.75m6 0a1.375 1.375 0 1 0 0-2.75 1.375 1.375 0 0 0 0 2.75',
	},
	copy: {
		viewBox: '0 0 20 20',
		path: 'M7.375 2.375A1.625 1.625 0 0 0 5.75 4H4.5A1.625 1.625 0 0 0 2.875 5.625v11.75A1.625 1.625 0 0 0 4.5 19h11A1.625 1.625 0 0 0 17.125 17.375V5.625A1.625 1.625 0 0 0 15.5 4h-1.25A1.625 1.625 0 0 0 12.625 2.375zm0 1.25h5.25c.207 0 .375.168.375.375v.5a.375.375 0 0 1-.375.375H7.375A.375.375 0 0 1 7 4.5V4c0-.207.168-.375.375-.375zM4.5 5.25h1.25A1.625 1.625 0 0 0 7.375 6.875h5.25A1.625 1.625 0 0 0 14.25 5.25H15.5c.207 0 .375.168.375.375v11.75A.375.375 0 0 1 15.5 17.75h-11a.375.375 0 0 1-.375-.375V5.625c0-.207.168-.375.375-.375z',
	},
	'alt-text': {
		viewBox: '0 0 20 20',
		path: 'M3.375 5.625A1.625 1.625 0 0 1 5 4h10a1.625 1.625 0 0 1 1.625 1.625v.75a.625.625 0 1 1-1.25 0V5.625A.375.375 0 0 0 15 5.25h-4.375V16a.625.625 0 1 1-1.25 0V5.25H5a.375.375 0 0 0-.375.375v.75a.625.625 0 1 1-1.25 0z',
	},
	'align-left': {
		viewBox: '1.77 0 12.45 16',
		path: 'M2.4 2.175a.625.625 0 1 0 0 1.25h11.2a.625.625 0 1 0 0-1.25zm1.2 2A1.825 1.825 0 0 0 1.775 6v4c0 1.008.817 1.825 1.825 1.825H8A1.825 1.825 0 0 0 9.825 10V6A1.825 1.825 0 0 0 8 4.175zM3.025 6c0-.318.258-.575.575-.575H8c.318 0 .575.257.575.575v4a.575.575 0 0 1-.575.575H3.6A.575.575 0 0 1 3.025 10zM2.4 12.575a.625.625 0 1 0 0 1.25h11.2a.625.625 0 1 0 0-1.25z',
	},
	'align-center': {
		viewBox: '1.77 0 12.45 16',
		path: 'M2.4 2.175a.625.625 0 1 0 0 1.25h11.2a.625.625 0 1 0 0-1.25zm3.4 2h4.4c1.008 0 1.825.817 1.825 1.825v4a1.825 1.825 0 0 1-1.825 1.825H5.8A1.825 1.825 0 0 1 3.975 10V6c0-1.008.817-1.825 1.825-1.825M5.225 6v4c0 .318.258.575.575.575h4.4a.575.575 0 0 0 .575-.575V6a.575.575 0 0 0-.575-.575H5.8A.575.575 0 0 0 5.225 6M2.4 12.575a.625.625 0 1 0 0 1.25h11.2a.625.625 0 1 0 0-1.25z',
	},
	'align-right': {
		viewBox: '1.77 0 12.45 16',
		path: 'M2.4 2.175a.625.625 0 1 0 0 1.25h11.2a.625.625 0 1 0 0-1.25zm5.6 2A1.825 1.825 0 0 0 6.175 6v4c0 1.008.817 1.825 1.825 1.825h4.4A1.825 1.825 0 0 0 14.225 10V6A1.825 1.825 0 0 0 12.4 4.175zM7.425 6c0-.318.257-.575.575-.575h4.4c.318 0 .575.257.575.575v4a.575.575 0 0 1-.575.575H8A.575.575 0 0 1 7.425 10zM2.4 12.575a.625.625 0 1 0 0 1.25h11.2a.625.625 0 1 0 0-1.25z',
	},
	'align-float-left': {
		viewBox: '0 0 16 16',
		path: 'M1 2h5.5v6H1zM8 3h7v1.25H8zM8 5.25h6v1.25H8zM8 7.5h5v1.25H8zM1 10h14v1.25H1zM1 12.5h12v1.25H1z',
	},
	'align-float-right': {
		viewBox: '0 0 16 16',
		path: 'M9.5 2H15v6H9.5zM1 3h7v1.25H1zM1 5.25h6v1.25H1zM1 7.5h5v1.25H1zM1 10h14v1.25H1zM3 12.5h12v1.25H3z',
	},
	// Photo frame with a + badge — used to add an image to a row
	'add-image': {
		viewBox: '0 0 20 20',
		path: 'M4.5 2.375A2.125 2.125 0 0 0 2.375 4.5v11A2.125 2.125 0 0 0 4.5 17.625h9.128a.625.625 0 1 0 0-1.25H4.5a.875.875 0 0 1-.875-.875V4.5c0-.483.392-.875.875-.875h11c.483 0 .875.392.875.875v8.253a.625.625 0 1 0 1.25 0V4.5A2.125 2.125 0 0 0 15.5 2.375zM7.5 7.31a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0M3.625 14.5l3.995-3.996a.625.625 0 0 1 .884 0l1.98 1.98 2.137-2.137a.625.625 0 0 1 .883 0l1.371 1.37V4.5a.875.875 0 0 0-.875-.875h-11a.875.875 0 0 0-.875.875zm13-1.125a.625.625 0 0 1 .625.625v1.375H18.5a.625.625 0 1 1 0 1.25H17.25V18a.625.625 0 1 1-1.25 0v-1.375H14.625a.625.625 0 1 1 0-1.25H16V14a.625.625 0 0 1 .625-.625',
	},
	// Arrow pointing down to a baseline — pop image out of row to standalone below
	'pop-out': {
		viewBox: '0 0 20 20',
		path: 'M10 3.375a.625.625 0 0 1 .625.625v9.491l2.808-2.808a.625.625 0 0 1 .884.884l-3.875 3.875a.625.625 0 0 1-.884 0L5.683 11.567a.625.625 0 0 1 .884-.884L9.375 13.491V4A.625.625 0 0 1 10 3.375M3.375 17a.625.625 0 0 1 .625-.625h12a.625.625 0 1 1 0 1.25H4a.625.625 0 0 1-.625-.625',
	},
	// Reference: docs/ref/icons/start.svg — guide rails + box flush left
	'row-justify-left': {
		viewBox: '0 0 20 20',
		sw: 1.2, linecap: 'round',
		stroke: [
			{ tag: 'line', x1: 4.23, y1: 4.8,  x2: 15.77, y2: 4.8  },
			{ tag: 'line', x1: 4.23, y1: 15.2, x2: 15.77, y2: 15.2 },
			{ tag: 'rect', x: 4.23, y: 6.75, w: 6.5, h: 6.5, rx: 1.31 },
		],
	},
	// Reference: docs/ref/icons/center.svg — guide rails + box centered
	'row-justify-center': {
		viewBox: '0 0 20 20',
		sw: 1.2, linecap: 'round',
		stroke: [
			{ tag: 'line', x1: 4.23, y1: 4.8,  x2: 15.77, y2: 4.8  },
			{ tag: 'line', x1: 4.23, y1: 15.2, x2: 15.77, y2: 15.2 },
			{ tag: 'rect', x: 6.75, y: 6.75, w: 6.5, h: 6.5, rx: 1.31 },
		],
	},
	// Three columns right-weighted — row justify flex-end (no reference SVG yet)
	'row-justify-right': {
		viewBox: '0 0 20 20',
		path: 'M2.375 5.5c0-.483.392-.875.875-.875H4.75a.875.875 0 0 1 .875.875v5a.875.875 0 0 1-.875.875H3.25a.875.875 0 0 1-.875-.875zm1.25.125v4.75h.875V5.625zm4.75-1c0-.483.393-.875.875-.875h3.5c.483 0 .875.392.875.875v9a.875.875 0 0 1-.875.875h-3.5a.875.875 0 0 1-.875-.875zm1.25.125v8.75h2.25V5.625zm5-1c0-.483.392-.875.875-.875h3.5c.483 0 .875.392.875.875v9a.875.875 0 0 1-.875.875h-3.5a.875.875 0 0 1-.875-.875zm1.25.125v8.75h2.25V5.625z',
	},
	// Reference: docs/ref/icons/space_between.svg — rails + centered box + edge markers
	'row-justify-space-between': {
		viewBox: '0 0 20 20',
		sw: 1.2, linecap: 'round',
		stroke: [
			{ tag: 'line', x1: 4.23,  y1: 4.8,   x2: 15.77, y2: 4.8   },
			{ tag: 'line', x1: 4.23,  y1: 15.2,  x2: 15.77, y2: 15.2  },
			{ tag: 'rect', x: 6.75, y: 6.85, w: 6.5, h: 6.5, rx: 1.31 },
			{ tag: 'line', x1: 4.95,  y1: 7.63,  x2: 4.95,  y2: 12.56, sw: 0.8 },
			{ tag: 'line', x1: 15.05, y1: 7.63,  x2: 15.05, y2: 12.56, sw: 0.8 },
		],
	},
	// Wrap arrow — a line with a return arrow below, indicating flex-wrap
	'row-wrap': {
		viewBox: '0 0 20 20',
		path: 'M3.375 5.5a.625.625 0 0 1 .625-.625h12a.625.625 0 1 1 0 1.25H4a.625.625 0 0 1-.625-.625m13.509 3.317a.625.625 0 0 1 0 .884l-2.125 2.125a.625.625 0 0 1-.884-.884l1.058-1.067H8.5A1.875 1.875 0 0 0 6.625 11.75v.625H8a.625.625 0 1 1 0 1.25H6a.625.625 0 0 1-.625-.625v-1.25A3.125 3.125 0 0 1 8.5 8.625h6.433l-1.058-1.058a.625.625 0 0 1 .884-.884zM3.375 16a.625.625 0 0 1 .625-.625h5.5a.625.625 0 1 1 0 1.25H4a.625.625 0 0 1-.625-.625',
	},
	// Cross-axis alignment — two bars of different heights centered on a horizontal axis
	'row-align-items': {
		viewBox: '0 0 20 20',
		path: 'M3.375 10a.625.625 0 0 1 .625-.625h12a.625.625 0 1 1 0 1.25H4a.625.625 0 0 1-.625-.625M5.5 4.375A.625.625 0 0 1 6.125 5v10a.625.625 0 1 1-1.25 0V5A.625.625 0 0 1 5.5 4.375m3.25 2A.625.625 0 0 1 9.375 7v6a.625.625 0 1 1-1.25 0V7A.625.625 0 0 1 8.75 6.375m3.25-2A.625.625 0 0 1 12.625 5v10a.625.625 0 1 1-1.25 0V5a.625.625 0 0 1 .625-.625m3 2a.625.625 0 0 1 .625.625v5a.625.625 0 1 1-1.25 0V7a.625.625 0 0 1 .625-.625',
	},
};

export function buildImageToolbarIcon(doc: Document, name: ImageIconName): SVGElement {
	const ns = 'http://www.w3.org/2000/svg';
	const def = IMAGE_TOOLBAR_ICONS[name];
	const svg = doc.createElementNS(ns, 'svg');
	svg.setAttribute('aria-hidden', 'true');
	svg.setAttribute('width', '20');
	svg.setAttribute('height', '20');
	svg.setAttribute('viewBox', def.viewBox);
	svg.addClass('be-toolbar-icon');

	if ('path' in def) {
		// Fill-based: single path with currentColor fill
		svg.setAttribute('fill', 'currentColor');
		const path = doc.createElementNS(ns, 'path');
		path.setAttribute('d', def.path);
		svg.appendChild(path);
	} else {
		// Stroke-based: multiple primitives with currentColor stroke
		svg.setAttribute('fill', 'none');
		svg.setAttribute('stroke', 'currentColor');
		if (def.linecap) svg.setAttribute('stroke-linecap', def.linecap);
		svg.setAttribute('stroke-miterlimit', '10');
		for (const p of def.stroke) {
			const sw = String(p.sw ?? def.sw ?? 1);
			if (p.tag === 'line') {
				const el = doc.createElementNS(ns, 'line');
				el.setAttribute('x1', String(p.x1)); el.setAttribute('y1', String(p.y1));
				el.setAttribute('x2', String(p.x2)); el.setAttribute('y2', String(p.y2));
				el.setAttribute('stroke-width', sw);
				svg.appendChild(el);
			} else if (p.tag === 'rect') {
				const el = doc.createElementNS(ns, 'rect');
				el.setAttribute('x', String(p.x)); el.setAttribute('y', String(p.y));
				el.setAttribute('width', String(p.w)); el.setAttribute('height', String(p.h));
				if (p.rx !== undefined) { el.setAttribute('rx', String(p.rx)); el.setAttribute('ry', String(p.rx)); }
				el.setAttribute('stroke-width', sw);
				svg.appendChild(el);
			} else {
				const el = doc.createElementNS(ns, 'path');
				el.setAttribute('d', p.d);
				el.setAttribute('stroke-width', sw);
				svg.appendChild(el);
			}
		}
	}

	return svg;
}
