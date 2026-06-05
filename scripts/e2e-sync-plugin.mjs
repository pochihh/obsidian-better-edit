/* eslint-disable obsidianmd/hardcoded-config-path -- E2E vault provisioning happens outside an Obsidian runtime, before Vault#configDir exists. */
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

function defaultVaultPath() {
	if (process.platform === "win32") {
		return "D:\\Projects\\test_vault";
	}
	return "/mnt/d/Projects/test_vault";
}

const vaultPath = process.env.BETTER_EDIT_E2E_VAULT ?? defaultVaultPath();
const pluginId = "better-edit";
const pluginDir = path.join(vaultPath, ".obsidian", "plugins", pluginId);

async function readJsonIfExists(filePath, fallback) {
	try {
		return JSON.parse(await readFile(filePath, "utf8"));
	} catch (error) {
		if (error?.code === "ENOENT") {
			return fallback;
		}
		throw error;
	}
}

async function main() {
	await mkdir(pluginDir, { recursive: true });

	for (const artifact of ["manifest.json", "main.js", "styles.css"]) {
		await cp(path.join(repoRoot, artifact), path.join(pluginDir, artifact), { force: true });
	}

	const obsidianDir = path.join(vaultPath, ".obsidian");
	const communityPluginsPath = path.join(obsidianDir, "community-plugins.json");
	const plugins = await readJsonIfExists(communityPluginsPath, []);
	if (!Array.isArray(plugins)) {
		throw new Error(`${communityPluginsPath} must be a JSON array`);
	}
	if (!plugins.includes(pluginId)) {
		plugins.push(pluginId);
	}
	await writeFile(communityPluginsPath, `${JSON.stringify(plugins, null, "\t")}\n`);

	const appPath = path.join(obsidianDir, "app.json");
	const app = await readJsonIfExists(appPath, {});
	app.safeMode = false;
	await writeFile(appPath, `${JSON.stringify(app, null, "\t")}\n`);

	console.log(JSON.stringify({ ok: true, vaultPath, pluginDir, pluginId }, null, 2));
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
