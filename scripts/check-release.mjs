import { readFile } from "node:fs/promises";

async function readJson(path) {
	return JSON.parse(await readFile(path, "utf8"));
}

const failures = [];
const pkg = await readJson("package.json");
const lock = await readJson("package-lock.json");
const manifest = await readJson("manifest.json");
const versions = await readJson("versions.json");

if (pkg.version !== manifest.version) {
	failures.push(`package.json version ${pkg.version} does not match manifest.json version ${manifest.version}`);
}

if (lock.version && lock.version !== pkg.version) {
	failures.push(`package-lock.json version ${lock.version} does not match package.json version ${pkg.version}`);
}

if (lock.packages?.[""]?.version && lock.packages[""].version !== pkg.version) {
	failures.push(`package-lock root version ${lock.packages[""].version} does not match package.json version ${pkg.version}`);
}

if (versions[pkg.version] !== manifest.minAppVersion) {
	failures.push(`versions.json entry for ${pkg.version} must be ${manifest.minAppVersion}`);
}

for (const field of ["id", "name", "version", "minAppVersion", "description", "author", "isDesktopOnly"]) {
	if (!(field in manifest)) failures.push(`manifest.json is missing ${field}`);
}

if (typeof manifest.isDesktopOnly !== "boolean") {
	failures.push("manifest.json isDesktopOnly must be a boolean");
}

if (failures.length > 0) {
	console.error("Release check failed:");
	for (const failure of failures) console.error(`- ${failure}`);
	process.exit(1);
}

console.log(`Release metadata OK for ${pkg.name} ${pkg.version} (minAppVersion ${manifest.minAppVersion}).`);
