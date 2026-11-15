# Releasing hfgui

A release is a GitHub release with four files. Installed copies update themselves from it,
so there's no server to run, but a published release is permanent: get it right before
publishing.

| File | For |
| --- | --- |
| `hfgui-<version>-arm64.dmg` | First installs. Signed, notarized and stapled. |
| `hfgui-<version>-arm64-mac.zip` | Updates. Squirrel.Mac only installs zips. |
| `hfgui-<version>-arm64-mac.zip.blockmap` | Lets the next update download only the blocks that changed. |
| `latest-mac.yml` | What installed copies read: the version, and the zip's name, size and sha512. |

## One-time setup

1. **A Developer ID Application certificate** in your keychain. Create it in Xcode →
   Settings → Accounts → Manage Certificates → **+** → *Developer ID Application*, or at
   [developer.apple.com](https://developer.apple.com/account/resources/certificates) with a
   CSR from Keychain Access. Check it with:

   ```sh
   security find-identity -v -p codesigning   # lists "Developer ID Application: …"
   ```

   With more than one, set `CSC_NAME` to (part of) the one to use.

2. **Notarization credentials** in the keychain. Create an app-specific password at
   [account.apple.com](https://account.apple.com) (Sign-In and Security → App-Specific
   Passwords), and find your Team ID under Membership details at
   [developer.apple.com/account](https://developer.apple.com/account). Then:

   ```sh
   xcrun notarytool store-credentials hfgui --apple-id <your Apple ID> --team-id <TEAM_ID>
   ```

   An App Store Connect API key works too: set `APPLE_API_KEY` (path to the `.p8`),
   `APPLE_API_KEY_ID` and `APPLE_API_ISSUER` instead of `APPLE_KEYCHAIN_PROFILE` below.

3. **The GitHub CLI**, signed in: `gh auth login`.

## Release

1. Bump the version on a branch, merge it, and pull `main`:

   ```sh
   npm version minor --no-git-tag-version   # or patch / major
   ```

   Versions only go up. Installed copies ignore a release that isn't newer than what they
   run.

2. Build, notarize, check and upload:

   ```sh
   APPLE_KEYCHAIN_PROFILE=hfgui npm run release
   ```

   [`scripts/release.mjs`](../scripts/release.mjs) stops at the first problem. It:

   - refuses a dirty tree, a commit that isn't on GitHub, a version that's already released
     or not newer than the latest, and missing signing or notarization credentials (without
     them electron-builder would skip notarization and ship an app Gatekeeper blocks);
   - runs the typecheck and the tests;
   - builds the app, which electron-builder signs, notarizes and staples;
   - signs, notarizes and staples the DMG, whose container electron-builder leaves unsigned;
   - verifies that Gatekeeper accepts the DMG and the app as *Notarized Developer ID*, that
     both tickets are stapled, that the signature is valid (`--deep --strict`), that the app
     reports the right version and looks for updates in this repo, and that `latest-mac.yml`
     names the zip with its exact sha512;
   - uploads the four files as a **draft** release with generated notes, pointing at the
     current commit.

   `npm run release -- --no-upload` does everything except the upload, which makes it a
   dry run of the real thing.

3. Read the draft's notes on GitHub and edit them for people, not commits. Then publish:

   ```sh
   gh release edit v<version> --draft=false --latest
   ```

   Installed copies find it within a few hours, or at once from Settings → About → Check
   now.

## How updates work

The app ([`src/main/appUpdater.ts`](../src/main/appUpdater.ts)) uses electron-updater
with the GitHub provider. Where to look is baked into each build as `app-update.yml`, from
`publish` in `electron-builder.yml`. Shortly after launch and every four hours, it:

1. asks github.com which release is the latest. This uses the web endpoints, not the rate-
   limited API, so it needs no token. Drafts and pre-releases are invisible to it;
2. reads that release's `latest-mac.yml`. If the version is newer, it downloads the zip
   (only the changed blocks, when the previous zip is still cached) and checks its sha512;
3. hands it to Squirrel.Mac, which installs it only if it's signed by the same Developer ID
   team as the running app. It installs on quit, or right away with **Restart to update**.
   Downloads that the restart interrupts resume on the next launch.

That gives some rules:

- **Never change a published release.** Don't replace or delete its files: copies may be
  halfway through downloading them, and the sha512 in `latest-mac.yml` must keep matching.
  To fix a bad release, publish a newer version.
- **Every release needs all four files.** A latest release without `latest-mac.yml` stops
  updates for everyone (they report that the newest release can't be installed from inside
  hfgui).
- **Keep signing with the same team.** A renewed certificate from the same team is fine. A
  different team's signature is rejected by every installed copy.
- **The repo is part of the app.** `publish` in `electron-builder.yml` and `REPO` in
  `src/shared/project.ts` name it. If the repository is ever renamed or moved, keep the
  old location's releases working until most copies have updated past the change.
- **Pulling a release** (turning it back into a draft) stops new downloads of it, but copies
  that already installed it stay on it until a newer one is published.

## Download numbers

There is no analytics in the app. The numbers come from GitHub's download counter on each
release file:

```sh
npm run stats
```

| Counter | Means |
| --- | --- |
| **Installs** (the DMG) | People downloading the installer: new installs, and the odd re-download. |
| **Updates** (the zip) | Installed copies updating to that version. A week or two after a release, a fair count of the copies in use. |
| **Update checks** (`latest-mac.yml`) | Every running copy fetches it at launch and every four hours. It shows how much hfgui is used, not how many people use it. |

GitHub keeps only running totals. [`.github/workflows/stats.yml`](../.github/workflows/stats.yml)
saves a snapshot every day to `downloads.csv` on the `stats` branch, and `npm run stats`
then adds the last day, 7 days and 30 days. Its run summary on GitHub shows the same
table. The counters count requests, not people. They are public: anyone can read them
from GitHub's API.

## Testing updates end to end

```sh
npm run build && npm run e2e:update -- [screenshotDir]
```

This builds a throwaway `hfgui-update-test` app (its own bundle id and profile, never
hfgui's) as 0.0.1 and 0.0.2, both signed but not notarized, and serves 0.0.2 from a local
feed that stands in for GitHub. It then drives 0.0.1. The automatic check finds the update
and downloads it. A speed-capped model download is running when **Restart** is clicked.
Squirrel swaps the bundle and relaunches it, and the test checks that 0.0.2 resumes the
download by itself. It needs your Developer ID identity, takes several minutes, and
deletes everything it created. Run it after any change to the updater, the quit path, or
the build configuration.

## App icon

The icon's source is `build/icon.svg`. `npm run icon` re-renders `build/icon.png` and
`build/icon.icns` from it; commit all three. Keep the artwork on Apple's grid: an 824 px
rounded square with 100 px margins in a 1024 canvas. macOS 26 puts icons that stray from
that shape inside a grey tile. After building, check that Finder shows the icon on its own.

## Checking a build by hand

```sh
spctl --assess --type open --context context:primary-signature -v dist/hfgui-*-arm64.dmg
xcrun stapler validate dist/hfgui-*-arm64.dmg

# Mount at a fixed path: a stale "hfgui" volume would push the new one to "/Volumes/hfgui 1".
hdiutil attach -nobrowse -readonly -mountpoint /tmp/hfgui-verify dist/hfgui-*-arm64.dmg
codesign --verify --deep --strict --verbose=2 /tmp/hfgui-verify/hfgui.app
spctl -a -t exec -vv /tmp/hfgui-verify/hfgui.app
hdiutil detach /tmp/hfgui-verify
```
