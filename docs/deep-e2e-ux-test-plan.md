# Better Edit Deep E2E + UX Polish Test Plan

Scope: `D:\Projects\obsidian-better-edit` tested in real Windows Obsidian against `D:\Projects\test_vault`.

Principle: this phase is for discovery. Record bugs/improvements in `D:\Projects\test_vault\reproduce.md`; discuss before fixing code, except the already-approved text-toolbar icon sizing workflow test.

## 0. Operating protocol for long/deep testing

1. Keep generated notes in `D:\Projects\test_vault` only.
2. Keep automation/report artifacts in `D:\Projects\obsidian-better-edit\test-results\e2e\`.
3. Separate findings into:
   - plugin bugs,
   - UX/polish improvements,
   - accessibility/keyboard issues,
   - performance/console issues,
   - harness-only limitations.
4. For every finding, write:
   - ID,
   - feature(s),
   - setting combination,
   - reproduction steps,
   - expected/actual,
   - severity,
   - screenshot/trace path,
   - whether manual confirmation is needed.
5. Do not bundle fixes. After testing, review findings with Toby and select fixes.
6. Token/context discipline:
   - summarize each completed feature pass into `reproduce.md` or `test-results/e2e/deep/<run-id>/summary.md`,
   - store raw DOM/screenshot evidence as files instead of keeping it in chat,
   - periodically inspect concise report files rather than re-reading long traces,
   - if a run becomes long, checkpoint findings before continuing.

## 1. Test matrix dimensions

### 1.1 Feature toggles

Feature namespaces from current settings:

- Image Arrangement
- Blocks Drag and Drop
- Slash Commands
- Text Styling
- Symbol & Emoji Picker

Primary combinations:

| Case | Image | Blocks | Slash | Text | Symbol | Purpose |
|---|---:|---:|---:|---:|---:|---|
| A | on | on | on | on | on | normal all-features integration |
| B | off | on | on | on | on | image disabled should remove image widgets/classes only |
| C | on | off | on | on | on | blocks disabled should remove gutters/drag handles only |
| D | on | on | off | on | on | slash disabled should not show slash menu |
| E | on | on | on | off | on | text toolbar disabled should not appear |
| F | on | on | on | on | off | symbol picker disabled shortcuts/context should not appear |
| G | off | off | off | off | off | plugin inert/no UI pollution baseline |
| H | on | on | off | off | off | image+blocks interaction only |
| I | off | off | on | on | on | text insertion overlays interaction only |
| J | on | off | off | on | on | image rendering plus text overlays no gutter |

Secondary setting-level combinations:

- Image rows active/inactive
- Image placeholder/import/replacement flows enabled/disabled if exposed
- Blocks add button on/off
- Blocks list-item drag on/off
- Blocks HTML-block drag on/off
- Slash command individual command enabled/disabled
- Symbol context menu enabled/disabled
- Text styling enabled/disabled

## 2. Fixtures to create in test vault

Create deterministic notes:

1. `Deep - Text Styling.md`
   - plain text selections
   - bold/italic nested markdown
   - highlight + bold overlaps
   - inline code/math candidates
   - multi-line selections
   - fenced code block and math block suppression cases
   - wikilink and URL link targets

2. `Deep - Slash Commands.md`
   - blank line contexts
   - paragraph contexts
   - list contexts
   - table contexts
   - heading contexts
   - code fence suppression contexts

3. `Deep - Symbols.md`
   - search target line
   - emoji/common symbol insertion line
   - math-heavy line
   - CJK/Unicode adjacent text

4. `Deep - Images.md`
   - HTML placeholders
   - standalone image embeds
   - image rows
   - captions/alt text
   - float/align cases
   - narrow page/long caption stress

5. `Deep - Blocks.md`
   - paragraphs
   - nested lists
   - tasks
   - headings
   - blockquotes
   - tables
   - code fences
   - HTML blocks
   - image widgets inside blocks

6. `Deep - Integrated Torture.md`
   - a page mixing all above in one document to test overlay collisions.

## 3. Feature-specific deep tests

### 3.1 Text Styling

Functional checks:

- Toolbar appears only when non-empty text is selected.
- Toolbar does not appear for whitespace-only selection.
- Toolbar hides on Escape, click outside, scroll as intended.
- Bold, italic, strikethrough, highlight apply and remove correctly.
- Inline code and inline equation apply only to valid single-line selections.
- Disabled state appears for invalid code/math selections containing newline or delimiter.
- Active state is correct when cursor/selection is already inside formatting.
- Nested formatting cases:
  - bold inside highlight,
  - italic inside bold,
  - removing bold from bold+italic text does not corrupt italic,
  - highlight wrapping and unwrapping preserves inner formatting.
- Link flow:
  - page link mode existing note suggestion,
  - page link mode no matching note creates `[[target]]`,
  - URL mode creates `[text](url)`,
  - empty input does not mutate text,
  - keyboard navigation and Enter behavior.

UX/polish checks:

- Toolbar position near selection: above/below fallback, viewport edge clamping, no overlap with selected text when avoidable.
- Icon visual balance, hover state, active state, disabled opacity.
- Tooltip/title text clarity.
- Link panel copy: understandable, not too wordy, good placeholder text.
- Keyboard-only usability.

### 3.2 Slash Commands

Functional checks:

- Typing `/` opens menu in valid context.
- Filtering by command name and aliases.
- Arrow navigation, Enter, Escape, click selection.
- Commands insert expected markdown:
  - H1/H2/H3,
  - bullet list,
  - numbered list,
  - checkbox,
  - quote,
  - code block,
  - divider,
  - math block,
  - image placeholder.
- Disabled individual commands are omitted or not executable.
- Slash menu does not appear inside code fences/math blocks if intended.
- Backspacing/removing slash closes menu cleanly.

UX/polish checks:

- Menu size/position near cursor.
- Empty state clarity.
- Icons visually consistent with other toolbar icons.
- Command descriptions concise and scannable.
- Keyboard selection remains visible while scrolling.

### 3.3 Symbol & Emoji Picker

Functional checks:

- Shortcut opens picker.
- Context menu path opens picker if enabled.
- Search filters Greek/math/arrows/emoji/symbol categories.
- Clicking inserts at cursor and closes/preserves focus as intended.
- Keyboard navigation and Enter insertion.
- Escape closes without mutation.
- Disabled context menu or disabled feature suppresses UI.
- Unicode insertion adjacent to CJK/ASCII/math text is not corrupted.

UX/polish checks:

- Search input autofocus.
- Category grouping/readability.
- Empty state and no-results copy.
- Picker position near cursor or stable modal placement.
- Visual density and hover/selected states.

### 3.4 Image Arrangement

Functional checks:

- Placeholder HTML converts to Better Edit widget.
- Placeholder menu actions work.
- Image embed renders widget and toolbar.
- Align left/center/right and float left/right mutate markdown/html as expected.
- Caption add/edit/remove.
- Alt text add/edit/remove.
- Replace/copy/duplicate/delete flows.
- Resize handles and persisted dimensions.
- Image rows:
  - create row,
  - add image to row,
  - pop out image,
  - row justify left/center/right/space-between,
  - row wrap on/off,
  - row align-items behavior,
  - drag reorder images within row.
- Image feature disabled leaves raw Obsidian rendering and removes Better Edit classes.

UX/polish checks:

- Toolbar does not cover important image content too aggressively.
- Small images/narrow pane collapse gracefully.
- More menu is discoverable.
- Captions/alt text panels have clear copy.
- Drag indicators are visible but not noisy.

### 3.5 Blocks Drag and Drop

Functional checks:

- Block gutter class appears only when enabled.
- Handle appears on paragraph hover.
- Add button behavior inserts a new block at expected location.
- Drag reorder paragraphs.
- Drag reorder list items, nested list items, task items.
- Drag HTML blocks only when setting enabled.
- Drag tables/quotes/headings/code fences: either works safely or is intentionally suppressed.
- Drop indicators align to correct target.
- Undo/redo after drag and add button.
- Blocks disabled removes handles/add buttons without affecting image feature.

UX/polish checks:

- Handle hit target and cursor feel.
- Add button discoverability vs visual noise.
- No flicker when moving across adjacent lines.
- Handles do not obscure text or image controls.

## 4. Cross-feature integration tests

1. Text toolbar + slash menu:
   - selected text toolbar visible, then type `/` elsewhere; no stale toolbar/menu collision.
2. Text link panel + symbol picker:
   - link popover open, Escape behavior, shortcut conflict behavior.
3. Blocks + image widgets:
   - hover image row/placeholder and block handle nearby; controls do not overlap badly.
4. Slash image placeholder + image arrangement:
   - slash command inserts placeholder; image feature immediately renders widget.
5. Blocks disabled + image enabled:
   - image row toolbar still works without block gutters.
6. Image disabled + blocks enabled:
   - block handles operate around raw image markdown/html.
7. All disabled:
   - no Better Edit UI remains visible after reload; no console errors.
8. Settings toggled while UI is open:
   - open toolbar/menu/picker, toggle feature off, UI closes or becomes inert cleanly.
9. Multiple panes/tabs:
   - active pane only receives overlays; inactive panes do not show stale toolbars.
10. Obsidian light/dark theme and zoom/pane width:
   - screenshots at normal, narrow, and wide layouts.

## 5. Accessibility and keyboard pass

- Every interactive control has aria-label/title where applicable.
- Tab/Shift+Tab order is logical in popovers/panels.
- Escape closes the topmost Better Edit UI first.
- Enter/Arrow behavior matches menus.
- No keyboard trap.
- Focus returns to editor after closing/applying.
- Visual contrast acceptable in light/dark modes.

## 6. Performance/stability pass

- Console error/warning capture during each run.
- Repeated open/close cycles for each overlay, looking for duplicate stale DOM nodes.
- Long note with many images/blocks: measure overlay creation count and responsiveness.
- Plugin reload after settings changes: no orphan toolbars/handlers.
- Memory-ish proxy: count `.be-*` floating elements before/after reload/open/close cycles.

## 7. Automation deliverables

- `test-results/e2e/deep/<timestamp>/report.json`
- `test-results/e2e/deep/<timestamp>/report.md`
- screenshots per feature and combination
- `D:\Projects\test_vault\reproduce.md` updated with all actionable findings
- maintained specs promoted from stable ad-hoc tests only after the workflow proves reliable

## 8. First next steps after icon workflow

1. Promote the icon sizing check into a reusable E2E helper/spec if Toby accepts the new visual size.
2. Implement reliable block drag/drop assertion.
3. Build the deep fixture notes.
4. Run the all-features baseline pass.
5. Run the feature-toggle matrix.
6. Run UX/accessibility polish pass and record suggestions.

---

# 9. Edge-case expansion pass — required before publication

This section upgrades the plan from normal feature coverage to adversarial pre-release exploration. Many outputs may become documented known limits rather than bugs. Still record them because mature plugins usually fail at boundaries, combinations, and recovery paths, not at happy paths.

## 9.1 Finding classification: bug vs known limit vs polish

For each surprising behavior, classify it explicitly:

| Classification | Meaning | Release action |
|---|---|---|
| Bug | Data loss, wrong markdown mutation, broken UI, console error, regression, or contradiction of settings/docs | Discuss and likely fix |
| UX polish | Works but feels cramped, confusing, visually noisy, hard to discover, or inconsistent | Discuss and prioritize |
| Known limit | Boundary case intentionally unsupported or too expensive/risky pre-release | Document in docs/reproduce.md and maybe user docs |
| Harness limit | Automation cannot assert reliably yet | Improve harness, do not blame plugin |
| Obsidian/native limit | Caused by Obsidian editor behavior or Chromium/Electron constraints | Document workaround/expectation |

Every known limit should still include: reproduction, why it is accepted, user-facing consequence, and whether docs/settings copy should mention it.

## 9.2 Universal editor-state edge cases

Run representative actions from every feature under these editor states:

1. Live Preview mode.
2. Source mode if available/enabled.
3. Reading view, where features should be inactive or behave intentionally.
4. Multiple tabs open to the same note.
5. Two split panes showing the same note.
6. Two split panes showing different Better Edit fixture notes.
7. Inactive pane contains stale Better Edit UI while active pane receives commands.
8. Cursor near top of viewport.
9. Cursor near bottom of viewport.
10. Cursor near left/right viewport edge.
11. Editor scrolled so selection/image is partly offscreen.
12. Zoomed Obsidian UI if feasible: normal, zoomed in, zoomed out.
13. Narrow pane width: 320, 480, 640 px equivalents.
14. Wide pane width: large desktop/fullscreen.
15. Light theme.
16. Dark theme.
17. Default theme and any installed theme currently active in test vault.
18. Plugin enabled/disabled without Obsidian restart.
19. Obsidian reloaded while a Better Edit popover/toolbar is open.
20. File renamed while fixture is open.
21. Note deleted/moved from file explorer while UI is open, if safe in sandbox.
22. Undo/redo after every mutation.
23. Rapid repeated actions: double click, repeated Enter, repeated Escape.
24. IME/CJK adjacent text where relevant.
25. Markdown with CRLF vs LF if Obsidian preserves differences.

## 9.3 Markdown syntax boundary fixtures

Create notes that include each feature target inside or adjacent to:

- YAML frontmatter.
- Callouts: `> [!note]` / nested callouts.
- Blockquotes.
- Tables.
- Footnotes.
- Wikilinks: `[[Page]]`, `[[Page|Alias]]`, embeds `![[image.png]]`.
- Markdown links with nested punctuation.
- Bare URLs.
- Tags: `#tag`, `#nested/tag`.
- Inline HTML.
- HTML comments.
- Fenced code blocks with backticks.
- Fenced code blocks with tildes.
- Inline code containing markdown-like text.
- Math blocks `$$`.
- Inline math `$x$`.
- Escaped delimiters: `\*`, `\$`, `\[`.
- Empty lines and lines containing only whitespace.
- Very long single paragraph: 5k+ chars.
- Very long note: 500+ blocks.
- Unicode: emoji, combining marks, full-width punctuation, Traditional Chinese, Spanish accents.
- Mixed LTR text and symbols.
- Headings H1-H6 and duplicate headings.
- Task lists, nested lists, mixed bullet/numbered lists.
- Indented code blocks.

