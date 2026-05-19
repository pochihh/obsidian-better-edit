# Blocks Regression

## Wrapped paragraph

Select the long wrapped paragraph below and verify the gutter handle stays
aligned to the first rendered line from left gutter, content hover, and right
edge hover.

This is a deliberately long paragraph that should wrap in a narrow editor pane so the handle alignment and gutter reservation can be checked visually without changing the source structure.

## Table movement

| 1 | 2 |
| - | - |
| 3 | 4 |

Paragraph after table.

Checks:

- no in-cell Better Edit controls
- gutter handle appears for whole table
- moving the table preserves required blank lines around paragraph text

## Nested list

- top
	- child
		- grandchild
- next top

Checks:

- top-level items can be moved as full subtrees
- nested item handles remain reachable
- hover moving toward the handle keeps the same anchor position

## Setext heading

Heading line
---

Paragraph below.

Checks:

- setext heading moves as one unit
- dropping normal text onto the underline does not create accidental headings
