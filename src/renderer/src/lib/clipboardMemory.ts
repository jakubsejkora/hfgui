/**
 * Repo ids the clipboard chip must not offer: ones the user dismissed, and ones
 * hfgui itself just copied ("Copy link") — offering your own copy back on the
 * next focus would be noise. Module-level so it outlives the chip component,
 * which unmounts while the omnibox holds a link.
 */
const ignored = new Set<string>()

export function ignoreClipboardRepo(repoId: string): void {
  ignored.add(repoId.toLowerCase())
}

export function isClipboardRepoIgnored(repoId: string): boolean {
  return ignored.has(repoId.toLowerCase())
}
