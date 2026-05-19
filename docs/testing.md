# Testing Notes

Better Edit currently relies on a mix of manual regression testing and targeted
logic isolation.

## Manual fixture vault

Use the files under [`test-vault/`](../test-vault/) as the primary regression
set for editor UX:

- `blocks-regression.md`
- `slash-command-regression.md`
- `text-styling-regression.md`
- `image-regression.md`
- `symbol-picker-regression.md`

These fixtures should be opened in Live Preview and tested against real editor
interactions, because many risks involve DOM geometry, selection behavior, and
Obsidian-owned rendering states.

## Planned automated tests

Add unit-style tests under `tests/` for pure logic and source transforms:

- block detection
- drop boundary normalization
- table separator normalization
- text-style delimiter normalization
- slash command state transitions
- shortcut matching

## Regression rule

Any bug fixed from live testing should be reflected in at least one of:

- a new fixture section in `test-vault/`
- a pure logic test under `tests/`
- both, when the bug has a deterministic transform rule
