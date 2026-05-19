# Slash Command Regression

## Fresh trigger

Type `/` at the beginning of this line:


Checks:

- slash menu opens
- `Esc` closes it
- focusing the same `/...` line later does not reopen it automatically

## Non-leading slash

Type slash in the middle of this line and confirm it behaves like normal text.

## Leading slash before content

Move the caret to the beginning of the next line and type `/`.
Existing content should move down onto the next line instead of being deleted.

This line should stay intact.

## Suppression cases

```ts
slash should not open here
```

$$
slash should not open here either
$$

| 1 | 2 |
| - | - |
| 3 | 4 |

Table cell editing should not show slash hint/menu.
