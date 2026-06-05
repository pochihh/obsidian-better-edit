# Better Edit End-to-End Testing Workflow

> Status: proposed workflow, verified enough to start implementation on this machine.

## Goal

Create a repeatable Windows-based E2E harness that lets Haro test Better Edit inside real Obsidian against a disposable vault, collect evidence, and turn regressions into fixtures or automated assertions before publication.

## Verified local facts

- Repo: `D:\Projects\obsidian-better-edit` (`/mnt/d/Projects/obsidian-better-edit` from WSL)
- External test vault requested by Toby: `D:\Projects\test_vault` (`/mnt/d/Projects/test_vault`)
- Existing repo fixture vault: `D:\Projects\obsidian-better-edit\test-vault`
- Windows Obsidian executable: `C:\Users\Toby\AppData\Local\Programs\Obsidian\Obsidian.exe`
- Obsidian was already running with `Welcome - test_vault - Obsidian 1.12.7`
- WSL Node/npm: Node `v22.22.2`, npm `10.9.7`
- Windows Node/npm: Node `v22.22.2`, npm `10.9.7`
- Local Ollama endpoint available at `http://127.0.0.1:11435`; models include `gemma4:e4b`
- `npm install`, `npm run build`, and `npm run lint` pass after installing dependencies

## Principles

1. **Real Windows Obsidian is the system under test.** Unit tests can run in WSL, but E2E tests launch/control Windows Obsidian.
2. **Use `D:\Projects\test_vault` as a sandbox vault.** Toby confirmed this vault is pure test infrastructure. The harness may add fixture notes, reuse it for future plugins, or remove/recreate it completely when needed.
3. **Haro may close/restart Windows Obsidian for E2E.** Toby confirmed he will not use Windows Obsidian for now; the harness may decide when to restart it. Still prefer scoped preflight logging so failures are explainable.
4. **Copy built plugin artifacts into the vault.** Keep source in the repo; deploy `manifest.json`, `main.js`, and `styles.css` into `.obsidian/plugins/better-edit/` before launching Obsidian.
5. **Prefer DOM-level control through Chrome DevTools Protocol.** Obsidian is Electron/Chromium, so the target workflow is Playwright connecting to a debug port. If Obsidian cannot be launched with a debug port, the harness should report that clearly rather than using brittle blind clicks.
6. **Use local Ollama as an assistant, not the source of truth.** Ollama can help classify screenshots, suggest selectors, or parse complex HTML. Assertions should remain deterministic where possible.
7. **Every live bug becomes a fixture and/or assertion.** Manual findings should be converted into either repo `test-vault/` fixture content, E2E specs, pure logic tests, or all of the above.
8. **Release gate order:** smoke is always blocking; image is the first high-priority feature gate. All five features should become reliable, but known issues can be accepted explicitly.

## Proposed harness layout

```text
obsidian-better-edit/
  tests/
    e2e/
      README.md
      playwright.config.ts
      global-setup.ts
      specs/
        00-smoke.spec.ts
        10-text-styling.spec.ts
        20-slash-command.spec.ts
        30-symbol-picker.spec.ts
        40-image.spec.ts
        50-blocks.spec.ts
      support/
        paths.ts
        vault.ts
        obsidian.ts
        selectors.ts
        ollama.ts
  scripts/
    e2e-sync-plugin.mjs
    e2e-reset-vault.mjs
    e2e-launch-obsidian.ps1
  test-results/
    e2e/           # screenshots, traces, logs; gitignored
```

## Run sequence

### 1. Build and lint in WSL

```bash
cd /mnt/d/Projects/obsidian-better-edit
npm install
npm run build
npm run lint
```

### 2. Reset the test vault

The reset script should:

1. Ensure `D:\Projects\test_vault` exists.
2. Preserve or recreate `.obsidian/` settings needed for tests.
3. Copy regression markdown from repo `test-vault/*.md` into the external vault, or generate deterministic fixture notes.
4. Remove stale screenshots/temp files created by previous runs.

### 3. Install/enable the plugin in the vault

Copy artifacts:

```text
D:\Projects\obsidian-better-edit\manifest.json
D:\Projects\obsidian-better-edit\main.js
D:\Projects\obsidian-better-edit\styles.css
```

into:

```text
D:\Projects\test_vault\.obsidian\plugins\better-edit\
```

Then ensure Obsidian community plugin state enables `better-edit`, for example:

```json
// .obsidian/community-plugins.json
[
  "better-edit"
]
```

The script must not touch unrelated vaults.

### 4. Launch Windows Obsidian with automation enabled

Target approach from Windows PowerShell / Windows Node:

```powershell
$Obsidian = "$env:LOCALAPPDATA\Programs\Obsidian\Obsidian.exe"
$Vault = "D:\Projects\test_vault"
$DebugPort = 9222
Start-Process -FilePath $Obsidian -ArgumentList @(
  "--remote-debugging-port=$DebugPort",
  "--user-data-dir=$env:TEMP\better-edit-e2e-obsidian-profile",
  "obsidian://open?vault=test_vault"
)
```

Open question to verify during implementation: whether Obsidian honors `--user-data-dir` enough to bypass the existing single-instance process. If not, the E2E launcher needs a controlled preflight: detect existing Obsidian processes and ask Toby before closing/restarting them.

