import { join, resolve, sep } from 'path'

/** Matches HF's namespace/name charset; excludes `.`/`..`, empty, and leading dots. */
const SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** HF repo ids are exactly "namespace/name". */
export function isValidRepoId(repoId: string): boolean {
  const segments = repoId.split('/')
  return segments.length === 2 && segments.every((s) => SEGMENT_RE.test(s))
}

/** Repo-relative file path from the Hub tree: forward slashes, no escapes. */
export function isSafeRelPath(p: string): boolean {
  if (!p || p.includes('\\') || p.includes('\0')) return false
  return p.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..')
}

/**
 * join() that refuses to land outside baseDir — defense-in-depth for paths
 * that originate from the Hub or a persisted snapshot.
 */
export function safeJoin(baseDir: string, relPath: string): string {
  const result = join(baseDir, ...relPath.split('/'))
  if (!resolve(result).startsWith(resolve(baseDir) + sep)) {
    throw new Error(`Refusing to write outside ${baseDir}: ${relPath}`)
  }
  return result
}
