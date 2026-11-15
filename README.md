# hfgui

A Mac app for finding and downloading open models from Hugging Face. It picks the size that
fits your memory and keeps big downloads going until they're done. Models go to a folder of
your choice, or straight into **LM Studio** and **exo** if you use them.

![](docs/screenshot-overview.png)

## What it does

- **Welcome**: on first launch, choose where models go and, optionally, add a Hugging Face
  token. LM Studio and exo are offered only when they're on this Mac; nothing asks you to
  install anything. Settings → About → Show again replays it.
- **Overview** at a glance: what is downloading, what landed, free space where models go,
  how big a model this Mac can run, a way into the Guide, and trending models that fit in
  memory.
- **Guide**: the basics for people new to local models — GGUF or MLX, which size fits (with
  this Mac's own memory figures), where files go, running a model with LM Studio, Ollama,
  llama.cpp, mlx-lm or exo, models that ask for a license, and disk space.
- **Browse** the Hugging Face Hub: search, sort by Trending / Most downloaded / Most liked /
  Recently updated, filter by format (GGUF / MLX) and task — as cards or as a dense table.
  Cards show parameters and the size you would actually download (the estimated Q4_K_M
  file for GGUF repos), plus "In library" once a model is downloaded. Right-click any model
  for "Download best fit to…" — the keyboard-reachable twin of drag-and-drop.
- **Paste a link.** The search field doubles as an omnibox: paste any
  `huggingface.co/org/model` URL (or type a bare `org/model`) and it resolves straight to
  the model instead of keyword-searching. `/tree/`, `/blob/` and `/resolve/` links work too.
  You can also **drag a link from your browser onto the window**, and when hfgui regains
  focus with a Hub link on the clipboard it offers to open it — the clipboard is read and
  parsed in the main process, so nothing but a model name ever reaches the UI.
- **Model detail**: GGUF quantizations grouped (multi-part files collapsed), file sizes,
  a "fits your RAM" hint per quant, full file list for MLX repos.
- **Download engine**: parallel jobs, pause / resume / cancel, resumable across app restarts
  (HTTP Range + `.partial` files, atomic rename on completion), disk-space pre-flight,
  speed / ETA, gated-model token support (stored encrypted via `safeStorage`).
- **Speed limit**: cap the combined speed of all downloads so calls and browsing keep working.
  One click from the speed readout in the top bar, or in Settings; applies instantly to
  downloads already running. It throttles the connection itself — held-back chunks
  back-pressure the socket, so TCP slows the sender — not just the disk writes. Switched on
  mid-download with a cap that wouldn't bite, it picks one under half the current speed instead.
- **Downloads dock**: live progress from any view, with pause and cancel in reach. The
  Downloads page keeps the history (In progress / Finished / Failed), Finder access, exo
  registration status, and plain-language help when something fails. Cancelling asks first,
  because it deletes what was downloaded so far.
- **No dead disk space**: cancelling deletes everything an unfinished download wrote
  (including the files a multi-file model had already finished); failed downloads can be
  discarded; finished models can be deleted from disk while other quantizations in the same
  folder stay; and data left by downloads removed from the list before they finished is
  found and cleaned up in one click. hfgui keeps a ledger of the files it writes, so it only
  ever deletes its own — never another app's, even though exo's downloader writes `.partial`
  files into the same folder. Finished models whose files were moved or deleted are flagged
  with **Download again**.
- **Model updates**: hfgui checks finished downloads against the Hub (shortly after launch,
  twice a day, or Downloads → Check for updates) and says what changed — "chat template and
  tokenizer · 17 KB to download". **Update** asks whether to replace the current version or
  keep both, and downloads only the changed files; unchanged ones are shared with the old
  version as APFS clones, so they take no extra space. The new version moves into the model's
  folder (file by file, so other GGUF sizes in it are left alone), so anything pointing at it
  gets the update. Kept, the old version sits beside it as `<model>@<revision>`, listed as
  "Older version" until you delete it. Small downloads like these never wait for a slot.
- **Resume, carefully**: resuming checks free space and that an external drive is
  connected, just like starting does; "Resume on launch" picks up downloads that quitting
  interrupted, not ones you paused yourself.
- **Notifications**: a macOS notification when a download finishes or fails in the
  background, a Dock badge with the number of active downloads, and the Dock icon's
  progress bar.
- **Keyboard**: ⌘K or / to search, ⌘1–6 for pages, ⌘B for the sidebar, ⌘, for Settings.
- **Drag a card onto a destination** to start a download without opening the model. For
  GGUF repos that starts the quantization hfgui would have recommended for your RAM, and
  says which one it picked with Change / Undo. Every path is also a button.
- **Destinations**: a default for new downloads (Settings), and each download can pick
  another.
  - **Models folder** → `~/Models/{publisher}/{model}/` unless you choose another folder:
    plain files any app can open.
  - **LM Studio** → `~/.lmstudio/models/{publisher}/{model}/`, when LM Studio is installed
    (auto-detected, including a custom models folder configured in LM Studio). Models appear
    after reopening LM Studio.
  - **exo** → `~/.exo/models/{org}--{model}/`, when exo is installed (flat repo folder; exo
    loads complete folders automatically). Offered for MLX models.

  Apps that aren't installed don't appear anywhere: not on the model sheet, the drop
  targets, the menus or in Settings.

## Design

A monochrome dashboard built on [shadcn/ui](https://ui.shadcn.com) — inset sidebar, page
headers, cards and index tables — in light and dark (System / Light / Dark in Settings).
There is exactly one accent, a signal red, and it only ever means *live*: running
downloads, the in-progress count, and the quant hfgui recommends. Statuses are outline
pills with a coloured dot.

Every model gets a deterministic gradient avatar derived from its repo id, with the hue
family coming from the author, so a repo always looks the same and a page of results from
one org reads as a set.

![](docs/screenshot-browse.png)
![](docs/screenshot-detail.png)
![](docs/screenshot-downloads.png)
![](docs/screenshot-guide.png)
![](docs/screenshot-welcome.png)

## Development

Requires Node 22+.

```sh
npm install
npm run dev        # run with HMR
npm run typecheck  # tsc over main/preload + renderer
npm test           # vitest unit tests (download engine, link/quant parsing, fit rules, notifications…)
npm run build      # production bundles into out/
npm start          # preview the production build
npm run icon       # regenerate build/icon.svg (scripts/icon-halftone.mjs), render .icns + .png
```

End-to-end tests (drive the real app, real downloads — needs network):

```sh
npm run build
node scripts/e2e.mjs        # GGUF download to a temp dir, pause/resume mid-flight
node scripts/e2e-mlx.mjs    # multi-file MLX repo into the detected exo models dir
node scripts/e2e-paste.mjs  # omnibox paste, link drop, clipboard chip, drag-to-download
node scripts/e2e-throttle.mjs # speed cap: app rate + real socket rate via nettop, live toggle
node scripts/screenshot.mjs /tmp/shots both   # UI screenshots, dark + light
```

## Architecture

- `src/main/` — Electron main process: download manager (queue → job state machine →
  per-file streaming downloader), destination path adapters, settings + encrypted token store.
- `src/preload/` — `contextBridge` shim exposing the typed `window.hfgui` API.
- `src/renderer/` — React 19 + Tailwind v4 + shadcn/ui (Radix); talks to the HF API
  directly (search / model info / file trees) and to main over IPC for downloads and
  settings. `components/ui/` is vendored from the shadcn new-york-v4 registry (lightly
  adapted: tooltip delay, sheet timing, no mobile sidebar); `components/app/` is hfgui's
  own. To add a shadcn component, take `files[].content` from
  `https://ui.shadcn.com/r/styles/new-york-v4/<name>.json` and point its `cn` and
  `@/registry/new-york-v4/…` imports at `@/lib/utils` and `@/components/ui/…` — the CLI's
  install step trips over npm's allow-scripts policy here.
- `src/shared/` — types, the IPC contract, GGUF quant parsing, link parsing, destination
  rules, drop planning, formatters. All pure and unit-tested.

Built with electron-vite. Downloads re-resolve `huggingface.co/{repo}/resolve/{sha}/{path}`
fresh on every start/resume (CDN URLs are short-lived signed URLs), pin the repo commit sha
per job, and never forward the HF token past the CDN redirect. Inter is bundled and inlined
as a `data:` URI because the packaged renderer runs from `file://`, where CSP
`font-src 'self'` does not reliably match.
