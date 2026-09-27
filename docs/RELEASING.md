# Releasing hfgui (macOS, Apple Silicon)

## One-time setup

1. **Developer ID certificate** — in Xcode → Settings → Accounts → your Apple ID →
   Manage Certificates → **+** → *Developer ID Application*. (Or create it at
   developer.apple.com/account/resources/certificates with a CSR from Keychain
   Access.) Verify with:

   ```sh
   security find-identity -v -p codesigning   # should list "Developer ID Application: ..."
   ```

2. **Notarization credentials** — create an app-specific password at
   [account.apple.com](https://account.apple.com) (Sign-In and Security → App-Specific
   Passwords), find your Team ID at
   [developer.apple.com/account](https://developer.apple.com/account) (Membership
   details), then store both in the keychain:

   ```sh
   xcrun notarytool store-credentials hfgui \
     --apple-id jakub@sejkora.cz --team-id <TEAM_ID>
   ```

## Build, sign, notarize

```sh
export APPLE_KEYCHAIN_PROFILE=hfgui
npm run dist:mac
```

electron-builder signs the app with the Developer ID certificate (hardened
runtime + `build/entitlements.mac.plist`), submits it to Apple for
notarization, and staples the ticket. Output: `dist/hfgui-<version>-arm64.dmg`.

That notarizes the **app** only — electron-builder leaves the DMG container
unsigned (its own docs advise against `dmg.sign`, because a signed but
un-notarized DMG is rejected outright). Sign, notarize and staple the DMG as
well, so Gatekeeper accepts the download itself, even offline:

```sh
DMG=dist/hfgui-<version>-arm64.dmg
codesign --sign "Developer ID Application: JAKUB SEJKORA (T6C4HUSL99)" --timestamp "$DMG"
xcrun notarytool submit "$DMG" --keychain-profile hfgui --wait
xcrun stapler staple "$DMG"
```

Verify:

```sh
spctl --assess --type open --context context:primary-signature -v dist/hfgui-*-arm64.dmg
xcrun stapler validate dist/hfgui-*-arm64.dmg
```

Both must pass (`accepted`, `source=Notarized Developer ID`). To check the app
inside, mount at a fixed path — a stale `hfgui` volume would otherwise push the
new one to `/Volumes/hfgui 1`:

```sh
hdiutil attach -nobrowse -readonly -mountpoint /tmp/hfgui-verify dist/hfgui-*-arm64.dmg
codesign --verify --deep --strict --verbose=2 /tmp/hfgui-verify/hfgui.app
spctl -a -t exec -vv /tmp/hfgui-verify/hfgui.app
hdiutil detach /tmp/hfgui-verify
```

## App icon

The icon's source is `build/icon.svg`; `npm run icon` re-renders `build/icon.png`
and `build/icon.icns` from it (commit all three). Keep the artwork on Apple's
grid — an 824 px rounded square with 100 px margins in a 1024 canvas. macOS 26
puts icons that stray from that shape inside a grey tile; after building, check
the app in Finder shows the orange icon on its own, not framed in grey.

## Publish

```sh
gh release create v<version> dist/hfgui-<version>-arm64.dmg --title "hfgui <version>" --generate-notes
```
