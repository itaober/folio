# Popup Inline Edit and Dev Build Separation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refine the Popup into a single-line list with current-item inline editing, hover hold-to-delete, and separate dev/prod extension builds with different IDs, names, icons, and output directories.

**Architecture:** Keep the current multi-entry MV3 structure, but move Popup editing to an explicit draft-driven inline editor and reuse the dashboard's hold-to-delete interaction model in Popup. Build channel separation remains manifest-driven, with shared helpers resolving channel-specific keys and icon assets so runtime icon updates match the installed extension variant.

**Tech Stack:** `pnpm`, TypeScript, React, Vite, Tailwind CSS, `@crxjs/vite-plugin`, Chrome Extension APIs, `lucide-react`

---

## Global Notes

- This repo currently relies on `pnpm typecheck`, `pnpm build`, `pnpm build:dev`, and manual verification instead of automated tests.
- Do not expand Popup into a second dashboard; keep one inline editor and one primary row action.
- Keep commits scoped and small.

### Task 1: Split dev/prod extension keys and manifest channel values

**Files:**
- Modify: `src/manifest.ts`
- Modify: `src/shared/buildChannel.ts`
- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `public/_locales/en/messages.json`
- Modify: `public/_locales/zh_CN/messages.json`

**Step 1: Add explicit prod/dev key selection**

- Keep the existing stable key for `prod`.
- Add a second stable development key for `dev`.
- Resolve manifest `name`, `key`, `icons`, and `action.default_icon` by build channel.

**Step 2: Make build scripts export channel variables for the whole command**

- Ensure `pnpm build` always produces `prod`.
- Ensure `pnpm build:dev` always produces `dev`.
- Ensure Vite output directory resolves to `dist/` or `dist-dev/`.

**Step 3: Verify**

Run:

```bash
pnpm typecheck
pnpm build
pnpm build:dev
```

Expected:

- all commands pass
- `dist/manifest.json` references prod name/key/icons
- `dist-dev/manifest.json` references dev name/key/icons

**Step 4: Commit**

```bash
git add src/manifest.ts src/shared/buildChannel.ts package.json vite.config.ts public/_locales/en/messages.json public/_locales/zh_CN/messages.json
git commit -m "feat(build): split dev and prod extension channels"
```

### Task 2: Finalize dev icon assets and ignore local build output

**Files:**
- Add: `public/icons/dev-classic-128.svg`
- Add: `public/icons/dev-mono-128.svg`
- Add: `public/icons/dev-classic-16.png`
- Add: `public/icons/dev-classic-32.png`
- Add: `public/icons/dev-classic-48.png`
- Add: `public/icons/dev-classic-128.png`
- Add: `public/icons/dev-mono-16.png`
- Add: `public/icons/dev-mono-32.png`
- Add: `public/icons/dev-mono-48.png`
- Add: `public/icons/dev-mono-128.png`
- Modify: `.gitignore`
- Modify: `src/shared/icons.ts`

**Step 1: Add dev-marked icon assets**

- Keep the current formal icon language.
- Add dev variants with a clear corner badge.
- Ensure both `classic` and `mono` have dev assets so runtime theme/icon switching still works.

**Step 2: Route shared icon helpers through build channel**

- Runtime icon helpers must resolve dev assets in dev builds and prod assets in prod builds.
- SVG helper should keep Popup/Options marks visually aligned with the installed channel.

**Step 3: Verify**

Run:

```bash
pnpm build:dev
ls dist-dev/icons
```

Expected:

- dev icon assets are present in `dist-dev/icons`
- both `dev-classic-*` and `dev-mono-*` exist

**Step 4: Commit**

```bash
git add public/icons src/shared/icons.ts .gitignore
git commit -m "feat(icons): add dev channel icon set"
```

### Task 3: Convert Popup rows to body-expand and title-open interaction

**Files:**
- Modify: `src/popup/App.tsx`

**Step 1: Split row click targets**

- Make title a real button/link-style trigger for open.
- Make the rest of the row toggle expand/collapse for the current tracked item.
- Prevent title/status/delete clicks from bubbling into row expansion.

**Step 2: Add explicit expanded-row state**

- Introduce `expandedItemId`.
- Auto-expand after saving the current page.
- Collapse when the current tracked item disappears or changes away.

**Step 3: Verify**

Run:

```bash
pnpm typecheck
pnpm build
```

Manual check:

- clicking title opens item
- clicking row body expands current item
- clicking status only changes status

**Step 4: Commit**

```bash
git add src/popup/App.tsx
git commit -m "feat(popup): separate row expansion from title open"
```

### Task 4: Replace Popup auto-save with explicit confirm/cancel drafts

**Files:**
- Modify: `src/popup/App.tsx`
- Reuse: `src/shared/ui/TextField.tsx`
- Reuse: `src/shared/ui/TagInputField.tsx`

**Step 1: Make Popup note/tags draft-based**

- Keep draft note/tags/tag-input in local state.
- Do not persist while typing.
- Only initialize drafts from store when opening a new expanded target or resetting state.

**Step 2: Add explicit actions**

- `Confirm`: persist note and tags, then collapse.
- `Cancel`: restore persisted values, clear transient tag input, then collapse.
- Keep `Save spot` available only for `Reading` items inside the expanded panel.

**Step 3: Verify**

Run:

```bash
pnpm typecheck
```

Manual check:

- edit note/tags then `Cancel` restores original values
- edit note/tags then `Confirm` persists and collapses
- `Save spot` still works for `Reading`

**Step 4: Commit**

```bash
git add src/popup/App.tsx
git commit -m "feat(popup): add confirmable inline edit drafts"
```

### Task 5: Add Popup hover delete with hold-to-delete confirmation

**Files:**
- Modify: `src/popup/App.tsx`
- Reference: `src/options/App.tsx`

**Step 1: Reuse dashboard delete-hold behavior**

- Port the minimal hold-progress logic needed for Popup.
- Show delete affordance only on hover for the relevant row.
- Render compact hold-progress ring/border treatment suitable for Popup density.

**Step 2: Integrate delete into expanded/collapsed row flow**

- Delete must not break row expansion.
- Delete should remove the item, clear expanded state if needed, and refresh the list.

**Step 3: Verify**

Run:

```bash
pnpm typecheck
pnpm build
```

Manual check:

- delete button appears on hover
- short press does nothing
- full hold deletes
- deleting the expanded current item collapses editor cleanly

**Step 4: Commit**

```bash
git add src/popup/App.tsx
git commit -m "feat(popup): add hover hold-to-delete action"
```

### Task 6: Final verification and Chrome manual checks

**Files:**
- No code changes required unless verification finds regressions

**Step 1: Run final verification**

```bash
pnpm typecheck
pnpm build
pnpm build:dev
```

Expected:

- all commands pass
- both `dist/` and `dist-dev/` generate successfully

**Step 2: Manual Chrome verification**

Check:

- install both builds together
- confirm different extension IDs
- confirm Popup title opens item
- confirm row body expands
- confirm hover hold-delete works
- confirm confirm/cancel semantics are correct

**Step 3: Final commit if needed**

```bash
git status
```

If verification required follow-up fixes, commit them with a scope-specific message.
