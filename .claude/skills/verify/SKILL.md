---
name: verify
description: Build and drive the hfgui Electron app under Playwright to verify changes at the real UI, with screenshots as evidence.
---

# Verifying hfgui changes

Build, then drive the packaged output with playwright-core (already a devDependency):

```bash
export PATH="$HOME/.local/node/bin:$PATH"   # no system Node on this machine
npm run build                                # electron-vite → out/
node scripts/screenshot.mjs /tmp/shots both  # every page, dark + light (seeded, see below)
node scripts/e2e.mjs                         # full download flow (real HF API)
node scripts/e2e-paste.mjs                   # omnibox, link drop, clipboard, drag-to-download
node scripts/e2e-throttle.mjs [shotDir]      # speed cap: app + socket rate, live toggle, pause
```

`scripts/e2e-mlx.mjs` downloads ~140 MB into the user's real `~/.exo/models` and leaves it
there — only run it when that is what you want. It skips if the folder already exists.

`screenshot.mjs` shoots Overview, Browse (grid and table), the model sheet, Downloads,
Settings and Private inference. It seeds `downloads.json` with sample jobs (paused, failed,
finished — nothing on disk), points `HF_HOME` at an empty dir so no personal token or
account lands in a screenshot, and exits 1 on CSP errors, page errors, or an interactive
element left inside a window drag region (Playwright clicks bypass drag regions, so this
computed-style check is the only thing that catches them). Settings shows real folder
paths — keep it out of anything committed.

Custom drivers: copy the launch block from `scripts/screenshot.mjs` — it runs
`node_modules/electron/dist/Electron.app/Contents/MacOS/Electron out/main/index.js`
with `HFGUI_USER_DATA_DIR` pointed at a `mkdtempSync` dir (pre-seed
`settings.json` there with `{"customDir": "/tmp"}` so no native dialog opens). Any driver
that downloads must click `destination-custom` and check the job's `jobDir` — LM Studio
and exo are installed on this Mac and get auto-selected otherwise.

Gotchas:

- The app **lands on Overview**. The card grid lives on Browse: call
  `__hfguiTest.setView('browse')` before waiting for `[data-testid="model-grid"] > button`.
- Driver scripts must live **inside the repo** (`.context/` is gitignored) or
  `import 'playwright-core'` won't resolve.
- Playwright pins `prefers-color-scheme` on attach. Always start with
  `await win.emulateMedia({ colorScheme: null })` — otherwise `nativeTheme.themeSource`
  changes never reach the page and the theme looks broken when it isn't.
- After setting `nativeTheme.themeSource`, **wait for the class, not a timeout**:
  `await win.waitForFunction(t => document.documentElement.classList.contains('light') === (t === 'light'), theme)`.
  `<html>` carries `.light` or `.dark` (shadcn tokens key off `.dark`; drivers wait on
  `.light`). Propagation can lag a second or more when the renderer is busy.
- Reading a screenshot you have already read at the same path can serve a stale image.
  Write to a new filename, or confirm with pixels (`sips -z 1 1 -s format bmp`).
- Test hooks on `window.__hfguiTest`: `openModel(id)`, `setView(view)` (views:
  `overview`, `browse`, `downloads`, `private-inference`, `settings`), `getJobs()`,
  `getUi()`, `openRef(text)`, `beginDrag(model)` / `endDrag()` / `getDragModel()`,
  `dropModel(model, kind)`, `refreshSettings()`.
- Useful selectors: `[data-testid="model-grid"] > button` (the grid's direct children must
  stay `<button draggable>` elements), `model-table`, `layout-grid` / `layout-table`,
  `overview-trending`, `nav-{view}`, `[data-testid="search-input"]`,
  `[data-testid^="download-"]`, `destination-{kind}` (radio items), `omnibox-open`,
  `clipboard-chip`, `sheet-error` (+ `data-error-code`), `downloads-dock`,
  `drop-target-{kind}`, `system-stats` (sidebar), `cancel-{jobId}` / `dock-stop-{jobId}` →
  `cancel-confirm` (cancelling asks first once bytes have landed).
- Copy that the drivers match on: `Completed` (a finished row's status badge — tabs,
  headings and summaries on Downloads say "finished" so the match stays meaningful),
  `No downloads yet.` (empty state), and the inline button `aria-label="Remove from list"`.
  Nothing always on screen — sidebar, header, dock, toasts — may render those, and no new
  testid may start with `download-`.
- `scripts/e2e-mlx.mjs` asserts `locator('text=/Users/').first()` over the **whole page** —
  the model sheet's destination path must stay the only absolute path rendered as text,
  and no other text anywhere may contain "Users".
- Don't wrap buttons a driver clicks right before Escape (`download-*`, `destination-*`,
  `omnibox-open`) in tooltips: an open tooltip takes the Escape. The sheet focuses its own
  panel on open for the same reason.
- To run main-process checks use `app.evaluate(({ nativeTheme }) => ...)`. Under a driver
  (`HFGUI_USER_DATA_DIR` set) notifications are recorded, not shown:
  `app.evaluate(() => globalThis.__hfguiNotifications)`; the Dock badge is
  `app.evaluate(({ app }) => app.dock.getBadge())`. Notifications only fire while the
  window is unfocused — blur it via `BrowserWindow.getAllWindows()[0].blur()`.
- Network-level measurement: `nettop -P -x -n -d -L <n> -s 1 -J bytes_in -p <pid>` on the
  Electron main process (`app.process().pid` — Node's fetch runs there). **`-n` is required**:
  without it nettop blocks on reverse-DNS lookups and prints nothing. In `-d` mode the first
  sample is a cumulative total; drop it and average the rest.
- Settings changed over IPC from a driver don't reach the UI's cache on their own — call
  `__hfguiTest.refreshSettings()` before asserting on anything the renderer computes from them.
- Speed limit selectors: `speed-chip` (header), `speed-limit-label`, and by role
  `getByRole('switch', { name: 'Limit download speed' })` /
  `getByRole('slider', { name: 'Download speed limit' })`.
- Popovers, dialogs and the sheet animate (open ≤300 ms, close ≤200 ms); screenshot after
  they settle, or they look translucent.
- Many runs back to back can hit Hugging Face rate limits or slow responses: a driver that
  times out waiting for cards or quant rows right after other runs usually passes on a
  re-run. Check `curl -s -o /dev/null -w "%{http_code}" https://huggingface.co/api/models?limit=1`.
