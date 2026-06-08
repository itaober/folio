# Folio

[English](./README.md) | [简体中文](./README.zh-CN.md)

A calm, local‑first **read‑it‑later** Chrome extension. Save pages, move them through `Unread → Reading → Done`, pick up where you left off, and keep everything on your own machine — with optional sync to a branch in your own GitHub repo.

- Repository: https://github.com/itaober/folio
- Releases: https://github.com/itaober/folio/releases/latest

> Built on the **faiz** design system — one warm‑neutral oklch palette, ink‑first with a single blue accent, light/dark/system. Reading is the product; settings and sync stay quiet.

## Screenshots

**Dashboard** — your full library, with search, tags, sorting, and the status flow.

![Folio dashboard](docs/screenshots/options.png)

<table>
  <tr>
    <td width="34%" valign="top"><b>Popup</b><br/>One‑gesture capture &amp; triage.<br/><br/><img src="docs/screenshots/popup.png" alt="Folio popup" /></td>
    <td valign="top"><b>Dark mode</b><br/>Light / Dark / System, applied everywhere.<br/><br/><img src="docs/screenshots/options-dark.png" alt="Folio dashboard, dark" /></td>
  </tr>
</table>

**Settings — GitHub sync** — connect a fine‑grained token and sync to a `content` branch.

![GitHub sync settings](docs/screenshots/settings.png)

## Features

- **One‑gesture capture** — save the current tab from the popup, or right‑click any page → **Save to Folio**.
- **Status flow** — `Unread → Reading → Done`, changed in one click from the status pill (no editor needed).
- **Resume reading** — save your spot on a page and reopen it with the scroll position restored.
- **Organize** — tags, notes, full‑text search, and sorting (newest / oldest / domain / title / status).
- **Inline editing** — edit title, note, tags, and status in place.
- **Command palette** — `⌘K` / `Ctrl‑K` in the dashboard to search items and run quick actions.
- **Appearance** — Light / Dark / System, applied across the popup and dashboard.
- **GitHub sync (optional)** — keep your library in a `content` branch of your own repo as two JSON files; multi‑device with per‑item, newest‑wins merge. See [GitHub sync](#github-sync).
- **Local backup** — mirror your library to a local folder, and import a backup when you need to.
- **Export** — JSON / CSV / Markdown, current view or everything.
- **Bilingual** — English and 简体中文.

The toolbar icon shows the saved status of the current tab as a small corner dot (amber = unread, blue = reading, green = done).

## Install

### From a release (recommended)

1. Download the latest `folio-extension-vX.Y.Z.zip` from [Releases](https://github.com/itaober/folio/releases/latest) and unzip it.
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select the unzipped folder (the one containing `manifest.json`).

### Build from source

```bash
pnpm install
pnpm build
```

Then **Load unpacked** the `dist/` folder.

## GitHub sync

Sync is **off by default** and entirely optional — Folio works fully offline with no account. Your local store is always the source of truth; GitHub is a copy you control.

1. In the dashboard, open **Settings → GitHub**.
2. Create a **fine‑grained personal access token** scoped to a single repository, with **Contents: Read and write** (Metadata read is included automatically). Set a sensible expiry.
   - Quick link: `github.com/settings/personal-access-tokens/new`
3. Paste the token, confirm owner / repo / branch (defaults to `content`), and connect.

On first connect Folio creates the branch as an **orphan branch** (no source history) and writes just two files:

```
content branch
└─ folio/
   ├─ data.json       # items + tags (+ delete tombstones)
   └─ settings.json   # synced preferences
```

The token is stored only in this browser (`chrome.storage`), never in the synced files. Conflicts between devices reconcile per item by newest change; the Storage settings expose **Use this device → GitHub**, **Use GitHub → this device**, and a **Review & resolve** diff for the rare case where the two sides genuinely diverge.

## Privacy & data

- Your reading list lives on your devices and, if you opt in, in **your own GitHub repository** — Folio has no backend and sends nothing to any third party.
- The only network egress is `api.github.com`, with the token you provide.
- No telemetry, no analytics.

## Development

Requirements: **Node 20+** and **pnpm 10+**.

```bash
pnpm install     # install deps
pnpm dev         # dev build with HMR (loads the extension from dist/)
pnpm typecheck   # tsc --noEmit
pnpm build       # production build → dist/
```

**Tech stack:** React 19 · TypeScript · Vite 7 + `@crxjs/vite-plugin` (MV3) · Tailwind CSS v4 · i18next · lucide-react.

### Project structure

```
src/
  popup/         # capture & triage panel (App.tsx + _components/)
  options/       # full dashboard: library, settings, sync (App.tsx + _components/{library,settings,github})
  background/    # MV3 service worker: save, context menu, toolbar icon + status dot, resume, sync
  core/          # data model, repository (commit/store), selectors, exporters, url
    sync/        #   local-folder backup + github/ (content-branch client, envelopes, merge)
  shared/
    ui/          # faiz fz-* primitives (StatusMenu, Segmented, FolioMark, …)
    styles/      # faiz oklch tokens + Tailwind v4 setup
    i18n/        # en + zh-CN resources, locale store
    theme.ts     # light/dark/system mode controller
```

## Release

Releases are cut from GitHub Actions via `.github/workflows/manual-release.yml` (**Run workflow**). It validates the version, updates the manifest, builds and packages the extension, generates a checksum, pushes the tag, and creates a GitHub Release.

Inputs: `version` (e.g. `1.1.0`), `draft`, `prerelease`, optional `release_notes`.

## Notes

- The extension uses a fixed manifest `key`, so the extension ID stays stable across updates — use **Reload** on the extension card to keep your `chrome.storage.local` data.
