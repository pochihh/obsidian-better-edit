import tseslint from 'typescript-eslint';
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";

export default tseslint.config(
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: [
						'eslint.config.js',
						'manifest.json'
					]
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json']
			},
		},
	},
	{
		files: ['scripts/**/*.mjs', '*.mjs'],
		languageOptions: {
			globals: {
				...globals.node,
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		files: ['tests/e2e/**/*.ts'],
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
		},
		rules: {
			'obsidianmd/prefer-active-doc': 'off',
			'obsidianmd/prefer-active-window-timers': 'off',
		},
	},
	globalIgnores([
		"node_modules",
		"dist",
		"test-results",
		"tests/e2e/playwright.config.ts",
		"esbuild.config.mjs",
		"eslint.config.js",
		"version-bump.mjs",
		"versions.json",
		"main.js",
	]),
);
