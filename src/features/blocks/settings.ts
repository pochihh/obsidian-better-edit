export interface BlocksSettings {
	enabled: boolean;
	showAddButton: boolean;
	enableListItemDrag: boolean;
	enableHtmlBlockDrag: boolean;
}

export const BLOCKS_DEFAULT_SETTINGS: BlocksSettings = {
	enabled: true,
	showAddButton: true,
	enableListItemDrag: true,
	enableHtmlBlockDrag: true,
};
