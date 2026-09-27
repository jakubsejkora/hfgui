---
name: verify
description: Build and drive the hfgui Electron app under Playwright to verify changes at the real UI, with screenshots as evidence.
---

# Verifying hfgui changes

Build, then drive the packaged output with playwright-core (already a devDependency):

```bash
export PATH="$HOME/.local/node/bin:$PATH"   # no system Node on this machine
npm run build                                # electron-vite → out/
node scripts/screenshot.mjs /tmp/shots both  # all views, dark + light
node scripts/e2e.mjs                         # full download flow (real HF API)
node scripts/e2e-paste.mjs                   # omnibox, link drop, clipboard, drag-to-download
```

`scripts/e2e-mlx.mjs` downloads ~140 MB into the user's real `~/.exo/models` and leaves it
there — only run it when that is what you want. It skips if the folder already exists.

Custom drivers: copy the launch block from `scripts/screenshot.mjs` — it runs
`node_modules/electron/dist/Electron.app/Contents/MacOS/Electron out/main/index.js`
with `HFGUI_USER_DATA_DIR` pointed at a `mkdtempSync` dir (pre-seed
`settings.json` there with `{"customDir": "/tmp"}` so no native dialog opens).

Gotchas:

- Driver scripts must live **inside the repo** (`.context/` is gitignored) or
  `import 'playwright-core'` won't resolve.
- Playwright pins `prefers-color-scheme` on attach. Always start with
  `await win.emulateMedia({ colorScheme: null })` — otherwise `nativeTheme.themeSource`
  changes never reach the page and the theme looks broken when it isn't.
- After setting `nativeTheme.themeSource`, **wait for the class, not a timeout**:
  `await win.waitForFunction(t => document.documentElement.classList.contains('light') === (t === 'light'), theme)`.
  Propagation can lag a second or more when the renderer is busy, which silently produces
  screenshots of the wrong theme.
- Reading a screenshot you have already read at the same path can serve a stale image.
  Write to a new filename, or confirm with pixels (`sips -z 1 1 -s format bmp`).
- Test hooks on `window.__hfguiTest`: `openModel(id)`, `setView(view)`, `getJobs()`,
  `getUi()`, `openRef(text)`, `beginDrag(model)` / `endDrag()` / `getDragModel()`,
  `dropModel(model, kind)`.
- Useful selectors: `[data-testid="model-grid"] > button` (the grid's direct children must
  stay `<button>` elements), `[data-testid="search-input"]`, `[data-testid^="download-"]`,
  `omnibox-open`, `clipboard-chip`, `sheet-error` (+ `data-error-code`), `downloads-dock`,
  `drop-target-{kind}`, `system-stats`.
- Copy that the drivers match on: the strings `Completed` and `No downloads yet.` (Downloads
  view) and `aria-label="Remove from list"`. The dock deliberately avoids all three, and no
  new testid may start with `download-`.
- `scripts/e2e-mlx.mjs` asserts `locator('text=/Users/').first()` over the **whole page** —
  the model sheet's destination path must stay the only absolute path rendered as text.
- To run main-process checks use `app.evaluate(({ nativeTheme }) => ...)`.
