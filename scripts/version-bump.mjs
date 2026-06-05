import { readFile, writeFile } from "node:fs/promises";

async function readJson(path) {
	return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, data) {
	await writeFile(path, `${JSON.stringify(data, null, "\t")}\n`, "utf8");
}

const pkg = await readJson("package.json");
const manifest = await readJson("manifest.json");
const versions = await readJson("versions.json").catch(() => ({}));

manifest.version = pkg.version;
versions[pkg.version] = manifest.minAppVersion;

await writeJson("manifest.json", manifest);
await writeJson("versions.json", versions);

console.log(`Synced manifest.json and versions.json for ${pkg.version} (minAppVersion ${manifest.minAppVersion}).`);
