export interface ImageSettings {
	// General
	enabled: boolean;

	// Image rows
	imageRows: boolean;

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

	// Appearance
	/** Border-radius applied to image corners (px). Set to 0 for square corners. */
	imageCornerRadiusPx: number;
}

export const IMAGE_DEFAULT_SETTINGS: ImageSettings = {
	enabled: true,
	imageRows: true,
	handlePastedImages: true,
	handleDroppedImages: true,
	defaultImageWidth: '100%',
	defaultImageAlignment: 'center',
	minImageWidthPx: 80,
	minImageHeightPx: 56,
	compactToolbarThresholdPx: 220,
	imageCornerRadiusPx: 4,
};