## 9.4 Text Styling adversarial matrix

### Selection shapes

Test every text-format action against:

1. Empty cursor — toolbar should not show.
2. Whitespace-only selection.
3. Single word.
4. Full sentence with punctuation.
5. Selection starts/ends mid-word.
6. Selection includes leading/trailing spaces.
7. Selection includes newline.
8. Selection spans multiple paragraphs.
9. Selection spans heading + paragraph.
10. Selection spans list items.
11. Selection inside blockquote.
12. Backward selection direction.
13. Double-click word selection.
14. Triple-click/whole-line selection if Obsidian produces it.
15. Selection including existing formatting delimiters.
16. Selection adjacent to existing delimiters but not inside them.
17. Selection around Unicode grapheme cluster / emoji.
18. Selection around CJK text with no spaces.

### Format nesting and removal

For each action, especially bold/italic/highlight/code/equation:

- Apply to plain selection.
- Apply again to remove.
- Apply to already partially formatted selection.
- Apply bold to italic text.
- Apply italic to bold text.
- Apply highlight to bold+italic text.
- Remove bold from bold+italic+highlight text.
- Remove highlight while preserving inner bold/italic.
- Apply code to text containing `*`, `_`, `~`, `=`, `[`, `]`, `(`, `)`.
- Attempt code/equation on text containing its delimiter.
- Attempt code/equation on multi-line selection.
- Attempt formatting inside code fence and math block: should be suppressed or known limit.
- Undo/redo after each mutation.
- Verify selection remains around logical content after mutation.

