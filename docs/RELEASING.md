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

Verify:

```sh
spctl --assess --type open --context context:primary-signature -v dist/hfgui-*-arm64.dmg
xcrun stapler validate dist/hfgui-*-arm64.dmg
```

## Publish

```sh
gh release create v<version> dist/hfgui-<version>-arm64.dmg --title "hfgui <version>" --generate-notes
```
