# Contributing to hfgui

Thanks for helping. Bug reports, fixes and ideas are all welcome. For anything bigger than a
fix, open an issue first so we can agree on the shape before you spend time on it.

## Setup

You need a Mac (the app is macOS-only) and Node.js 22 or newer.

```sh
npm install        # also downloads Electron's binary
npm run dev        # the app with hot reload
```

`npm install` runs Electron's and esbuild's install scripts; `package.json` allow-lists them
for npm's `allowScripts` policy. If `node_modules/electron/dist` is missing afterwards, run
`node node_modules/electron/install.js`.

## Checks

```sh
npm run typecheck  # main/preload and renderer
npm test           # vitest unit tests
npm run build      # production bundles into out/
```

CI runs all three on every pull request.

### End-to-end tests

These drive the real, built app with Playwright, and most download real models over the
network. Build first (`npm run build`).

```sh
node scripts/e2e.mjs            # GGUF download to a temp dir, pause/resume mid-flight
node scripts/e2e-paste.mjs      # omnibox paste, link drop, clipboard chip, drag-to-download
node scripts/e2e-throttle.mjs   # speed cap: app rate + real socket rate via nettop
node scripts/screenshot.mjs /tmp/shots both   # every page, dark + light
```

- hfgui finds LM Studio and exo on your Mac and picks them as destinations. Every driver
  pins a temporary folder and checks where a job lands before letting bytes flow. Keep it
  that way in new ones: never test against your real model library.
- `scripts/e2e-mlx.mjs` deliberately downloads about 140 MB into your exo models folder.
- `scripts/e2e-update.mjs` (`npm run e2e:update`) tests self-updating end to end. It needs a
  Developer ID signing identity, so it's for maintainers (see
  [docs/RELEASING.md](docs/RELEASING.md)).
- Many runs back to back can hit Hugging Face's rate limits. A driver timing out waiting for
  cards right after other runs usually passes on a re-run.

## How the code is laid out

- `src/main/` is the Electron main process: the download manager (queue → job state
  machine → per-file streaming downloader), destination adapters (models folder, LM Studio,
  exo), settings and the encrypted token store, and app updates (`appUpdater.ts`).
- `src/preload/` is the `contextBridge` shim that exposes the typed `window.hfgui` API.
- `src/renderer/` holds React 19, Tailwind v4 and shadcn/ui (Radix). It talks to the
  Hugging Face API directly (search, model info, file trees) and to main over IPC for
  everything else.
- `src/shared/` holds types, the IPC contract (`ipc.ts`), GGUF quant parsing, link parsing,
  destination rules and formatters. It is pure and unit-tested.

Downloads re-resolve `huggingface.co/{repo}/resolve/{sha}/{path}` on every start and resume
(CDN URLs are short-lived), pin the repo's commit per job, and never send the token past
the CDN redirect.

## Conventions

- **Logic that can be pure, is.** Rules go in `src/shared/` or a dependency-injected
  module in `src/main/` (see `notifications.ts`, `appUpdater.ts`), with unit tests next to
  them. Main-process files that import `electron` stay thin.
- **The IPC contract is typed in one place**, `src/shared/ipc.ts`. Handlers validate
  everything that comes from the window.
- **The token never reaches the renderer.** Main attaches it at the network layer.
- **Copy is plain language.** Say what happened and what to do next ("Couldn't reach
  GitHub — check your connection"), not error codes.
- **LM Studio and exo are optional.** They appear only when installed. Don't add install
  prompts or "not installed" states; destination UI goes through `availableDestinations()`.
- **Status colours mean what people expect.** Green is all good (and going, when it
  pulses), amber needs attention, red is a problem that stopped something, grey is waiting
  or the user's own doing. The logo's signal red is a brand colour, never a status.
- **UI components:** `components/ui/` is vendored from the shadcn new-york-v4 registry,
  lightly adapted. `components/app/` is hfgui's own. To add a shadcn component, take
  `files[].content` from `https://ui.shadcn.com/r/styles/new-york-v4/<name>.json` and point
  its `cn` and `@/registry/new-york-v4/…` imports at `@/lib/utils` and
  `@/components/ui/…`.

## Suggesting a model for Discover

Discover's picks are a plain list in [`src/shared/picks.ts`](src/shared/picks.ts): per
category, a few models for each Mac memory size, with a sentence on why. The rules for a
good pick are at the top of the file. Open a pull request against it, or an issue with the
**Model suggestion** form. `HFGUI_NETWORK_TESTS=1 npm test` checks every pick against the
Hub: that it exists, isn't gated, and fits the memory size it's picked for.

## Pull requests

- Keep each PR to one change, and say why as well as what.
- UI changes: include screenshots in light and dark (`node scripts/screenshot.mjs`).
- Don't bump the version; releases do that.

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
