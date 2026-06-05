import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./specs",
	timeout: 60_000,
	expect: {
		timeout: 10_000,
	},
	retries: 0,
	reporter: [
		["list"],
		["html", { outputFolder: "../../test-results/e2e/html", open: "never" }],
		["json", { outputFile: "../../test-results/e2e/latest-summary.json" }],
	],
	use: {
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: "off",
	},
	outputDir: "../../test-results/e2e/artifacts",
});