### Link popover edge cases

- Link selected text to existing note.
- Link selected text to non-existing note.
- Empty page name.
- Page name with slash, colon, emoji, CJK, leading/trailing spaces.
- Alias-like text containing `|`.
- URL mode with `https://`, `http://`, `mailto:`, `obsidian://`.
- URL mode with invalid URL-ish text: classify as bug or accepted freeform markdown.
- URL mode where selected text already contains markdown link.
- Open link panel, click outside, Escape, Enter, Tab, Shift+Tab.
- Open link panel then toggle Text Styling setting off.
- Open link panel then scroll selection out of view.
- Two panes: link panel should belong to active editor only.

### Text toolbar visual/UX states

- Top/bottom/left/right viewport collision.
- Toolbar over selected text vs to side.
- Hover/active/disabled colors in light/dark theme.
- Icon scale consistency after accepted text icon fix.
- Tooltip/title text.
- Keyboard-only reachability: record if intentionally mouse-first.

## 9.5 Slash command adversarial matrix

### Trigger contexts

- Slash at empty line.
- Slash after text on same line.
- Slash after whitespace indentation.
- Slash inside list item.
- Slash inside nested list item.
- Slash inside task list item.
- Slash inside quote/callout.
- Slash inside table cell.
- Slash inside inline code.
- Slash inside fenced code block.
- Slash inside math block.
- Slash in YAML frontmatter.
- Slash after escaped slash `\/`.
- Slash typed rapidly then Backspace.
- Slash menu open while another Better Edit UI exists.

