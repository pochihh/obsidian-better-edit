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
| `feature` | New feature or capability |
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

Include a body only when the summary line alone is not enough to understand
what changed or why. Rules:

- Maximum **3 bullet points**
- Each bullet maximum **100 characters**
- No prose paragraphs — bullets only
- If the change requires more explanation than 3 bullets can hold, create a
  document in `docs/` describing it, and reference that file in the body instead:
  `see docs/<filename>.md`

### Strict no-add rules

Never include any of the following in a commit message:

- Creation or modification dates
- `Co-authored-by:` lines (Claude, Codex, any AI tool, any person)
- Author or co-author email addresses
- Contact information of any kind
- Tool names or version numbers used to generate the commit
- Any metadata not directly describing the code change

## Examples

```
feature(image): add paste handler with defaultPrevented check

chore(deps): add eslint-plugin-obsidianmd and tsconfig

docs: add full DESIGN.md with all four features

feature(image): implement CM6 widget with resize handles

fix(slash-cmd): close menu on Escape key

refactor(shared): extract block detection into block-model.ts
```

With a body:
```
feature(image): add placeholder HTML state

- Inserts <div data-placeholder="image"> via slash command
- Placeholder is immediately draggable as a block
- see docs/image-placeholder.md
```

## How to commit

```bash
git add -A                          # or stage specific files
git status                          # verify what's staged
git commit -m "<message>"
```
