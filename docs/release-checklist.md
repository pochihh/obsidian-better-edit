# Release Checklist

Use this checklist before publishing a beta or submitting a release to the
official Obsidian Community Plugins directory.

## Repository

- `README.md` is user-facing and up to date
- `LICENSE` exists at the repo root
- `manifest.json` description is accurate and concise
- `minAppVersion` matches the APIs actually used
- `versions.json` includes the release
- No local files are staged:
  - `data.json`
  - `.claude/settings.local.json`
  - temporary vault files

## Build artifacts

- `npm run check` passes
- `npm run build` passes
- `npm run lint` passes or known exceptions are documented
- `npm run check:release` confirms `package.json`, `package-lock.json`,
  `manifest.json`, and `versions.json` are synchronized
- Root `styles.css` has been regenerated
- Release artifact contains:
  - `manifest.json`
  - `main.js`
  - `styles.css`

## Obsidian review readiness

- No debug logging left in shipped code
- No unsafe or misleading settings text
- No hardcoded theme-hostile colors in shared UI
- No unnecessary permissions or network calls
- Desktop/mobile claims are truthful
- Disclosures in `README.md` are accurate

## Regression pass

Before tagging, complete the local regression pass and confirm the release-risk areas:

- blocks drag and drop plus block operation menu
- slash command trigger and menu behavior
- text styling toolbar and formatting transforms
- image arrangement interactions
- symbol picker settings and insertion paths

## Beta / submission

- Create a tagged release
- Beta-test through BRAT or manual install
- Collect at least one clean-vault test and one messy-vault test
- Re-check official Obsidian submission docs before shipping:
  - Submit your plugin
  - Developer policies / plugin checklist