### Filtering/input

- Case-insensitive search.
- Partial aliases.
- No-result query.
- Query with spaces.
- Query with punctuation.
- Query with CJK/emoji.
- Very fast typing.
- Backspace to empty query.
- Mouse selection vs keyboard selection.
- Arrow wrap at top/bottom.
- Page scroll while menu is open.

### Command-specific mutation checks

For every command, assert exact markdown and cursor position:

- Heading commands at blank line and paragraph line.
- List command from paragraph and empty line.
- Numbered list preserves numbering semantics.
- Task checkbox toggles correct line.
- Quote on multi-line selection if supported; otherwise known limit.
- Code block insertion with cursor between fences.
- Math block insertion with cursor between delimiters.
- Divider insertion around existing content.
- Image placeholder insertion then image widget rendering.
- Undo/redo for each command.
- Individual command disabled in settings means absent and not executable.

## 9.6 Symbol picker adversarial matrix

- Open with shortcut from plain editor.
- Open through context menu, if enabled.
- Context menu disabled but picker shortcut enabled.
- Feature disabled: no UI/command side effects.
- Search exact Greek name, partial Greek name, symbol char, emoji name, math term, arrow term.
- No-result query.
- Insert at cursor start/middle/end of line.
- Insert replacing selection, if intended; otherwise classify.
- Insert adjacent to CJK text.
- Insert adjacent to inline math/code.
- Insert inside code fence/math block: decide bug vs known limit.
- Keyboard navigation: arrows, Enter, Escape, Tab.
- Focus returns to editor after insert/close.
- Picker open then setting toggled off.
- Picker open then active pane changes.
- Very long search input.
- Rapid open/close cycles to detect stale pickers.

