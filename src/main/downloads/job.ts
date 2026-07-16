import { mkdir, readdir, rm, rmdir, stat, unlink } from 'fs/promises'
import { join } from 'path'
import type {
  DownloadEvent,
  DownloadJobSnapshot,
  DownloadRequest,
  ExoRegistration,
  FileProgress,
  JobState
} from '@shared/types'
import { downloadFile } from './fileDownloader'
import { DownloadError, isAbortError, resolveUrl } from './resolve'

export interface JobDeps {
  getToken(): string | null
  emit(ev: DownloadEvent): void
  persist(): void
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

  private deps: JobDeps
  private abortController: AbortController | null = null
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
    this.files = req.files.map((f) => ({ path: f.path, size: f.size, bytesDone: 0, state: 'pending' }))
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
        files: snap.files.map((f) => ({ path: f.path, size: f.size })),
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
      exoRegistration: this.exoRegistration ? { ...this.exoRegistration } : null
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

  finalPathFor(filePath: string): string {
    return join(this.jobDir, ...filePath.split('/'))
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
  async run(): Promise<void> {
    this.abortController = new AbortController()
    this.pauseRequested = false
    const signal = this.abortController.signal
    this.lastEmitAt = 0
    this.lastEmitBytes = 0
    this.emaBytesPerSec = 0
    this.setState('downloading')

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
              token,
              signal,
              onProgress: (bytesDone) => {
                file.bytesDone = bytesDone
                this.emitProgress()
              }
            })
            break
          } catch (e) {
            if (isAbortError(e)) throw e
            const err = e instanceof DownloadError ? e : new DownloadError('unknown', String(e))
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
        const err = e instanceof DownloadError ? e : new DownloadError('unknown', String(e))
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
    this.error = null
    this.cancelRequested = false
    this.pauseRequested = false
    this.setState('queued')
  }

  async cancel(deletePartial: boolean): Promise<void> {
    this.deletePartialOnCancel = deletePartial
    if (this.isActive) {
      this.cancelRequested = true
      this.abortController?.abort()
      return // run() finishes the transition
    }
    if (deletePartial) await this.cleanupPartials()
    this.setState('cancelled')
  }

  private async cleanupPartials(): Promise<void> {
    for (const file of this.files) {
      if (file.state === 'done') continue
      await unlink(`${this.finalPathFor(file.path)}.partial`).catch(() => {})
    }
    // Remove the job dir if we left nothing useful behind.
    try {
      const entries = await readdir(this.jobDir)
      if (entries.length === 0) await rmdir(this.jobDir)
    } catch {
      /* best-effort */
    }
  }

  /** Delete everything this job wrote (used by remove-with-files, not exposed yet). */
  async deleteAllFiles(): Promise<void> {
    await rm(this.jobDir, { recursive: true, force: true })
  }
}
