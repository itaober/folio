# Folio

[English](./README.md) | [简体中文](./README.zh-CN.md)

A read-it-later list extension for Chrome.

Folio is designed around unread backlog management: quickly save pages, keep unread items visible and actionable, then move them through `Reading` and `Done`.

## Links

- Repository: https://github.com/itaober/folio
- Releases: https://github.com/itaober/folio/releases
- Latest Release: https://github.com/itaober/folio/releases/latest

## Features

- Unread-first workflow with clear backlog visibility
- Save current page from popup or context menu
- Status workflow: `Unread` -> `Reading` -> `Done`
- Tag filtering and tag management
- Inline editing (title, note, tags)
- Search and sorting in options page
- Local backup directory sync (browser -> local)
- English and Simplified Chinese UI
- Switchable icon variants

## Installation

### Option A: Install from GitHub Release (recommended for self-hosting)

1. Open [Releases](https://github.com/itaober/folio/releases) and download the latest `folio-extension-vX.Y.Z.zip`.
2. Unzip it locally.
3. Open `chrome://extensions`.
4. Turn on **Developer mode**.
5. Click **Load unpacked**.
6. Select the unzipped folder (must contain `manifest.json`).

### Option B: Local development build

```bash
pnpm install
pnpm build
```

Then load the `dist` directory via **Load unpacked**.

## Development

### Requirements

- Node.js 20+
- pnpm 10+

### Scripts

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm build
```

## Manual Release Workflow (GitHub Actions)

This repo includes a manual workflow at:

- `.github/workflows/manual-release.yml`

It is triggered from GitHub Actions UI (**Run workflow**) and always uses the latest `main` branch.

### What it does

1. Validate release version input
2. Ensure release tag does not already exist
3. Update version in:
   - `package.json`
   - `src/manifest.ts`
4. Build extension
5. Package `dist` into zip
6. Generate SHA-256 checksum file
7. Commit version bump to `main`
8. Create and push git tag
9. Create GitHub Release and upload assets

### Workflow inputs

- `version`: required, numeric extension version like `0.2.0`
- `draft`: create draft release
- `prerelease`: mark as prerelease

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

- This distribution mode (GitHub Release + Load unpacked) requires Chrome Developer mode for installation.
- For broad public distribution, publish to Chrome Web Store.
- You can always find the newest package at [Latest Release](https://github.com/itaober/folio/releases/latest).
