# Folio

[English](./README.md) | [简体中文](./README.zh-CN.md)

A read-it-later Chrome extension for saving pages and managing reading status.

## Links

- Repository: https://github.com/itaober/folio
- Releases: https://github.com/itaober/folio/releases
- Latest Release: https://github.com/itaober/folio/releases/latest

## Screenshots

> Diagonal split comparison: left = Warm, right = Monochrome.

<p align="center">
  <img src="./docs/screenshots/popup-diagonal.png" alt="Popup (Warm vs Monochrome)" width="32%" />
  <img src="./docs/screenshots/options-list-diagonal.png" alt="Options List (Warm vs Monochrome)" width="32%" />
  <img src="./docs/screenshots/options-settings-diagonal.png" alt="Options Settings (Warm vs Monochrome)" width="32%" />
</p>

## Features

- Unread-first workflow
- Save pages from popup or context menu
- Status flow: `Unread` -> `Reading` -> `Done`
- Tag filtering and management
- Inline editing (`title`, `note`, `tags`)
- Search and sorting in options page
- Local backup sync (browser -> local directory)
- English and Simplified Chinese UI

## Installation

### Option A: Install from GitHub Release (recommended)

1. Download the latest `folio-extension-vX.Y.Z.zip` from [Releases](https://github.com/itaober/folio/releases).
2. Unzip it.
3. Open `chrome://extensions`.
4. Enable **Developer mode**.
5. Click **Load unpacked** and select the folder containing `manifest.json`.

### Option B: Build locally

```bash
pnpm install
pnpm build
```

Then load `dist` via **Load unpacked**.

## Development

- Node.js 20+
- pnpm 10+

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm build
```

## Manual Release (GitHub Actions)

Workflow: `.github/workflows/manual-release.yml`

Run it from GitHub Actions (**Run workflow**). It validates the version, updates manifests, builds and packages the extension, generates checksum, pushes tag, and creates a GitHub Release.

Inputs:

- `version` (required): numeric version such as `0.2.0`
- `draft`: create draft release
- `prerelease`: mark prerelease
- `release_notes`: optional; empty means auto-generated notes

## Project Structure

```text
src/
  background/     # service worker logic
  popup/          # popup UI
  options/        # dashboard/options UI
  core/           # store, selectors, repository, sync logic
  shared/         # shared styles, i18n, ui components
public/
  icons/          # extension icons (png + svg variants)
```

## Tech Stack

- React + TypeScript
- Vite + CRXJS plugin
- Tailwind CSS v4
- i18next

## Notes

- Installing from GitHub Release with **Load unpacked** requires Chrome Developer mode.
- The extension uses a fixed manifest key to keep extension ID stable across updates.
- Keep the same extension entry and use **Reload** to preserve `chrome.storage.local` data.
