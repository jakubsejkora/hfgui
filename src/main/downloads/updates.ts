import { createHash } from 'crypto'
import { existsSync } from 'fs'
import { copyFile, link, mkdir, open, readFile, readdir, rename, rm, rmdir, stat } from 'fs/promises'
import { dirname, join } from 'path'
import type { ModelFormat } from '@shared/types'

/*
 * Newer versions of finished downloads. Publishers fix chat templates and
 * tokenizer configs, re-quantize, or re-shard after release; a download pins
 * the exact revision it got, so comparing that with the Hub's latest tells
 * what changed — usually a few small files, not the weights.
 */

export const HUB = 'https://huggingface.co'
const HUB_TIMEOUT_MS = 30_000

/** A file in a repo at one revision, as the Hub's tree API lists it. */
export interface HubFile {
  path: string
  size: number
  /** Git blob id (sha1). For LFS files, the pointer's. */
  oid: string
  /** The content's sha256, for files stored in LFS (all large ones). */
  lfs: { oid: string } | null
}

export interface LatestVersion {
  revision: string
  lastModified: string | null
  files: HubFile[]
}

/** The repo is gone (deleted, renamed, or made private). */
export class HubMissingError extends Error {}

export interface HubOptions {
  token: string | null
  fetch?: typeof fetch
  hub?: string
}

async function getJson(url: string, opts: HubOptions): Promise<{ body: unknown; next: string | null }> {
  let res: Response
  try {
    res = await (opts.fetch ?? fetch)(url, {
      headers: opts.token ? { Authorization: `Bearer ${opts.token}` } : {},
      // A stalled Hub must not leave "Starting…" spinning for ever.
      signal: AbortSignal.timeout(HUB_TIMEOUT_MS)
    })
  } catch (e) {
    throw new Error(
      (e as Error).name === 'TimeoutError' ? 'Hugging Face didn’t answer in time — try again in a moment' : (e as Error).message
    )
  }
  if (res.status === 404) throw new HubMissingError('This model is no longer on Hugging Face')
  if (res.status === 401 || res.status === 403) throw new Error('Needs a Hugging Face token')
  if (!res.ok) throw new Error(`Hugging Face answered HTTP ${res.status}`)
  const next = res.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null
  return { body: await res.json(), next: next ? new URL(next, url).toString() : null }
}

const repoPath = (repoId: string): string => repoId.split('/').map(encodeURIComponent).join('/')

/** The repo's current revision. One small request: enough to see nothing changed. */
export async function fetchRevision(
  repoId: string,
  opts: HubOptions
): Promise<{ revision: string; lastModified: string | null }> {
  const { body } = await getJson(`${opts.hub ?? HUB}/api/models/${repoPath(repoId)}`, opts)
  const info = body as { sha?: unknown; lastModified?: unknown }
  if (typeof info.sha !== 'string') throw new Error('Hugging Face didn’t say which version is current')
  return { revision: info.sha, lastModified: typeof info.lastModified === 'string' ? info.lastModified : null }
}

/** The repo's latest revision and every file in it. */
export async function fetchLatest(repoId: string, opts: HubOptions): Promise<LatestVersion> {
  const { revision, lastModified } = await fetchRevision(repoId, opts)
  return { revision, lastModified, files: await fetchFiles(repoId, revision, opts) }
}

/** Every file in the repo at `revision`. */
export async function fetchFiles(repoId: string, revision: string, opts: HubOptions): Promise<HubFile[]> {
  const files: HubFile[] = []
  // Big repos page their file list.
  let url: string | null = `${opts.hub ?? HUB}/api/models/${repoPath(repoId)}/tree/${revision}?recursive=1`
  while (url) {
    const page = await getJson(url, opts)
    for (const e of page.body as Array<Record<string, unknown>>) {
      if (e.type !== 'file' || typeof e.path !== 'string' || typeof e.size !== 'number') continue
      const lfs = e.lfs as { oid?: unknown } | undefined
      files.push({
        path: e.path,
        size: e.size,
        oid: typeof e.oid === 'string' ? e.oid : '',
        lfs: typeof lfs?.oid === 'string' ? { oid: lfs.oid } : null
      })
    }
    url = page.next
  }
  return files
}

/** Above this, a file not in LFS isn't hashed: the Hub keeps big files in LFS. */
const MAX_BLOB_HASH = 64 * 1024 * 1024

/** git's id for a file: sha1 of "blob <size>\0" + bytes. Null if it can't be read. */
export async function gitBlobOid(path: string, size?: number): Promise<string | null> {
  if (size !== undefined && size > MAX_BLOB_HASH) return null
  try {
    const bytes = await readFile(path)
    return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
  } catch {
    return null
  }
}

/** Docs, licences, images and hidden files: a change to these alone isn't worth an update. */
export function isCosmetic(path: string): boolean {
  if (path.split('/').some((part) => part.startsWith('.'))) return true
  const name = path.split('/').pop()!.toLowerCase()
  return (
    /^(readme|licen[cs]e|notice|changelog|citation|usage_policy)([._-].*)?$/.test(name) ||
    /\.(md|png|jpe?g|gif|svg|webp)$/.test(name)
  )
}

export interface DownloadedVersion {
  format: ModelFormat
  files: ReadonlyArray<{ path: string; size: number; sha256?: string | null }>
}

export interface UpdatePlan {
  revision: string
  lastModified: string | null
  /** The new version's files. */
  files: Array<{ path: string; size: number; sha256: string | null }>
  /** Byte-for-byte the same as what's on disk: shared with the old version. */
  same: string[]
  /** Changed or new: downloaded. */
  fetch: string[]
}

