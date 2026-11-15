import { readdir, rmdir, stat, unlink } from 'fs/promises'
import { dirname, sep } from 'path'

export async function sizeOf(path: string): Promise<number | null> {
  try {
    return (await stat(path)).size
  } catch {
    return null
  }
}

/** True when `path` is strictly inside `dir`. */
export function isInside(path: string, dir: string): boolean {
  return path.startsWith(dir.endsWith(sep) ? dir : dir + sep) && path !== dir
}

/**
 * Remove `start` and its parents while they are empty, stopping at — never
 * removing — `stopAt` (the destination folder, e.g. LM Studio's models folder).
 * A folder holding only Finder's .DS_Store counts as empty.
 */
export async function pruneEmptyDirs(start: string, stopAt: string): Promise<void> {
  let dir = start
  while (isInside(dir, stopAt)) {
    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch {
      return
    }
    if (entries.length === 1 && entries[0] === '.DS_Store') {
      await unlink(`${dir}${sep}.DS_Store`).catch(() => {})
    } else if (entries.length > 0) {
      return
    }
    try {
      await rmdir(dir)
    } catch {
      return
    }
    dir = dirname(dir)
  }
}
