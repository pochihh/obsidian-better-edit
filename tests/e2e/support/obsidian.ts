import { chromium, type Page } from "@playwright/test";
import { CDP_ENDPOINT } from "./paths";

export async function connectToObsidianPage(): Promise<{ page: Page; close: () => Promise<void> }> {
	const browser = await chromium.connectOverCDP(CDP_ENDPOINT);
	const page = await findObsidianPage(browser.contexts().flatMap((context) => context.pages()));
	return {
		page,
		close: async () => {
			await browser.close();
		},
	};
}

export async function reloadPluginFromDisk(page: Page, pluginId: string): Promise<void> {
	await page.evaluate(async (id) => {
		type PluginManager = {
			disablePluginAndSave?: (pluginId: string) => Promise<void>;
			enablePluginAndSave?: (pluginId: string) => Promise<void>;
			isEnabled?: (pluginId: string) => boolean;
			plugins?: Record<string, unknown>;
		};
		type ObsidianApp = { plugins?: PluginManager };
		const app = (window as typeof window & { app?: ObsidianApp }).app;
		if (!app?.plugins?.enablePluginAndSave) {
			throw new Error("Obsidian plugin manager is unavailable");
		}
		if (app.plugins.plugins?.[id] || app.plugins.isEnabled?.(id)) {
			await app.plugins.disablePluginAndSave?.(id);
		}
		await app.plugins.enablePluginAndSave(id);
	}, pluginId);
}

async function findObsidianPage(pages: Page[]): Promise<Page> {
	const deadline = Date.now() + 30_000;
	let candidates = pages;

	while (Date.now() < deadline) {
		for (const page of candidates) {
			const url = page.url();
			const title = await page.title().catch(() => "");
			if (url.startsWith("app://obsidian") || title.includes("Obsidian")) {
				return page;
			}
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
		candidates = candidates.flatMap((page) => page.context().pages());
	}

	const seenPages: string[] = [];
	for (const page of candidates) {
		const title = await page.title().catch(() => "");
		seenPages.push(`${page.url()} / ${title}`);
	}
	throw new Error(`Unable to find Obsidian page. Saw pages: ${seenPages.join(" | ")}`);
}
