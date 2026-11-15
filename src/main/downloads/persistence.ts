import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname } from 'path'
import type { DownloadErrorCode, DownloadJobSnapshot, JobState } from '@shared/types'

const JOB_STATES: ReadonlySet<string> = new Set<JobState>([
  'queued',
  'downloading',
  'verifying',
  'completed',
  'paused',
  'cancelled',
  'error'
])
const DESTINATION_KINDS: ReadonlySet<string> = new Set(['lmstudio', 'exo', 'custom'])
const FILE_STATES: ReadonlySet<string> = new Set(['pending', 'active', 'done'])

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null

/**
 * Restores one saved job, or returns null when the entry is unusable. A hand
 * edit, a stray `null` or a format change between versions used to throw inside
 * DownloadManager.init() — before the window existed — leaving the app running
 * with no window at all.
 */
export function restoreSnapshot(raw: unknown): DownloadJobSnapshot | null {
  if (!isObject(raw)) return null
  const { jobId, repoId, jobDir, state, files, destination, createdAt } = raw
  if (
    typeof jobId !== 'string' ||
    typeof repoId !== 'string' ||
    typeof jobDir !== 'string' ||
    typeof state !== 'string' ||
    !JOB_STATES.has(state) ||
    typeof createdAt !== 'number' ||
    !isObject(destination) ||
    typeof destination.kind !== 'string' ||
    !DESTINATION_KINDS.has(destination.kind) ||
    typeof destination.baseDir !== 'string' ||
    !Array.isArray(files) ||
    files.length === 0
  ) {
    return null
  }

  const restoredFiles: DownloadJobSnapshot['files'] = []
  for (const f of files) {
    if (!isObject(f) || typeof f.path !== 'string' || typeof f.size !== 'number' || f.size < 0) {
      return null
    }
    restoredFiles.push({
      path: f.path,
      size: f.size,
      sha256: typeof f.sha256 === 'string' ? f.sha256 : null,
      bytesDone: typeof f.bytesDone === 'number' ? Math.min(Math.max(0, f.bytesDone), f.size) : 0,
      state: typeof f.state === 'string' && FILE_STATES.has(f.state) ? (f.state as 'pending') : 'pending'
    })
  }

  const snap = raw as unknown as DownloadJobSnapshot
  return {
    ...snap,
    revision: typeof raw.revision === 'string' ? raw.revision : 'main',
    displayName: typeof raw.displayName === 'string' ? raw.displayName : repoId,
    format: raw.format === 'gguf' || raw.format === 'mlx' ? raw.format : 'other',
    destination: {
      kind: destination.kind as DownloadJobSnapshot['destination']['kind'],
      baseDir: destination.baseDir
    },
    files: restoredFiles,
    bytesDone: restoredFiles.reduce((sum, f) => sum + f.bytesDone, 0),
    totalBytes: restoredFiles.reduce((sum, f) => sum + f.size, 0),
    error: isObject(raw.error)
      ? {
          code: (typeof raw.error.code === 'string' ? raw.error.code : 'unknown') as DownloadErrorCode,
          message: typeof raw.error.message === 'string' ? raw.error.message : ''
        }
      : null,
    completedAt: typeof raw.completedAt === 'number' ? raw.completedAt : null,
    exoRegistration: isObject(raw.exoRegistration) ? snap.exoRegistration : null,
    update:
      isObject(raw.update) && typeof raw.update.of === 'string' && typeof raw.update.fromRevision === 'string'
        ? {
            of: raw.update.of,
            fromRevision: raw.update.fromRevision,
            pendingMove: typeof raw.update.pendingMove === 'string' ? raw.update.pendingMove : null,
            keepOld: raw.update.keepOld !== false,
            aside: typeof raw.update.aside === 'string' ? raw.update.aside : null,
            stage:
              raw.update.stage === 'aside' || raw.update.stage === 'place' || raw.update.stage === 'drop'
                ? raw.update.stage
                : null
          }
        : null,
    supersededBy: typeof raw.supersededBy === 'string' ? raw.supersededBy : null
  }
}

export class Persistence {
  private file: string
  private timer: NodeJS.Timeout | null = null
  private getSnapshots: (() => DownloadJobSnapshot[]) | null = null
  private writing: Promise<void> = Promise.resolve()

  constructor(file: string) {
    this.file = file
  }

  async load(): Promise<DownloadJobSnapshot[]> {
    let parsed: unknown
    try {
      parsed = JSON.parse(await readFile(this.file, 'utf8'))
    } catch {
      return []
    }
    if (!Array.isArray(parsed)) return []
    const restored: DownloadJobSnapshot[] = []
    for (const entry of parsed) {
      const snap = restoreSnapshot(entry)
      if (snap) restored.push(snap)
      else console.warn('[hfgui] skipping an unreadable entry in downloads.json')
    }
    return restored
  }

  bind(getSnapshots: () => DownloadJobSnapshot[]): void {
    this.getSnapshots = getSnapshots
  }

  /** Debounced save — call freely on every state change. */
  schedule(): void {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.flush().catch((e) => console.error('[hfgui] could not save downloads.json:', e))
    }, 500)
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (!this.getSnapshots) return
    const data = JSON.stringify(this.getSnapshots(), null, 2)
    // Serialize writes so tmp-file renames never race. The leading catch keeps
    // one failed write (a full disk, say) from poisoning the chain — without it
    // every later save was skipped for the rest of the session.
    const write = this.writing
      .catch(() => {})
      .then(async () => {
        await mkdir(dirname(this.file), { recursive: true })
        const tmp = `${this.file}.tmp`
        await writeFile(tmp, data, 'utf8')
        await rename(tmp, this.file)
      })
    this.writing = write
    await write
  }
}
