---
name: verify
description: Build and drive the hfgui Electron app under Playwright to verify changes at the real UI, with screenshots as evidence.
---

# Verifying hfgui changes

Build, then drive the packaged output with playwright-core (already a devDependency):

```bash
export PATH="$HOME/.local/node/bin:$PATH"   # no system Node on this machine
npm run build                                # electron-vite → out/
node scripts/screenshot.mjs /tmp/shots       # quick visual pass of all views
node scripts/e2e.mjs                         # full download flow (real HF API)
```

Custom drivers: copy the launch block from `scripts/screenshot.mjs` — it runs
`node_modules/electron/dist/Electron.app/Contents/MacOS/Electron out/main/index.js`
with `HFGUI_USER_DATA_DIR` pointed at a `mkdtempSync` dir (pre-seed
`settings.json` there with `{"customDir": "/tmp"}` so no native dialog opens).

Gotchas:

- Driver scripts must live **inside the repo** (`.context/` is gitignored) or
  `import 'playwright-core'` won't resolve.
- Playwright pins `prefers-color-scheme` on attach. When testing anything
  theme-related, first do `await win.emulateMedia({ colorScheme: null })` —
  otherwise `nativeTheme.themeSource` changes never reach the page and the
  theme looks broken when it isn't.
- Test hooks on `window.__hfguiTest`: `openModel(id)`, `setView(view)`,
  `getJobs()`. Useful selectors: `[data-testid="model-grid"] > button`,
  `[data-testid="search-input"]`, `[data-testid^="download-"]`.
- To run main-process checks use `app.evaluate(({ nativeTheme }) => ...)`.
