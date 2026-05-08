export type ImageIconName =
	| 'caption'
	| 'crop'
	| 'more'
	| 'align-left'
	| 'align-center'
	| 'align-right'
	| 'align-float-left'
	| 'align-float-right';

type IconDef = {
	viewBox: string;
	path: string;
};

const ICONS: Record<ImageIconName, IconDef> = {
	caption: {
		viewBox: '2.87 0 10.97 16',
		path: 'M4.75 2.125c-1.036 0-1.875.84-1.875 1.875v3.5c0 1.036.84 1.875 1.875 1.875h5.5c1.036 0 1.875-.84 1.875-1.875V4c0-1.036-.84-1.875-1.875-1.875zM4.125 4c0-.345.28-.625.625-.625h5.5c.345 0 .625.28.625.625v3.5c0 .345-.28.625-.625.625h-5.5a.625.625 0 0 1-.625-.625zM3.5 10.375a.625.625 0 1 0 0 1.25h9.72a.625.625 0 1 0 0-1.25zm0 2.25a.625.625 0 1 0 0 1.25h6.84a.625.625 0 1 0 0-1.25z',
	},
	crop: {
		viewBox: '0 0 16 16',
		path: 'M4.625 1.6a.625.625 0 0 0-1.25 0v1.775H1.6a.625.625 0 1 0 0 1.25h1.775V10.8c0 1.008.817 1.825 1.825 1.825h6.175V14.4a.625.625 0 1 0 1.25 0v-1.775H14.4a.625.625 0 1 0 0-1.25h-1.775V5.2A1.825 1.825 0 0 0 10.8 3.375H4.625zm0 3.025H10.8c.318 0 .575.258.575.575v6.175H5.2a.575.575 0 0 1-.575-.575z',
	},
	more: {
		viewBox: '1.92 0 12.16 16',
		path: 'M3.2 6.725a1.275 1.275 0 1 0 0 2.55 1.275 1.275 0 0 0 0-2.55m4.8 0a1.275 1.275 0 1 0 0 2.55 1.275 1.275 0 0 0 0-2.55m4.8 0a1.275 1.275 0 1 0 0 2.55 1.275 1.275 0 0 0 0-2.55',
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
};

export function buildImageToolbarIcon(
	doc: Document,
	name: ImageIconName,
): SVGElement {
	const ns = 'http://www.w3.org/2000/svg';
	const def = ICONS[name];
	const svg = doc.createElementNS(ns, 'svg');
	svg.setAttribute('aria-hidden', 'true');
	svg.setAttribute('width', '16');
	svg.setAttribute('height', '16');
	svg.setAttribute('viewBox', def.viewBox);
	svg.setAttribute('fill', 'currentColor');
	svg.addClass('be-toolbar-icon');

	const path = doc.createElementNS(ns, 'path');
	path.setAttribute('d', def.path);
	svg.appendChild(path);

	return svg;
}
