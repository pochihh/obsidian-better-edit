export const BLOCK_CONTROL_BUTTON_WIDTH_PX = 22;
export const BLOCK_CONTROL_FULL_WIDTH_PX = BLOCK_CONTROL_BUTTON_WIDTH_PX * 2;

export interface BlockControlPlacementInput {
	contentLeft: number;
	boundaryLeft: number;
	showAddButton: boolean;
	viewportLeft?: number;
}

export interface BlockControlPlacement {
	left: number;
	showAddButton: boolean;
	width: number;
}

export function resolveBlockControlPlacement(input: BlockControlPlacementInput): BlockControlPlacement {
	const availableInlineSpace = Math.max(0, input.contentLeft - input.boundaryLeft);
	const showAddButton = input.showAddButton && availableInlineSpace >= BLOCK_CONTROL_FULL_WIDTH_PX;
	const width = showAddButton ? BLOCK_CONTROL_FULL_WIDTH_PX : BLOCK_CONTROL_BUTTON_WIDTH_PX;
	return {
		left: Math.max(input.viewportLeft ?? 0, input.contentLeft - width),
		showAddButton,
		width,
	};
}
