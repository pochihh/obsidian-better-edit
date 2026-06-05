import { expect, test } from "@playwright/test";
import { connectToObsidianPage, reloadPluginFromDisk } from "../support/obsidian";
import { PLUGIN_ID, VAULT_NAME } from "../support/paths";
import { dismissTrustVaultPromptIfPresent } from "../support/trust";

test("Better Edit loads in the Windows Obsidian sandbox vault", async () => {
	const { page, close } = await connectToObsidianPage();
	try {
		await page.waitForFunction(() => Boolean(window.document.body), null, { timeout: 30_000 });
		await dismissTrustVaultPromptIfPresent(page);
		await page.waitForFunction(() => Boolean((window as typeof window & { app?: unknown }).app), null, { timeout: 30_000 });
		await reloadPluginFromDisk(page, PLUGIN_ID);

		const state = await page.evaluate(async (pluginId) => {
			type PluginManager = {
				enabledPlugins?: Set<string> | string[];
				plugins?: Record<string, unknown>;
				isEnabled?: (id: string) => boolean;
				enablePluginAndSave?: (id: string) => Promise<void>;
			};
			type ObsidianApp = {
				plugins?: PluginManager;
				workspace?: unknown;
				vault?: { getName?: () => string };
			};
			const app = (window as typeof window & { app?: ObsidianApp }).app;
			if (!app?.plugins?.isEnabled?.(pluginId)) {
				await app?.plugins?.enablePluginAndSave?.(pluginId);
			}
			const enabledPlugins = app?.plugins?.enabledPlugins;
			const enabled = Boolean(app?.plugins?.isEnabled?.(pluginId)) || (enabledPlugins instanceof Set
				? enabledPlugins.has(pluginId)
				: Array.isArray(enabledPlugins) && enabledPlugins.includes(pluginId));
			const loaded = Boolean(app?.plugins?.plugins?.[pluginId]);
			return {
				bodyClass: document.body.className,
				enabled,
				loaded,
				title: document.title,
				url: location.href,
				vaultName: app?.vault?.getName?.(),
			};
		}, PLUGIN_ID);

		expect(state.vaultName).toBe(VAULT_NAME);
		expect(state.enabled).toBe(true);
		expect(state.loaded).toBe(true);
		expect(state.bodyClass).toContain("be-image-rows-active");
		expect(state.title).toContain("Obsidian");
	} finally {
		await close();
	}
});