## 9.7 Image Arrangement adversarial matrix

### Image source/schema cases

- Valid local vault image embed.
- Missing local image path.
- External HTTP image URL, if supported by Obsidian/test environment.
- Obsidian attachment with spaces in filename.
- Filename with CJK/emoji/special chars.
- Markdown image syntax `![alt](path)`.
- Wikilink embed `![[file.png]]`.
- Better Edit HTML placeholder.
- Better Edit filled HTML image.
- Malformed Better Edit HTML attributes.
- Duplicate/missing data attributes.
- Inline-styled dimensions with px, %, missing units, negative/zero values.
- Very small image.
- Very large image.
- Tall/narrow image.
- Wide/short image.
- Broken image load.

### Toolbar/actions

- Hover shows toolbar; moving to toolbar does not flicker/hide.
- Selected image keeps toolbar visible.
- Toolbar comfortable after image toolbar style fix.
- Toolbar on small image: does it overflow, collapse, or cover content? classify.
- Toolbar near viewport right edge clamps or overflows? classify.
- Align left/center/right.
- Float left/right with neighboring text.
- Caption add/edit/delete with empty, short, long, multiline, CJK text.
- Alt text add/edit/delete with empty/long/special chars.
- Replace via URL/path/upload UI if available.
- Duplicate/copy/delete actions.
- Crop modal open/cancel/apply; keyboard Escape.
- Resize handle drag small/large, min/max, undo/redo.
- Actions while image feature toggled off/on.

### Image rows

- Create row from two images.
- Add image to row placeholder.
- Pop out first/middle/last image.
- Reorder images within row.
- Drag standalone image into row before/after.
- Drag row image out of row.
- Row with one image.
- Row with many images: 5, 10, 20.
- Row with mixed aspect ratios.
- Row in narrow pane with wrap off/on.
- Row justify start/center/end/space-between.
- Row align items controls.
- Collapsed row toolbar: verify More-only behavior is discoverable and usable.
- Row toolbar and block toolbar overlap checks.
- Row toolbar vertical size after image toolbar comfort fix.

