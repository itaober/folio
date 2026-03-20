# Folio Chrome Extension Design

Date: 2026-03-18  
Status: Approved  
Source PRD: `prd.md`

## 1. Scope and Constraints

- Delivery scope: PRD full scope (`MVP + v2 + v3`), except keyboard shortcuts are removed entirely.
- Browser target: Chrome only (Manifest V3).
- Tech stack: TypeScript + React + Vite + Tailwind CSS.
- Package manager: `pnpm`.
- Test policy for this build: no automated tests (no TDD, no unit/integration/E2E in this iteration).
- Local file sync policy: automatic one-way sync from browser data to local file (`folio-data.json`), triggered only on committed data mutations.
- Style system: Tailwind utility classes with PRD tokens mapped via CSS variables.
- Localization: support `English` and `Simplified Chinese` (`en`, `zh-CN`), default locale is `en`.

## 2. Architecture

Single repository, multi-entry extension app:

- `popup` entry: quick actions for current page and recent items.
- `options` entry: full management UI.
- `background` entry (service worker): context menu action, toolbar badge state orchestration, storage event coordination, backup sync triggering.
- `core` shared domain layer: storage repository, selectors, validation, sync service, exporters.
- `shared` styling layer: Tailwind CSS + CSS variable tokens for warm-light palette, typography, spacing, and component primitives aligned with PRD visual spec.
- `shared` i18n layer: locale resources, translation hooks, and locale persistence with fallback to English.

## 3. Feature Design

### 3.1 Popup

- Save current page when not collected.
- Duplicate URL detection with `Already in Folio` feedback.
- After successful save: optional inline quick edit (title/tags/note), auto-collapse after inactivity.
- If already saved: status switch (`Unread`, `Reading`, `Done`) and deep link to options editor.
- Show recent 5 items.
- Search field routes to options page search view.

### 3.2 Options Page

- Sidebar views: `All`, `Unread`, `Reading`, `Done`, tag views, `Settings`.
- Main list row: favicon, title, domain, status badge, tags, saved time.
- Row hover actions: open, edit inline, delete.
- Inline editor fields: title, URL, note, tags, status.
- Full text search across title/URL/note with match highlight.
- Sort options: saved time, domain, title, status.
- Batch operations: status change, tag assignment, delete.
- Export formats: JSON, CSV, Markdown for current view or full dataset.
- Stats surface: weekly done count, total count, unread count, top 3 domains.
- Settings: language selector (`English` / `简体中文`), sync directory setup/status, destructive setting confirmations.

### 3.3 Background Behaviors

- Context menu: `Save to Folio`.
- Toolbar icon badge/state updates based on current tab URL saved status.
- Listen to committed data mutation events and trigger local backup write if directory permission exists.

## 4. Data and State

Primary store is `chrome.storage.local` using the PRD data model (`FolioItem`, `FolioStore`).

All writes go through a single repository commit path:

1. Validate and normalize input (URL, tags, status, required fields).
2. Apply deterministic mutation to in-memory snapshot.
3. Persist snapshot to `chrome.storage.local`.
4. Emit commit event for post-commit effects (badge update, backup sync).

Key invariants:

- URL uniqueness per item.
- Global tags remain deduplicated.
- `updatedAt` updates on all committed mutations.
- `lastOpenedAt` updates only on open action.

## 5. Sync Design (One-Way Auto Backup)

- Direction: browser -> local directory only.
- Trigger: committed mutations only (save edit, status switch, add/delete item, batch mutation, settings affecting data).
- Non-trigger: typing in input fields before save.
- Output file: `folio-data.json` in authorized directory.
- Conflict policy: no merge/import path in this version; local file is treated as backup artifact.

Failure behavior:

- Primary mutation success is not rolled back by backup failure.
- Sync errors surface as inline notice in options settings with retry action.
- Store `lastSyncedAt` and last sync error metadata.

## 6. Error Handling and UX Feedback

- Duplicate add: inline already-exists feedback with current status.
- Validation errors: inline, field-scoped.
- Delete: undo affordance for short window (inline, non-toast).
- Destructive settings: two-step confirmation.
- Operation feedback style: inline notices (no toast), matching PRD.

## 7. Manual Acceptance Criteria (No Automated Tests)

The build is acceptable when all checks pass manually in Chrome:

1. Save current page from popup and context menu.
2. Duplicate URL detection is correct.
3. Status transitions work from popup and options.
4. Inline edit/save updates list and detail state.
5. Search/sort/filter/tag views produce expected item sets.
6. Batch actions mutate selected records only.
7. Export outputs valid JSON/CSV/Markdown content.
8. Toolbar status indicator changes according to current page state.
9. Backup file is updated on committed mutations only, not while typing.
10. Visual system aligns with PRD warm-light spec (color, typography, spacing, interaction).
11. UI language defaults to English on first run.
12. Switching language in settings updates popup/options text correctly for `en` and `zh-CN`.

## 8. Non-Goals for This Iteration

- Keyboard shortcut support and user shortcut customization.
- Bidirectional file sync and local-file import merge.
- Any cloud sync or remote backend.
- Automated test suite.

## 9. Implementation Readiness

Approved for planning and implementation under the above constraints.
