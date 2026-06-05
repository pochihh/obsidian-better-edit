# Testing Notes

Better Edit uses committed automated test code plus local, generated sandbox notes.
The public repo should not contain a full Obsidian test vault.

## Automated tests

Fast logic tests live under `tests/` and can run without Obsidian:

```bash
node --test tests/block-transform.test.mjs tests/block-model.test.mjs
```

The Windows Obsidian smoke harness lives under `tests/e2e/` with support scripts in
`scripts/e2e-*.mjs` and `scripts/e2e-*.ps1`.

Useful commands:

```bash
npm run e2e:reset
npm run e2e:sync
npm run e2e:smoke:direct
```

## Sandbox vault policy

The sandbox vault is generated locally at `D:\Projects\test_vault` on Windows or
`/mnt/d/Projects/test_vault` from WSL unless `BETTER_EDIT_E2E_VAULT` overrides it.

The reset script writes deterministic fixture notes into that vault. Those notes
are test data, not product documentation, so they are generated from the harness
and are not committed as a `test-vault/` folder.

## Test artifacts

Playwright reports, screenshots, traces, and deep-test evidence belong under
`test-results/`, which is gitignored.

## Regression rule

Any bug fixed from live testing should be reflected in at least one of:

- a pure logic test under `tests/`
- an E2E assertion under `tests/e2e/`
- a generated sandbox fixture in `scripts/e2e-reset-vault.mjs` when a note body is needed
- a documented known limitation in `docs/technical_notes/` when the behavior is intentionally out of scope
