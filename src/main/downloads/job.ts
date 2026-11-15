import { mkdir, readdir, rmdir, stat, unlink } from 'fs/promises'
import { safeJoin } from '../pathSafety'
import type {
  DownloadEvent,
  DownloadJobSnapshot,
  DownloadRequest,
  ExoRegistration,
  FileProgress,
  JobState
} from '@shared/types'
import { downloadFile } from './fileDownloader'
import type { LedgerEntry } from './ledger'
import { DownloadError, classifyError, isAbortError, resolveUrl } from './resolve'
import { sizeOf } from './storage'

export interface JobDeps {
  getToken(): string | null
  emit(ev: DownloadEvent): void
  persist(): void
  /** The download-wide speed cap, shared with every other job. */
  throttle(bytes: number, signal: AbortSignal): Promise<void> | null
  /** Record files this job is about to write, so unfinished data is never lost track of. */
  track(entries: LedgerEntry[]): void
  /** They form a finished model now (or were deleted): no longer leftovers-in-waiting. */
  untrack(paths: string[]): void
}

const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000]
const PROGRESS_INTERVAL_MS = 250

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export class DownloadJob {
  readonly jobId: string
  readonly repoId: string
  readonly revision: string
  readonly displayName: string
  readonly format: DownloadRequest['format']
  readonly destination: DownloadRequest['destination']
  readonly jobDir: string
  files: FileProgress[]
  state: JobState = 'queued'
  error: DownloadJobSnapshot['error'] = null
  createdAt: number
  completedAt: number | null = null
  exoRegistration: ExoRegistration | null = null
  /** Paused by the user rather than by quitting — "Resume on launch" skips these. */
  pausedByUser = false

  private deps: JobDeps
  private abortController: AbortController | null = null
  /** The in-flight run(), so cancel() can wait for the state it causes. */
  private runPromise: Promise<void> | null = null
  private pauseRequested = false
  private cancelRequested = false
  private deletePartialOnCancel = false

  // progress bookkeeping
  private lastEmitAt = 0
  private lastEmitBytes = 0
  private emaBytesPerSec = 0
  private currentFile: string | null = null

  constructor(req: DownloadRequest, jobDir: string, deps: JobDeps, jobId?: string) {
    this.jobId = jobId ?? `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    this.repoId = req.repoId
    this.revision = req.revision
    this.displayName = req.displayName
    this.format = req.format
    this.destination = req.destination
    this.jobDir = jobDir
    this.files = req.files.map((f) => ({
      path: f.path,
      size: f.size,
      sha256: f.sha256 ?? null,
      bytesDone: 0,
      state: 'pending'
    }))
    this.createdAt = Date.now()
    this.deps = deps
  }

  static fromSnapshot(snap: DownloadJobSnapshot, deps: JobDeps): DownloadJob {
    const job = new DownloadJob(
      {
        repoId: snap.repoId,
        revision: snap.revision,
        displayName: snap.displayName,
        format: snap.format,
        files: snap.files.map((f) => ({ path: f.path, size: f.size, sha256: f.sha256 ?? null })),
        destination: snap.destination
      },
      snap.jobDir,
      deps,
      snap.jobId
    )
    job.files = snap.files.map((f) => ({ ...f }))
    job.state = snap.state
    job.error = snap.error
    job.createdAt = snap.createdAt
    job.completedAt = snap.completedAt
    job.exoRegistration = snap.exoRegistration ?? null
    job.pausedByUser = snap.pausedByUser === true
    return job
  }

  get totalBytes(): number {
    return this.files.reduce((sum, f) => sum + f.size, 0)
  }

  get bytesDone(): number {
    return this.files.reduce((sum, f) => sum + f.bytesDone, 0)
  }

  get isActive(): boolean {
    return this.state === 'downloading' || this.state === 'verifying'
  }

  snapshot(): DownloadJobSnapshot {
    return {
      jobId: this.jobId,
      repoId: this.repoId,
      revision: this.revision,
      displayName: this.displayName,
      format: this.format,
      destination: { ...this.destination },
      jobDir: this.jobDir,
      files: this.files.map((f) => ({ ...f })),
      state: this.state,
      bytesDone: this.bytesDone,
      totalBytes: this.totalBytes,
      error: this.error,
      createdAt: this.createdAt,
      completedAt: this.completedAt,
      exoRegistration: this.exoRegistration ? { ...this.exoRegistration } : null,
      pausedByUser: this.pausedByUser
    }
  }

  setState(state: JobState): void {
    this.state = state
    this.deps.emit({ type: 'state', jobId: this.jobId, snapshot: this.snapshot() })
    this.deps.persist()
  }

  setExoRegistration(reg: ExoRegistration | null): void {
    this.exoRegistration = reg
    this.deps.emit({ type: 'state', jobId: this.jobId, snapshot: this.snapshot() })
    this.deps.persist()
  }

  // safeJoin also guards restore-from-snapshot: a tampered downloads.json
  // cannot place files outside the job dir.
  finalPathFor(filePath: string): string {
    return safeJoin(this.jobDir, filePath)
  }

  private emitProgress(force = false): void {
    const now = Date.now()
    if (!force && now - this.lastEmitAt < PROGRESS_INTERVAL_MS) return
    const dtSec = (now - this.lastEmitAt) / 1000
    const bytes = this.bytesDone
    if (this.lastEmitAt > 0 && dtSec > 0) {
      const inst = Math.max(0, bytes - this.lastEmitBytes) / dtSec
      this.emaBytesPerSec = this.emaBytesPerSec === 0 ? inst : 0.3 * inst + 0.7 * this.emaBytesPerSec
    }
    this.lastEmitAt = now
    this.lastEmitBytes = bytes
    const remaining = this.totalBytes - bytes
    this.deps.emit({
      type: 'progress',
      jobId: this.jobId,
      bytesDone: bytes,
      totalBytes: this.totalBytes,
      bytesPerSec: this.emaBytesPerSec,
      etaSec: this.emaBytesPerSec > 1 ? remaining / this.emaBytesPerSec : null,
      currentFile: this.currentFile
    })
  }

  /** Runs the whole job; never rejects — terminal state is reflected in `state`. */
  run(): Promise<void> {
    const running = this.runToEnd()
    this.runPromise = running
    void running.finally(() => {
      if (this.runPromise === running) this.runPromise = null
    })
    return running
  }

  private async runToEnd(): Promise<void> {
    this.abortController = new AbortController()
    this.pauseRequested = false
    const signal = this.abortController.signal
    this.lastEmitAt = 0
    this.lastEmitBytes = 0
    this.emaBytesPerSec = 0
    this.setState('downloading')
    this.deps.track(this.dataEntries())

    try {
      await mkdir(this.jobDir, { recursive: true })
      const token = this.deps.getToken()

      for (const file of this.files) {
        this.currentFile = file.path
        if (file.state !== 'done') file.state = 'active'

        let attempt = 0
        // downloadFile early-returns when the final file already exists.
        for (;;) {
          try {
            await downloadFile({
              url: resolveUrl(this.repoId, this.revision, file.path),
              destPath: this.finalPathFor(file.path),
              expectedSize: file.size,
              sha256: file.sha256 ?? null,
              token,
              signal,
              throttle: this.deps.throttle,
              onProgress: (bytesDone) => {
                file.bytesDone = bytesDone
                this.emitProgress()
              },
              // Bytes already on disk never crossed the network. Shift the speed
              // sampler's baseline past them, or a file that already exists reads
              // as a TB/s burst with a 0 s ETA.
              onDiskBytes: (bytes) => {
                this.lastEmitBytes += Math.max(0, bytes - file.bytesDone)
              }
            })
            break
          } catch (e) {
            if (isAbortError(e)) throw e
            const err = classifyError(e)
            if (err.retryable && attempt < RETRY_DELAYS_MS.length) {
              await sleep(RETRY_DELAYS_MS[attempt], signal)
              attempt++
              continue
            }
            throw err
          }
        }

        file.state = 'done'
        file.bytesDone = file.size
        this.emitProgress(true)
        this.deps.persist()
      }

      this.currentFile = null
      this.setState('verifying')
      for (const file of this.files) {
        const s = await stat(this.finalPathFor(file.path)).catch(() => null)
        if (!s || s.size !== file.size) {
          throw new DownloadError('size-mismatch', `Verification failed for ${file.path}`)
        }
      }
      this.completedAt = Date.now()
      // A model now, not a leftover-in-waiting.
      this.deps.untrack(this.dataEntries().map((e) => e.path))
      this.setState('completed')
    } catch (e) {
      if (this.cancelRequested) {
        if (this.deletePartialOnCancel) await this.cleanupPartials()
        this.setState('cancelled')
      } else if (this.pauseRequested || isAbortError(e)) {
        for (const f of this.files) {
          if (f.state === 'active') f.state = 'pending'
        }
        this.setState('paused')
      } else {
        const err = classifyError(e)
        this.error = { code: err.code, message: err.message }
        this.setState('error')
      }
    } finally {
      this.abortController = null
      this.currentFile = null
    }
  }

  /** Request a pause; the running stream aborts and the job lands in `paused`. */
  pause(): void {
    if (this.state === 'queued') {
      this.setState('paused')
      return
    }
    if (!this.isActive) return
    this.pauseRequested = true
    this.abortController?.abort()
  }

  prepareResume(): void {
    this.pausedByUser = false
    this.error = null
    this.cancelRequested = false
    this.pauseRequested = false
    this.setState('queued')
  }

  async cancel(deletePartial: boolean): Promise<void> {
    // A finished download has nothing left to cancel; relabelling it "Stopped"
    // would misreport files that are complete on disk.
    if (this.state === 'completed') return
    this.deletePartialOnCancel = deletePartial
    if (this.isActive) {
      this.cancelRequested = true
      this.abortController?.abort()
      // run() finishes the transition. Resolve only once it has, so callers can
      // chain on the final state — remove-after-cancel ("Undo") relies on it.
      await this.runPromise
      return
    }
    if (deletePartial) await this.cleanupPartials()
    this.setState('cancelled')
  }

  private async cleanupPartials(): Promise<void> {
    for (const file of this.files) {
      if (file.state === 'done') continue
      try {
        await unlink(`${this.finalPathFor(file.path)}.partial`)
      } catch {
        /* best-effort — also swallows safeJoin throws on tampered snapshots */
      }
    }
    // Remove the job dir if we left nothing useful behind.
    try {
      const entries = await readdir(this.jobDir)
      if (entries.length === 0) await rmdir(this.jobDir)
    } catch {
      /* best-effort */
    }
  }

  /** The files this job writes — each finished file and its .partial — for the ledger. */
  dataEntries(): LedgerEntry[] {
    const out: LedgerEntry[] = []
    for (const f of this.files) {
      let final: string
      try {
        final = this.finalPathFor(f.path)
      } catch {
        continue // a tampered snapshot path — never touch it
      }
      const base = { jobDir: this.jobDir, baseDir: this.destination.baseDir }
      out.push({ path: final, ...base }, { path: `${final}.partial`, ...base })
    }
    return out
  }

  /** Bytes this job currently occupies on disk: finished files plus partials. */
  async bytesOnDisk(): Promise<number> {
    let total = 0
    for (const e of this.dataEntries()) total += (await sizeOf(e.path)) ?? 0
    return total
  }

  /** Every file present at its expected size — false once moved, deleted or truncated. */
  async filesIntact(): Promise<boolean> {
    for (const f of this.files) {
      let final: string
      try {
        final = this.finalPathFor(f.path)
      } catch {
        return false
      }
      if ((await sizeOf(final)) !== f.size) return false
    }
    return true
  }

  /** After its data was deleted: start over from zero, and say so. */
  resetProgress(): void {
    for (const f of this.files) {
      f.bytesDone = 0
      f.state = 'pending'
    }
    this.deps.emit({ type: 'state', jobId: this.jobId, snapshot: this.snapshot() })
    this.deps.persist()
  }
}
