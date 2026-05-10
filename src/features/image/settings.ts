export interface ImageSettings {
	// General
	enabled: boolean;

	// Paste & Drop
	handlePastedImages: boolean;
	handleDroppedImages: boolean;

	// New image defaults
	defaultImageWidth: string;
	defaultImageAlignment: 'left' | 'center' | 'right';

	// Resize
	minImageWidthPx: number;
	minImageHeightPx: number;

	// Toolbar
	/** Image frame width (px) below which the toolbar collapses to compact (More-only) mode. */
	compactToolbarThresholdPx: number;
}

export const IMAGE_DEFAULT_SETTINGS: ImageSettings = {
	enabled: true,
	handlePastedImages: true,
	handleDroppedImages: true,
	defaultImageWidth: '100%',
	defaultImageAlignment: 'center',
	minImageWidthPx: 80,
	minImageHeightPx: 56,
	compactToolbarThresholdPx: 220,
};
