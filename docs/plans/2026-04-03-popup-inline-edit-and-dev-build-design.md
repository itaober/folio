# Popup Inline Edit and Dev Build Separation Design

Date: 2026-04-03  
Status: Approved  
Scope: Popup interaction refinement + dev/prod extension separation

## 1. Goal

Refine the Popup so it stays visually minimal while making high-frequency item editing faster, and split local validation builds from production builds so both extensions can be installed side-by-side without sharing ID or data.

## 2. Product Decisions

### 2.1 Dev / Prod Separation

- `prod` keeps the existing stable extension key.
- `dev` uses a separate fixed development key.
- `prod` and `dev` keep separate:
  - extension name
  - toolbar / extension-page icons
  - output directory
- Expected result:
  - different extension IDs
  - both can be installed at the same time
  - storage is isolated by extension ID

### 2.2 Popup Interaction Model

- Popup list rows stay single-line in default state.
- Only the current page's tracked item can expand into an inline edit panel.
- Clicking the item body toggles expand / collapse.
- Clicking the title link opens the target page.
- Status switching remains a dedicated control on the right.
- Delete is not permanently visible; it appears on hover and uses the same long-press confirmation pattern as the dashboard.

## 3. Popup Layout

### 3.1 Collapsed State

Each row contains:

- favicon / fallback mark
- title link
- domain text
- status toggle button
- hover-only delete button in the top-right corner

The row itself is the expansion trigger, except for explicitly interactive sub-elements:

- title link: open page
- status button: switch status
- delete button: long-press delete

### 3.2 Expanded State

Only the current page's item may show the inline editor.

The editor includes:

- note field
- tags field
- `Confirm`
- `Cancel`
- `Save spot` only when the item status is `Reading`

Behavior:

- `Confirm`: persist note and tags, then collapse.
- `Cancel`: discard unsaved draft, restore persisted note/tags, then collapse.

No auto-save is used for note/tags in Popup once explicit confirm/cancel exists.

## 4. State Model

Popup needs explicit draft state instead of mutating live values:

- `expandedItemId`
- `popupEditNote`
- `popupEditTags`
- `popupTagInput`

Rules:

- Saving the current page auto-expands its row.
- Reloading store data should not overwrite an in-progress draft for the expanded row.
- Draft resets only when:
  - user confirms
  - user cancels
  - expanded target changes
  - current tracked item disappears

## 5. Deletion Interaction

- Delete affordance matches dashboard semantics:
  - button appears on hover
  - hold-to-delete ring/progress
  - release before completion cancels
- This keeps destructive action available without permanently adding visual noise.

## 6. Build and Asset Design

- Build channel is controlled through environment variables.
- `prod` outputs to `dist/`.
- `dev` outputs to `dist-dev/`.
- Manifest values change by channel:
  - locale app name key
  - extension key
  - default icon paths
  - global icon paths
- Shared icon helpers also resolve channel-specific asset names so runtime icon updates stay aligned with the active build.

## 7. Error Handling

- Failed Popup updates show inline notice in Popup.
- Failed resume snapshot capture shows inline notice instead of silently doing nothing.
- Long-press delete should only fire after full hold completion.
- If the active page is no longer tracked, expanded editor state collapses automatically.

## 8. Verification Criteria

Manual acceptance for this change:

1. `prod` and `dev` builds produce different extension IDs.
2. Both extensions can be installed simultaneously in Chrome.
3. Clicking a Popup row body expands the current item's editor.
4. Clicking the title opens the item without toggling expansion.
5. Status button switches status without opening or expanding the row.
6. Hover delete appears and requires hold completion before deleting.
7. `Confirm` saves note/tags and collapses.
8. `Cancel` discards draft changes and collapses.
9. `Save spot` remains available only for `Reading` items in expanded state.
10. `pnpm typecheck`, `pnpm build`, and `pnpm build:dev` all pass.
