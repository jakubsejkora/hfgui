import { join, resolve, sep } from 'path'

export { isValidRepoId } from '@shared/modelRef'

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
