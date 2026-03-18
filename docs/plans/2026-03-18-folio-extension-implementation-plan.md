# Folio Chrome Extension Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Chrome-only MV3 Folio extension (full PRD scope except keyboard shortcuts) with popup quick actions, full options management UI, local storage domain model, and one-way automatic local backup sync on committed mutations.

**Architecture:** Use one Vite + React + TypeScript repository with multiple extension entries (`popup`, `options`, `background`) and a shared core domain layer for storage, selectors, exports, and sync orchestration. All state mutations pass through a single repository commit path, and post-commit effects (badge update + local backup write) are handled centrally. UI follows the warm-light design token system from the PRD.

**Tech Stack:** `pnpm`, TypeScript, React, Vite, Manifest V3, `@crxjs/vite-plugin`, Chrome Extension APIs, File System Access API (options page)

---

## Global Constraints

- No automated tests in this iteration (explicit requirement): no TDD, no unit tests, no E2E tests.
- Verification is `pnpm typecheck`, `pnpm build`, plus manual acceptance checks.
- Keyboard shortcut feature is removed completely.
- Use frequent small commits.
- If behavior is unclear during implementation, use `@superpowers/systematic-debugging` before patching.

### Task 1: Bootstrap project with pnpm and MV3 build pipeline

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/manifest.ts`
- Create: `src/assets/icon-16.png`, `src/assets/icon-32.png`, `src/assets/icon-48.png`, `src/assets/icon-128.png`

**Step 1: Scaffold dependencies and scripts**

Add scripts and deps:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "lint": "eslint ."
  }
}
```

Include core deps: `react`, `react-dom`; dev deps: `typescript`, `vite`, `@vitejs/plugin-react`, `@crxjs/vite-plugin`.

**Step 2: Define manifest entry map**

Set popup, options page, background service worker, permissions, host permissions, and context menu capability in `src/manifest.ts`.

**Step 3: Install and verify build setup**

Run: `pnpm install && pnpm typecheck && pnpm build`  
Expected: commands finish successfully and `dist/` is generated.

