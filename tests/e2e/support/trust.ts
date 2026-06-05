import type { Page } from "@playwright/test";

const TRUST_BUTTON_NAMES = [
	/trust.*vault/i,
	/trust.*author/i,
	/enable.*plugins/i,
	/turn on.*community plugins/i,
	/allow/i,
];

export async function dismissTrustVaultPromptIfPresent(page: Page): Promise<boolean> {
	for (const name of TRUST_BUTTON_NAMES) {
		const button = page.getByRole("button", { name }).first();
		try {
			await button.click({ timeout: 1_500 });
			await page.waitForTimeout(500);
			return true;
		} catch {
			// Try the next likely Obsidian wording.
		}
	}

	return false;
}