## 9.8 Blocks Drag and Drop adversarial matrix

### Block model cases

- Paragraph.
- Heading.
- Empty line.
- Multiple consecutive empty lines.
- Bullet list item.
- Nested bullet list item.
- Numbered list item.
- Nested numbered list item.
- Task list item checked/unchecked.
- Blockquote.
- Callout block.
- Table.
- Code fence.
- Math block.
- HTML block.
- Better Edit image widget block.
- Image row block.
- Very long paragraph wrapping many visual lines.
- Mixed Unicode paragraph.

### Drag/reorder behavior

- Drag down one position.
- Drag up one position.
- Drag to top of note.
- Drag to bottom of note.
- Drag across headings.
- Drag paragraph into/near list: should not corrupt list indentation.
- Drag list item within same level.
- Drag nested list item across levels; classify if unsupported.
- Drag block containing image widget.
- Drag HTML block with HTML dragging disabled/enabled.
- Drop cancellation by Escape/mouse leaving editor.
- Undo/redo after drag.
- Rapid repeated drags.
- Drop indicator position correctness.
- Handles should not appear in disabled feature state.

### Add button behavior

- Add after paragraph, heading, list item, empty line, image widget, table, code fence.
- Add in narrow pane.
- Add near bottom viewport.
- Add button and image toolbar collision.
- Undo/redo after add.

## 9.9 Cross-feature edge interactions

- Slash command inserts image placeholder, image widget immediately takes over.
- Image toolbar open, then text selection elsewhere: image toolbar should hide or not interfere.
- Text toolbar open, hover image: no overlapping stale toolbar confusion.
- Symbol picker open, slash typed: topmost UI behavior clear.
- Link popover open, symbol picker shortcut pressed.
- Blocks handle hover over image row where image row toolbar also appears.
- Blocks disabled + image rows enabled.
- Image rows disabled + blocks enabled.
- Text disabled + slash/symbol enabled.
- Slash disabled + symbol/text enabled.
- All features disabled, then enabled one-by-one without reload.
- Settings toggled while each UI is open.
- Plugin reload while UI is open.
- Multiple active leaves: each feature must target active leaf only.

## 9.10 Recovery, data-loss, and safety tests

These are release-critical:

- No mutation should occur when an action is canceled.
- Failed image replacement/import should preserve original markdown.
- Invalid link input should not erase selected text.
- Disabled button click should not mutate document.
- Escape should close UI without document mutation.
- Repeated undo should restore exact pre-action content.
- Repeated redo should restore exact post-action content.
- Plugin disable/enable should not rewrite notes.
- Unknown/malformed Better Edit HTML should not be silently destroyed.
- Drag/drop cancel should not duplicate/delete blocks.
- Long note operations should not freeze Obsidian for noticeable time; capture subjective and console evidence.

## 9.11 Visual regression screenshot set

For each screenshot, capture before/after if a UI opens:

1. Text toolbar: normal, edge-clamped, disabled states, link panel.
2. Slash menu: empty query, filtered query, no results, keyboard highlighted item.
3. Symbol picker: initial, search, no results, category view.
4. Image toolbar: standalone image hover, small image, right-edge image, row image, row toolbar collapsed.
5. Image crop/replace/caption/alt panels.
6. Blocks: handle, add button, drag indicator.
7. Cross-feature collision: image row + block handle; text toolbar + image nearby.
8. Light/dark theme equivalents.

## 9.12 Report structure for the overnight/deep run

For each run create:

```text
test-results/e2e/deep/<timestamp>/
  report.md
  report.json
  console.json
  screenshots/
  dom-snapshots/
  traces/
```

`report.md` must include:

- total cases attempted,
- pass/fail/known-limit/harness-limit counts,
- bug table,
- UX polish table,
- known-limits table,
- highest-risk unresolved items,
- screenshots index,
- exact command/environment notes.

`reproduce.md` remains the human discussion log in the vault; `report.md` is the machine/run artifact.

