import { createHash } from 'crypto'
import { constants, existsSync } from 'fs'
import { copyFile, link, mkdir, readFile, rm, stat, statfs } from 'fs/promises'
import { dirname } from 'path'
import type { ModelFormat } from '@shared/types'

/*
 * Newer versions of finished downloads. Publishers fix chat templates and
 * tokenizer configs, re-quantize, or re-shard after release; a download pins
 * the exact revision it got, so comparing that with the Hub's latest tells
 * what changed — usually a few small files, not the weights.
 */

export const HUB = 'https://huggingface.co'

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
  const res = await (opts.fetch ?? fetch)(url, {
    headers: opts.token ? { Authorization: `Bearer ${opts.token}` } : {}
  })
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

/**
 * Whether files in `dir` can be cloned: APFS, where a copy shares its blocks
 * until either side changes. Every APFS volume reports the startup disk's
 * filesystem type. Asked first because Node can't force a clone on macOS
 * (ENOSYS) — and the fallback, a full copy of a 360 GB model, is no option.
 */
export async function canClone(dir: string): Promise<boolean> {
  if (process.platform !== 'darwin') return false
  let probe = dir
  while (!existsSync(probe) && dirname(probe) !== probe) probe = dirname(probe)
  try {
    const [here, startup] = await Promise.all([statfs(probe), statfs('/')])
    return here.type === startup.type
  } catch {
    return false
  }
}

/**
 * Make `dst` a copy of `src` that takes no extra space: an APFS clone (copy on
 * write, so the two never affect each other), or a hard link where there are
 * no clones. False when neither works; the caller downloads the file instead.
 */
export async function shareFile(src: string, dst: string, clone: boolean): Promise<boolean> {
  await mkdir(dirname(dst), { recursive: true })
  await rm(dst, { force: true })
  // A clone only happens within one volume; across volumes it would be a full copy.
  if (clone && (await stat(src)).dev === (await stat(dirname(dst))).dev) {
    try {
      await copyFile(src, dst, constants.COPYFILE_FICLONE)
      return true
    } catch {
      /* fall through */
    }
  }
  try {
    await link(src, dst)
    return true
  } catch {
    return false
  }
}

/** `<dir>@<short revision>`, or with -2, -3… if that name is taken. */
export function versionedName(dir: string, revision: string, taken: (p: string) => boolean): string {
  const base = `${dir}@${revision.slice(0, 7)}`
  if (!taken(base)) return base
  for (let n = 2; ; n++) if (!taken(`${base}-${n}`)) return `${base}-${n}`
}
