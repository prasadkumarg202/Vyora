# @vyora/desktop

Electron shell that wraps the hosted Vyora web app and packages it as a
Windows installer (`Vyora-Setup.exe`). Because Vyora is offline-first (service
worker + OPFS SQLite), the desktop app works with no internet after its first
online launch — the shell adds a native window, Start-menu entry and installer.

## Before your first release

1. **Set the production URL.** Edit `PROD_URL` in `electron/main.js` to your
   deployed web app URL (currently a placeholder `https://app.vyora.in`).
2. Run `pnpm install` at the repo root once so the lockfile picks up this
   package, and commit the updated `pnpm-lock.yaml`.

## Develop locally

```bash
# Terminal 1 — run the web app
pnpm --filter @vyora/web dev

# Terminal 2 — open the desktop shell against localhost:3000
pnpm --filter @vyora/desktop dev
```

`VYORA_APP_URL` overrides the target URL in any mode:

```bash
VYORA_APP_URL=https://staging.vyora.in pnpm --filter @vyora/desktop dev
```

## Build the .exe on this machine (Windows)

```bash
pnpm --filter @vyora/desktop dist
# → apps/desktop/dist/Vyora-Setup.exe
```

## Release via GitHub Actions (recommended)

Push a version tag — the `desktop-release` workflow builds the installer on a
Windows runner and attaches it to a GitHub Release:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The website links to the permanent URL
`https://github.com/prasadkumarg202/Vyora/releases/latest/download/Vyora-Setup.exe`,
which always serves the newest release. Note: the repo (or at least its
releases) must be public for customers to download this link.

## Not done yet (fine to ship without)

- **Code signing** — unsigned installers trigger a SmartScreen warning on
  Windows. Buy an OV/EV code-signing cert later and add it to the workflow.
- **macOS build** — add a `mac` target in `electron-builder.yml` plus an
  `icon.icns` when you're ready.
- **Auto-update** — electron-updater can use these same GitHub Releases.