### 5. Connect Playwright to Obsidian

The smoke harness now runs Playwright under **Windows Node** after WSL builds/syncs the plugin. This is intentional: WSL cannot reliably reach Obsidian's Windows-only `127.0.0.1:9222` debug listener, while Windows Playwright can.

There are now three useful run modes:

```bash
# Default: build/reset/sync, reuse an existing CDP-enabled Obsidian if possible,
# otherwise restart/launch Windows Obsidian with the debug port.
npm run e2e:smoke

# Fast path: assume Windows Obsidian is already running with --remote-debugging-port=9222.
# This skips the launch/restart step and directly attaches Playwright.
npm run e2e:smoke:direct

# Clean path: always use the older force-relaunch workflow.
npm run e2e:smoke:fresh
```

The direct path saves time by keeping Windows Obsidian alive between runs. After copying fresh plugin artifacts, the smoke spec calls Obsidian's plugin API to disable/re-enable `better-edit`, so the in-memory plugin instance reloads from the current `main.js` without needing a full app restart.

Run the smoke gate from WSL:

```bash
npm run e2e:smoke
```

Preferred connection code:
```ts
import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const contexts = browser.contexts();
const pages = contexts.flatMap((context) => context.pages());
const page = pages.find((p) => p.url().startsWith("app://obsidian")) ?? pages[0];
await page.waitForSelector(".workspace-leaf.mod-active .markdown-source-view", { timeout: 30000 });
```

Fallback: if CDP cannot see an Obsidian page, do not fake success. Record the launch logs and fail the smoke test.

### 6. Deterministic smoke assertions

The first automated spec should verify only the basics:

1. Obsidian opens `test_vault`.
2. Better Edit plugin files are present in `.obsidian/plugins/better-edit`.
3. The plugin appears enabled in Obsidian settings/state.
4. A known fixture note opens in Live Preview.
5. A Better Edit command or UI affordance is visible/usable.
6. No fatal console errors are emitted during launch.

### 7. Feature regression specs

Use the existing fixture files as coverage anchors:

- `text-styling-regression.md`: selection wrapping, delimiter normalization, toolbar/menu behavior.
- `slash-command-regression.md`: slash trigger, filtering, accepting commands, cancel behavior.
- `symbol-picker-regression.md`: picker open/close, search/filter, insert symbol, shortcut matching.
- `image-regression.md`: image widget rendering, crop/arrange modal, selection state.
- `blocks-regression.md`: block detection, drag/drop, table and callout edge cases.

Each spec should:

1. Open a fixture note.
2. Put Obsidian in the required editor mode.
3. Execute the user action via keyboard/DOM selectors.
4. Assert the note content or DOM changed as expected.
5. Save screenshot/trace on failure.

### 8. Ollama-assisted low-level helpers

Use `gemma4:e4b` only for cases where strict selectors are not yet stable:

- Summarize current HTML/screenshot to identify candidate controls.
- Choose among visible buttons after deterministic filtering has narrowed the candidates.
- Explain failure screenshots for reports.

Do **not** let the model decide pass/fail for release checks. The release gate should use deterministic assertions.

### 9. Reporting

Every E2E run should leave:

```text
test-results/e2e/latest-summary.json
test-results/e2e/latest-report.md
test-results/e2e/screenshots/
test-results/e2e/traces/
```

Report fields:

- Commit/repo status summary
- Obsidian version
- Vault path
- Plugin manifest version
- Specs run / passed / failed
- Console errors
- Screenshots/traces for failures
- Manual follow-up notes

## Initial implementation tasks

1. ✅ Add npm dev dependencies for Playwright and test runner.
2. ✅ Add `scripts/e2e-sync-plugin.mjs` to copy build artifacts and enable `better-edit` in the test vault.
3. ✅ Add `scripts/e2e-reset-vault.mjs` to seed `D:\Projects\test_vault` from repo fixtures.
4. ✅ Add `scripts/e2e-launch-obsidian.ps1` with debug-port launch and scoped restart of existing Obsidian processes.
5. ✅ Add `tests/e2e/support/paths.ts` for E2E constants.
6. ✅ Add `tests/e2e/specs/00-smoke.spec.ts`; verified passing through Windows Playwright.
7. Next: add the image feature release gate.
8. Then expand the remaining feature specs: text styling, slash command, symbol picker, blocks.

## Implementation note

The smoke spec now attempts to dismiss Obsidian's first-run/trust-vault prompt before asserting plugin state. Toby manually clicked this prompt once during setup; the harness should handle likely button labels such as `Trust this vault`, `Trust author`, or `Enable plugins` on future fresh vault/profile runs.

The smoke spec also enables the plugin through Obsidian's plugin API if the config lists `better-edit` but the plugin is not yet loaded. In this environment, Obsidian read `community-plugins.json` but did not automatically instantiate the plugin on the first automated launch; calling `app.plugins.enablePluginAndSave('better-edit')` made the behavior deterministic and kept the test focused on whether the plugin can load successfully.

## Resolved decisions

1. Haro may close/restart Windows Obsidian for E2E because Toby is not using Windows Obsidian for now.
2. `D:\Projects\test_vault` is the canonical sandbox vault and may be reused, modified, or recreated.
3. Release-blocking order: smoke first, image next. All five features should become reliable, with known exceptions documented explicitly.