**Step 4: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.json vite.config.ts index.html src/manifest.ts src/assets
git commit -m "chore: bootstrap pnpm vite react mv3 extension"
```

### Task 2: Create extension entrypoints and shell layouts

**Files:**
- Create: `src/popup/main.tsx`
- Create: `src/popup/App.tsx`
- Create: `src/options/main.tsx`
- Create: `src/options/App.tsx`
- Create: `src/background/index.ts`
- Create: `src/shared/theme/tokens.css`
- Create: `src/shared/theme/base.css`

**Step 1: Add React mount points for popup/options**

Render `App` components with shared base styles.

**Step 2: Add warm-light token set**

Port PRD color/typography/spacing/radius/shadow tokens into `tokens.css` and global reset/base typography into `base.css`.

**Step 3: Add background worker skeleton**

Create a minimal background script that initializes extension lifecycle handlers.

**Step 4: Verify**

Run: `pnpm typecheck && pnpm build`  
Expected: no TS or build errors.

**Step 5: Commit**

```bash
git add src/popup src/options src/background src/shared/theme
git commit -m "feat: add extension entrypoints and base theme"
```

### Task 3: Implement core domain types and storage repository

**Files:**
- Create: `src/core/types.ts`
- Create: `src/core/defaults.ts`
- Create: `src/core/repository.ts`
- Create: `src/core/events.ts`
- Create: `src/core/url.ts`

**Step 1: Add PRD data types**

Define `FolioItem`, `FolioStore`, status unions, repository mutation input/output contracts.

**Step 2: Add default store initializer**

Expose `createDefaultStore()` with defaults for thresholds and metadata.

**Step 3: Implement repository commit API**

Implement:

```ts
commit(action: FolioMutation): Promise<CommitResult>
getStore(): Promise<FolioStore>
subscribe(listener: (event: CommitEvent) => void): Unsubscribe
```

Guarantee URL uniqueness and `updatedAt` updates on mutations.

**Step 4: Verify**

Run: `pnpm typecheck`  
Expected: types compile.

**Step 5: Commit**

```bash
git add src/core/types.ts src/core/defaults.ts src/core/repository.ts src/core/events.ts src/core/url.ts
git commit -m "feat: add core store model and commit repository"
```

### Task 4: Implement selectors, search, sort, stats, and stale/backlog logic

**Files:**
- Create: `src/core/selectors.ts`
- Create: `src/core/search.ts`
- Create: `src/core/stats.ts`
- Create: `src/core/time.ts`

**Step 1: Implement query primitives**

Add helpers for status filtering, tag filtering, full-text matching over title/url/note, and sort options.

**Step 2: Implement highlight model**

Return match index ranges for UI highlighting in list rows.

**Step 3: Implement derived metrics**

Compute unread backlog warning, stale unread marking, weekly done count, and top-3 domains.

**Step 4: Verify**

Run: `pnpm typecheck && pnpm build`  
Expected: build remains green.

**Step 5: Commit**

```bash
git add src/core/selectors.ts src/core/search.ts src/core/stats.ts src/core/time.ts
git commit -m "feat: add selectors search sorting and stats derivations"
```

### Task 5: Implement export services (JSON/CSV/Markdown)

**Files:**
- Create: `src/core/exporters.ts`
- Create: `src/core/exportFormats.ts`

**Step 1: Add export formatters**

Implement serializers for `json`, `csv`, `markdown` with scope `current-view` and `all`.

**Step 2: Add browser download helper**

Create blob-based download utility for options page export actions.

**Step 3: Verify**

Run: `pnpm typecheck`  
Expected: typecheck passes.

**Step 4: Commit**

```bash
git add src/core/exporters.ts src/core/exportFormats.ts
git commit -m "feat: add multi-format export services"
```

### Task 6: Implement one-way local backup sync service

**Files:**
- Create: `src/core/sync/types.ts`
- Create: `src/core/sync/backupWriter.ts`
- Create: `src/core/sync/syncState.ts`
- Modify: `src/core/repository.ts`

**Step 1: Define sync contracts**

Model `SyncConfig`, `SyncResult`, `SyncErrorState`, and `lastSyncedAt` metadata persistence.

**Step 2: Implement backup writer**

Use File System Access API handles from settings and write `folio-data.json` on committed mutations only.

**Step 3: Wire repository post-commit hook**

Trigger async sync after successful storage commit, without rolling back primary mutation on sync failure.

**Step 4: Verify**

Run: `pnpm typecheck && pnpm build`  
Expected: passes; no API typing issues.

**Step 5: Commit**

```bash
git add src/core/sync src/core/repository.ts
git commit -m "feat: add one-way automatic local backup sync"
```

### Task 7: Implement background behaviors (context menu + badge state)

**Files:**
- Modify: `src/background/index.ts`
- Create: `src/background/badge.ts`
- Create: `src/background/contextMenu.ts`
- Create: `src/background/tabState.ts`

**Step 1: Add context menu save action**

Register `Save to Folio` and route action through repository add mutation.

**Step 2: Add badge updater**

Map current tab URL item status to badge color/state and update on tab activation/update plus storage changes.

**Step 3: Add lifecycle wiring**

Initialize menu on install/startup; guard against duplicate menu registration.

**Step 4: Verify manually**

Run: `pnpm build` then load unpacked extension in Chrome and validate context menu and badge behavior on saved/unsaved pages.

**Step 5: Commit**

```bash
git add src/background
git commit -m "feat: add context menu save and tab badge state handling"
```

### Task 8: Build popup current-page save and status switch experience

**Files:**
- Modify: `src/popup/App.tsx`
- Create: `src/popup/components/CurrentPageCard.tsx`
- Create: `src/popup/components/SaveButton.tsx`
- Create: `src/popup/components/StatusSwitch.tsx`
- Create: `src/popup/hooks/useCurrentPageItem.ts`

**Step 1: Resolve current tab URL and match item**

Implement hook to get active tab URL and item lookup result.

**Step 2: Implement unsaved vs saved branches**

Unsaved: full-width save button.  
Saved: title + badge + 3-state status switch.

**Step 3: Add inline feedback messaging**

Show duplicate and success state inline; no toast.

**Step 4: Verify**

Manual: save page from popup, repeat save, switch statuses.

**Step 5: Commit**

```bash
git add src/popup/App.tsx src/popup/components src/popup/hooks
git commit -m "feat: implement popup current-page save and state switch"
```

### Task 9: Add popup quick edit, recent list, and search redirect

**Files:**
- Modify: `src/popup/App.tsx`
- Create: `src/popup/components/QuickEditInline.tsx`
- Create: `src/popup/components/RecentList.tsx`
- Create: `src/popup/components/PopupSearch.tsx`
- Create: `src/popup/components/BacklogHint.tsx`

**Step 1: Implement quick edit panel**

Expand after successful save; auto-collapse after inactivity timeout; save submits commit mutation.

**Step 2: Implement recent items list**

Render latest 5 items; row click opens item URL in new tab and updates `lastOpenedAt`.

**Step 3: Implement search redirect**

Focus/click routes to options page with query params for search term.

**Step 4: Add backlog warning rule**

Read derived unread count and show hint if threshold exceeded.

**Step 5: Verify**

Manual popup flow for quick edit collapse behavior and recent-list navigation.

**Step 6: Commit**

```bash
git add src/popup
git commit -m "feat: add popup quick edit recent items search and backlog hint"
```

### Task 10: Build options shell (sidebar, header, toolbar)

**Files:**
- Modify: `src/options/App.tsx`
- Create: `src/options/layout/SidebarNav.tsx`
- Create: `src/options/layout/ViewHeader.tsx`
- Create: `src/options/layout/Toolbar.tsx`
- Create: `src/options/state/useOptionsViewState.ts`

**Step 1: Implement layout structure**

Fixed sidebar + main content container per PRD spacing and typography.

**Step 2: Implement nav model**

Support `All`, status views, dynamic tags, and `Settings`.

**Step 3: Implement top toolbar controls**

Search box, sort dropdown, export trigger, batch mode toggle.

**Step 4: Verify**

Run: `pnpm build` and manual view switching.

**Step 5: Commit**

```bash
git add src/options/App.tsx src/options/layout src/options/state
git commit -m "feat: implement options page shell and primary navigation"
```

### Task 11: Build options list rows, inline edit, and row actions

**Files:**
- Create: `src/options/components/ReadingList.tsx`
- Create: `src/options/components/ReadingRow.tsx`
- Create: `src/options/components/InlineEditor.tsx`
- Create: `src/options/components/StatusBadge.tsx`
- Create: `src/options/components/TagPills.tsx`

**Step 1: Render flat list rows**

Include favicon fallback, title/domain/meta, status badge, time, and hover actions.

**Step 2: Implement row actions**

Open, edit toggle, delete with undo window.

**Step 3: Implement inline editor submit/cancel**

Only persist on save action; no persistence while typing.

**Step 4: Verify**

Manual: edit title/url/note/tags/status and confirm save updates.

**Step 5: Commit**

```bash
git add src/options/components
git commit -m "feat: add options reading list rows and inline editor"
```

### Task 12: Implement batch operations and tag management

**Files:**
- Create: `src/options/components/BatchActionBar.tsx`
- Create: `src/options/components/TagManagerDialog.tsx`
- Modify: `src/core/repository.ts`

**Step 1: Add row selection state**

Support select single/multiple and select-all in current filtered view.

**Step 2: Add batch mutations**

Implement batch status update, batch tag apply, batch delete.

**Step 3: Add global tag management**

Rename tag with item propagation and delete tag across items.

**Step 4: Verify**

Manual: run each batch action on mixed status/tag records.

**Step 5: Commit**

```bash
git add src/options/components/BatchActionBar.tsx src/options/components/TagManagerDialog.tsx src/core/repository.ts
git commit -m "feat: add batch operations and global tag management"
```

### Task 13: Implement options settings page and sync controls

**Files:**
- Create: `src/options/settings/SettingsPanel.tsx`
- Create: `src/options/settings/SettingRow.tsx`
- Create: `src/options/settings/useSyncSettings.ts`
- Modify: `src/core/sync/syncState.ts`
- Modify: `src/core/defaults.ts`

**Step 1: Implement threshold settings UI**

Support backlog and stale thresholds with validation and commit-save behavior.

**Step 2: Implement directory authorization controls**

Allow choosing folder handle and storing permission state.

**Step 3: Implement sync status and retry UI**

Show `lastSyncedAt`, current state, last error, and retry action.

**Step 4: Verify**

Manual: choose directory, perform data mutation, confirm backup file write.

**Step 5: Commit**

```bash
git add src/options/settings src/core/sync/syncState.ts src/core/defaults.ts
git commit -m "feat: add settings page thresholds and sync controls"
```

### Task 14: Implement export UI wiring and statistics surface

**Files:**
- Create: `src/options/components/ExportMenu.tsx`
- Create: `src/options/components/StatsPanel.tsx`
- Modify: `src/options/App.tsx`
- Modify: `src/core/exporters.ts`

**Step 1: Wire export menu actions**

Expose format + scope selectors and call exporter service.

**Step 2: Render stats panel**

Show weekly done, total, unread, top-3 domains.

**Step 3: Verify**

Manual: export each format and open files to validate output structure.

**Step 4: Commit**

```bash
git add src/options/components/ExportMenu.tsx src/options/components/StatsPanel.tsx src/options/App.tsx src/core/exporters.ts
git commit -m "feat: add export controls and stats panel"
```

### Task 15: Apply final PRD visual polish and interaction rules

**Files:**
- Modify: `src/shared/theme/tokens.css`
- Modify: `src/shared/theme/base.css`
- Modify: `src/popup/**/*.tsx`
- Modify: `src/options/**/*.tsx`

**Step 1: Enforce PRD visual constraints**

Apply warm-light palette, font roles (`Lora`, `IBM Plex Sans`, `IBM Plex Mono`), radius limits, functional-only shadows.

**Step 2: Enforce interaction spec**

Use inline notices only, motion timings (120ms/220ms), no decorative transitions, no modal/toast overuse.

**Step 3: Verify**

Manual visual pass in popup and options on standard desktop viewport.

**Step 4: Commit**

```bash
git add src/shared/theme src/popup src/options
git commit -m "style: align popup and options ui with prd warm-light system"
```

### Task 16: End-to-end manual acceptance sweep and release notes

**Files:**
- Create: `docs/checklists/2026-03-18-folio-manual-acceptance.md`
- Create: `docs/releases/2026-03-18-folio-v1-notes.md`

**Step 1: Execute manual acceptance checklist**

Validate all scenarios listed in design doc section "Manual Acceptance Criteria".

**Step 2: Record outcomes and known issues**

Document pass/fail and any deferred gaps.

**Step 3: Build production artifact**

Run: `pnpm build`  
Expected: production extension bundle generated in `dist/`.

**Step 4: Commit**

```bash
git add docs/checklists/2026-03-18-folio-manual-acceptance.md docs/releases/2026-03-18-folio-v1-notes.md
git commit -m "docs: add manual acceptance report and v1 release notes"
```

## Final Verification Gate

Run:

```bash
pnpm typecheck
pnpm build
```

Then load `dist/` as unpacked extension in Chrome and re-run critical manual checks:

1. Save + duplicate detection
2. Status switches in popup/options
3. Search/sort/filter/tag behavior
4. Batch operations
5. Exports (JSON/CSV/Markdown)
6. Badge state mapping
7. One-way auto backup write on committed mutation only

