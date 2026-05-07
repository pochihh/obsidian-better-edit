/**
 * index.ts — Image Arrangement feature entry point
 *
 * Registers:
 *  - paste/drop handlers (via registerEvent)
 *  - the CM6 widget extension (via registerEditorExtension)
 */

import { Extension } from '@codemirror/state';
import { registerPasteDropHandlers } from './paste-handler';
import { createImageWidgetExtension } from './widget';
import type BetterEditPlugin from '../../main';

export function initImageFeature(plugin: BetterEditPlugin): void {
	registerPasteDropHandlers(plugin);
}

export function createImageExtension(plugin: BetterEditPlugin): Extension {
	return createImageWidgetExtension(plugin);
}
