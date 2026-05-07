import esbuild from 'esbuild';
import process from 'process';

const prod = process.argv[2] === 'production';

// Node built-ins — listed explicitly to avoid the banned builtin-modules package
const nodeBuiltins = [
	'assert', 'buffer', 'child_process', 'cluster', 'console', 'constants',
	'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http', 'https',
	'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'punycode',
	'querystring', 'readline', 'repl', 'stream', 'string_decoder', 'sys',
	'timers', 'tls', 'tty', 'url', 'util', 'v8', 'vm', 'zlib',
];

const context = await esbuild.context({
	entryPoints: ['src/main.ts'],
	bundle: true,
	external: [
		'obsidian',
		'electron',
		'@codemirror/autocomplete',
		'@codemirror/collab',
		'@codemirror/commands',
		'@codemirror/language',
		'@codemirror/lint',
		'@codemirror/search',
		'@codemirror/state',
		'@codemirror/text',
		'@codemirror/view',
		'@lezer/common',
		'@lezer/highlight',
		'@lezer/lr',
		...nodeBuiltins,
	],
	format: 'cjs',
	target: 'es2018',
	logLevel: 'info',
	sourcemap: prod ? false : 'inline',
	treeShaking: true,
	outfile: 'main.js',
	minify: prod,
});

if (prod) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
