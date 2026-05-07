---
name: git-commit
description: >
  Use this skill when working in a git repository and deciding when to commit
  or how to write a commit message. Trigger on: "commit", "git commit",
  "should I commit", "write a commit message", "stage and commit", or after
  completing a meaningful unit of work in any coding session.
---

# Git Commit

## When to commit

Commit after each meaningful, self-contained unit of work:

- A feature or sub-feature is working (even if the broader task isn't done)
- A refactor is complete and tests/lint pass
- A bug is fixed
- Config or tooling is set up (e.g. eslint, tsconfig, package.json)
- A design or planning document is written or significantly updated
- Before switching to a different area of the codebase

Do NOT wait until everything is perfect. Small, frequent commits are easier to
review, revert, and understand.

Always run `npm run lint` before committing code changes.

## Commit message format

```
<type>(<scope>): <short summary>

[optional body]
```

### Types

| Type | When to use |
|---|---|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `refactor` | Code restructure, no behavior change |
| `chore` | Tooling, config, dependencies |
| `docs` | Documentation or design docs only |
| `style` | Formatting, naming (no logic change) |
| `test` | Tests only |
| `wip` | Work in progress — use sparingly |

### Scope

The feature or file area being changed. Keep it short.

Examples: `image`, `blocks`, `slash-cmd`, `settings`, `shared`, `skill`, `deps`

### Summary line

- Imperative mood: "add paste handler" not "added paste handler"
- Lowercase, no trailing period
- Max ~72 characters

### Body (optional)

Add a body when the *why* isn't obvious from the summary. Skip it for
straightforward changes.

## Examples

```
feat(image): add paste handler with defaultPrevented check

chore(deps): add eslint-plugin-obsidianmd and tsconfig

docs: add full DESIGN.md with all four features

feat(image): implement CM6 widget with resize handles

fix(slash-cmd): close menu on Escape key

refactor(shared): extract block detection into block-model.ts
```

## How to commit

```bash
git add -A                          # or stage specific files
git status                          # verify what's staged
git commit -m "<message>"
```

For multi-line messages:
```bash
git commit -m "feat(image): add placeholder HTML state

Introduces data-placeholder attribute for image blocks created
via slash command before an image file is selected."
```
