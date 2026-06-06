import { mkdir, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { build } from 'esbuild';

const testsDir = 'tests';
const outDir = 'test-results/tmp/node-tests';
await mkdir(outDir, { recursive: true });

const entries = await readdir(testsDir);
const testFiles = entries
	.filter(name => name.endsWith('.test.ts'))
	.sort()
	.map(name => join(testsDir, name));

if (testFiles.length === 0) {
	console.log('No node tests found.');
	process.exit(0);
}

const bundledFiles = [];
for (const testFile of testFiles) {
	const output = join(outDir, `${basename(testFile, '.ts')}.mjs`);
	await build({
		entryPoints: [testFile],
		bundle: true,
		platform: 'node',
		format: 'esm',
		outfile: output,
		logLevel: 'silent',
	});
	bundledFiles.push(output);
}

const { run } = await import('node:test');
const { spec } = await import('node:test/reporters');
const { finished } = await import('node:stream/promises');

const stream = run({ files: bundledFiles });
stream.compose(spec()).pipe(process.stdout);
await finished(stream);
