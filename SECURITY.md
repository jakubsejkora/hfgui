# Security

## Reporting a vulnerability

Please report security problems privately, not in a public issue: on GitHub, open the
repository's **Security** tab and choose **Report a vulnerability**
([direct link](https://github.com/jakubsejkora/hfgui/security/advisories/new)). You'll get a
reply within a few days, and credit in the release notes once a fix ships, if you want it.

Only the latest release is supported. Installed copies update themselves, so a fix reaches
everyone who keeps automatic updates on.

## What counts

Anything that lets hfgui be used against the person running it. For example:

- the Hugging Face token leaking — to the window's web content, to a host other than
  huggingface.co, into logs or onto disk unencrypted when hfgui stored it;
- writing or deleting files outside the folders a download was meant for (path traversal
  through a repository's file names, the cleanup deleting something hfgui didn't write);
- getting hfgui to install an update that isn't from its releases, or isn't signed by its
  developer;
- web content (a model card, a link, a dropped URL) gaining access to the IPC bridge or
  Node.js.

## How hfgui is built to resist them

- The window is sandboxed with context isolation; it reaches the main process only through
  a typed IPC bridge, whose handlers validate repository ids and file paths.
- The Hugging Face token never reaches the window. The main process adds it to requests to
  `huggingface.co/api/*` at the network layer, and to file downloads only up to the CDN
  redirect. It is stored encrypted with macOS's keychain-backed `safeStorage`.
- Downloads are written only below the destination folder, verified against the Hub's
  sha256 where it publishes one, and moved into place atomically. Cleanup deletes only files
  hfgui recorded writing.
- Releases are signed with a Developer ID and notarized by Apple. Updates are checked
  against the sha512 in the release's `latest-mac.yml`, and Squirrel.Mac installs them only
  if they are signed by the same developer as the running app.
