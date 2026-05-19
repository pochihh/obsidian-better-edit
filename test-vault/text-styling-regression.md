# Text Styling Regression

## Basic nesting

alpha beta gamma

Checks:

- bold then italic => both
- italic then bold => both
- highlight stays outermost

## Overlap normalization

**ABCD**EF

Check:

- selecting `CD**EF` and applying bold should become `**ABCDEF**`

## Inline equation

E = mc^2 where c is the speed of light

Check:

- inline equation wraps as `$...$`
- backticks inside selection do not break formatting rules unexpectedly

## Link picker

select this text

Checks:

- page mode suggests notes from the vault
- Enter inserts selected suggestion
- markdown link mode supports typed destinations