export type Planned =
  | { kind: 'current' }
  | { kind: 'gone' }
  | { kind: 'available'; plan: UpdatePlan; changed: string[]; fetchBytes: number }

/**
 * What a download's newer version needs. GGUF downloads are one size out of
 * many, so only their own files count; any other format is the whole repo,
 * so new files belong to it too. `localOids` holds the git ids of the
 * downloaded small files, which have no sha256 on record.
 */
export function planUpdate(
  mine: DownloadedVersion,
  latest: LatestVersion,
  localOids: ReadonlyMap<string, string | null>
): Planned {
  const now = new Map(latest.files.map((f) => [f.path, f]))
  const wholeRepo = mine.format !== 'gguf'
  const files: UpdatePlan['files'] = []
  const same: string[] = []
  const fetch: string[] = []
  const removed: string[] = []

  for (const had of mine.files) {
    const next = now.get(had.path)
    if (!next) {
      // A GGUF size that was renamed or deleted can't be followed automatically.
      if (!wholeRepo) return { kind: 'gone' }
      removed.push(had.path)
      continue
    }
    files.push({ path: next.path, size: next.size, sha256: next.lfs?.oid ?? null })
    const unchanged = next.lfs
      ? had.sha256
        ? had.sha256 === next.lfs.oid
        : had.size === next.size
      : localOids.get(had.path) === next.oid
    ;(unchanged ? same : fetch).push(next.path)
  }
  if (wholeRepo) {
    const had = new Set(mine.files.map((f) => f.path))
    for (const next of latest.files) {
      if (had.has(next.path) || next.path === '.gitattributes') continue
      files.push({ path: next.path, size: next.size, sha256: next.lfs?.oid ?? null })
      fetch.push(next.path)
    }
  }

  const changed = [...fetch, ...removed].filter((p) => !isCosmetic(p))
  if (changed.length === 0) return { kind: 'current' }
  const sizes = new Map(files.map((f) => [f.path, f.size]))
  return {
    kind: 'available',
    plan: { revision: latest.revision, lastModified: latest.lastModified, files, same, fetch },
    changed,
    fetchBytes: fetch.reduce((sum, p) => sum + (sizes.get(p) ?? 0), 0)
  }
}

/** Above this, a file another version already has is hard-linked rather than copied. */
export const LINK_MIN_BYTES = 64 * 1024 * 1024

/**
 * Make `dst` a copy of `src` that costs no download. Large files (the weights)
 * become hard links: instant, no extra space, and nobody edits weights in
 * place. Small ones (configs, templates) are plain copies, so editing one
 * version's never changes the other's. False when a link can't be made (a
 * drive without hard links); the caller downloads the file instead.
 *
 * Not APFS clones: Node's COPYFILE_FICLONE quietly falls back to a byte copy
 * on macOS, and the first version of this copied a 510 GB model to update
 * 150 KB of it.
 */
export async function shareFile(src: string, dst: string): Promise<boolean> {
  await mkdir(dirname(dst), { recursive: true })
  await rm(dst, { force: true })
  if ((await stat(src)).size <= LINK_MIN_BYTES) {
    await copyFile(src, dst)
    return true
  }
  try {
    await link(src, dst)
    return true
  } catch {
    return false
  }
}

/**
 * Turn `copy` into a hard link to `original` when they are two copies of the
 * same file on one drive, freeing the copy's space. Atomic: a link is made
 * beside the copy and renamed over it. True if it was a separate copy.
 */
export async function relinkCopy(original: string, copy: string): Promise<boolean> {
  const [a, b] = await Promise.all([stat(original), stat(copy)])
  if (a.ino === b.ino || a.dev !== b.dev || a.size !== b.size) return false
  // Records say they are the same file; check their first and last bytes too.
  if (!(await sameEnds(original, copy, a.size))) return false
  const tmp = `${copy}.hfgui-relink`
  await rm(tmp, { force: true })
  await link(original, tmp)
  await rename(tmp, copy)
  return true
}

const END_BYTES = 64 * 1024

/** The first and last 64 KB of two files of `size` bytes are identical. */
async function sameEnds(a: string, b: string, size: number): Promise<boolean> {
  const read = async (path: string): Promise<Buffer> => {
    const fh = await open(path, 'r')
    try {
      const n = Math.min(END_BYTES, size)
      const head = Buffer.alloc(n)
      const tail = Buffer.alloc(n)
      await fh.read(head, 0, n, 0)
      await fh.read(tail, 0, n, Math.max(0, size - n))
      return Buffer.concat([head, tail])
    } finally {
      await fh.close()
    }
  }
  const [x, y] = await Promise.all([read(a), read(b)])
  return x.equals(y)
}

/**
 * Remove `dir` when nothing but empty folders (and Finder's .DS_Store) is left
 * in it — what an update's staging folder is once its files have moved in.
 * Never deletes a file. True if it is gone.
 */
export async function removeEmptyTree(dir: string): Promise<boolean> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return false
  }
  let empty = true
  for (const e of entries) {
    if (e.isDirectory()) empty = (await removeEmptyTree(join(dir, e.name))) && empty
    else if (e.name !== '.DS_Store') empty = false
  }
  if (!empty) return false
  await rm(join(dir, '.DS_Store'), { force: true })
  await rmdir(dir).catch(() => {})
  return !existsSync(dir)
}

/** `<dir>@<short revision>`, or with -2, -3… if that name is taken. */
export function versionedName(dir: string, revision: string, taken: (p: string) => boolean): string {
  const base = `${dir}@${revision.slice(0, 7)}`
  if (!taken(base)) return base
  for (let n = 2; ; n++) if (!taken(`${base}-${n}`)) return `${base}-${n}`
}
