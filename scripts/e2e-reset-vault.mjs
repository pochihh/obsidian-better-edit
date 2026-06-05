/* eslint-disable obsidianmd/hardcoded-config-path -- E2E vault provisioning happens outside an Obsidian runtime, before Vault#configDir exists. */
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

function defaultVaultPath() {
	if (process.platform === "win32") {
		return "D:\\Projects\\test_vault";
	}
	return "/mnt/d/Projects/test_vault";
}

const vaultPath = process.env.BETTER_EDIT_E2E_VAULT ?? defaultVaultPath();

const FIXTURES = {
	"blocks-regression.md": "# Blocks Regression\n\n## Wrapped paragraph\n\nSelect the long wrapped paragraph below and verify the gutter handle stays\naligned to the first rendered line from left gutter, content hover, and right\nedge hover.\n\nThis is a deliberately long paragraph that should wrap in a narrow editor pane so the handle alignment and gutter reservation can be checked visually without changing the source structure.\n\n## Table movement\n\n| 1 | 2 |\n| - | - |\n| 3 | 4 |\n\nParagraph after table.\n\nChecks:\n\n- no in-cell Better Edit controls\n- gutter handle appears for whole table\n- moving the table preserves required blank lines around paragraph text\n\n## Nested list\n\n- top\n\t- child\n\t\t- grandchild\n- next top\n\nChecks:\n\n- top-level items can be moved as full subtrees\n- nested item handles remain reachable\n- hover moving toward the handle keeps the same anchor position\n\n## Setext heading\n\nHeading line\n---\n\nParagraph below.\n\nChecks:\n\n- setext heading moves as one unit\n- dropping normal text onto the underline does not create accidental headings\n",
	"image-regression.md": "# Image Regression\n\nUse this file for manual image arrangement testing.\n\nSuggested checks:\n\n- paste image into note\n- drop external image into note\n- resize\n- align left / center / right\n- caption edit\n- replace source\n- alt text popover\n- crop / circle crop\n- drag and drop image block with block controls\n",
	"slash-command-regression.md": "# Slash Command Regression\n\n## Fresh trigger\n\nType `/` at the beginning of this line:\n\n\nChecks:\n\n- slash menu opens\n- `Esc` closes it\n- focusing the same `/...` line later does not reopen it automatically\n\n## Non-leading slash\n\nType slash in the middle of this line and confirm it behaves like normal text.\n\n## Leading slash before content\n\nMove the caret to the beginning of the next line and type `/`.\nExisting content should move down onto the next line instead of being deleted.\n\nThis line should stay intact.\n\n## Suppression cases\n\n```ts\nslash should not open here\n```\n\n$$\nslash should not open here either\n$$\n\n| 1 | 2 |\n| - | - |\n| 3 | 4 |\n\nTable cell editing should not show slash hint/menu.\n",
	"symbol-picker-regression.md": "# Symbol Picker Regression\n\nChecks:\n\n- right-click editor menu shows `Insert symbol or emoji`\n- plugin-managed shortcut opens picker\n- command palette entry opens picker\n- recent symbols update after insertion\n- settings shortcut badge records and resets correctly\n",
	"text-styling-regression.md": "# Text Styling Regression\n\n## Basic nesting\n\nalpha beta gamma\n\nChecks:\n\n- bold then italic => both\n- italic then bold => both\n- highlight stays outermost\n\n## Overlap normalization\n\n**ABCD**EF\n\nCheck:\n\n- selecting `CD**EF` and applying bold should become `**ABCDEF**`\n\n## Inline equation\n\nE = mc^2 where c is the speed of light\n\nCheck:\n\n- inline equation wraps as `$...$`\n- backticks inside selection do not break formatting rules unexpectedly\n\n## Link picker\n\nselect this text\n\nChecks:\n\n- page mode suggests notes from the vault\n- Enter inserts selected suggestion\n- markdown link mode supports typed destinations\n"
};

async function writeMarkdownFixtures() {
	for (const [name, contents] of Object.entries(FIXTURES)) {
		await writeFile(path.join(vaultPath, name), contents, "utf8");
	}
}

async function main() {
	await mkdir(vaultPath, { recursive: true });
	await mkdir(path.join(vaultPath, ".obsidian"), { recursive: true });
	await rm(path.join(vaultPath, ".trash"), { recursive: true, force: true });
	await rm(path.join(vaultPath, "Better Edit E2E Scratch.md"), { force: true });
	await writeMarkdownFixtures();
	console.log(JSON.stringify({ ok: true, vaultPath, fixtureCount: Object.keys(FIXTURES).length }, null, 2));
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
