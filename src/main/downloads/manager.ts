import { join } from 'path'
import type {
  DownloadEvent,
  DownloadJobSnapshot,
  DownloadRequest,
  ExoRegistration,
  StartDownloadResult
} from '@shared/types'
import { checkDiskSpace } from '../system'
import { DownloadJob, type JobDeps } from './job'
import { Persistence } from './persistence'

export interface ManagerDeps {
  userDataDir: string
  getToken(): string | null
  getMaxConcurrent(): number
  getAutoResume(): boolean
  registerInExo(repoId: string): Promise<ExoRegistration>
}

const ACTIVE_STATES = new Set(['queued', 'downloading', 'verifying'])
const RESUMABLE_STATES = new Set(['paused', 'error', 'cancelled'])

export class DownloadManager {
  private jobs = new Map<string, DownloadJob>()
  private listeners = new Set<(ev: DownloadEvent) => void>()
  private persistence: Persistence
  private deps: ManagerDeps
  private exoRegistrationsInFlight = new Set<string>()

  constructor(deps: ManagerDeps) {
    this.deps = deps
    this.persistence = new Persistence(join(deps.userDataDir, 'downloads.json'))
    this.persistence.bind(() => this.list())
  }

  private jobDeps(): JobDeps {
    return {
      getToken: () => this.deps.getToken(),
      emit: (ev) => this.emit(ev),
      persist: () => this.persistence.schedule()
    }
  }

  async init(): Promise<void> {
    const snapshots = await this.persistence.load()
    for (const snap of snapshots) {
      // Anything that was in flight when the app quit resumes as paused.
      if (ACTIVE_STATES.has(snap.state)) {
        snap.state = 'paused'
        for (const f of snap.files) {
          if (f.state === 'active') f.state = 'pending'
        }
      }
      const job = DownloadJob.fromSnapshot(snap, this.jobDeps())
      this.jobs.set(job.jobId, job)
    }
    if (this.deps.getAutoResume()) {
      for (const job of this.jobs.values()) {
        if (job.state === 'paused') job.prepareResume()
      }
    }
    this.pump()
    // Pick up registrations missed because exo wasn't running (or the app quit).
    for (const job of this.jobs.values()) {
      if (
        job.state === 'completed' &&
        job.destination.kind === 'exo' &&
        (job.exoRegistration === null || job.exoRegistration.status === 'exo-offline')
      ) {
        void this.registerJobInExo(job)
      }
    }
  }

  onEvent(cb: (ev: DownloadEvent) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private emit(ev: DownloadEvent): void {
    for (const cb of this.listeners) cb(ev)
  }

  list(): DownloadJobSnapshot[] {
    return [...this.jobs.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((j) => j.snapshot())
  }

  async start(req: DownloadRequest, jobDir: string): Promise<StartDownloadResult> {
    if (!req.files.length) {
      return { ok: false, code: 'invalid', message: 'No files to download' }
    }

    const incoming = new Set(req.files.map((f) => f.path))
    for (const job of this.jobs.values()) {
      if (
        job.repoId === req.repoId &&
        job.jobDir === jobDir &&
        (ACTIVE_STATES.has(job.state) || job.state === 'paused') &&
        job.files.some((f) => incoming.has(f.path))
      ) {
        return { ok: false, code: 'duplicate', message: 'Already downloading to this destination' }
      }
    }

    const totalBytes = req.files.reduce((sum, f) => sum + f.size, 0)
    const { freeBytes } = await checkDiskSpace(jobDir).catch(() => ({ freeBytes: Infinity }))
    if (freeBytes < totalBytes * 1.05) {
      return {
        ok: false,
        code: 'disk-full',
        message: 'Not enough free disk space at the destination'
      }
    }

    const job = new DownloadJob(req, jobDir, this.jobDeps())
    this.jobs.set(job.jobId, job)
    job.setState('queued')
    this.pump()
    return { ok: true, jobId: job.jobId }
  }

  private pump(): void {
    const running = [...this.jobs.values()].filter((j) => j.isActive).length
    const slots = Math.max(0, this.deps.getMaxConcurrent() - running)
    if (slots === 0) return
    const queued = [...this.jobs.values()]
      .filter((j) => j.state === 'queued')
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, slots)
    for (const job of queued) {
      void job.run().finally(() => {
        if (job.state === 'completed' && job.destination.kind === 'exo') {
          void this.registerJobInExo(job)
        }
        this.pump()
      })
    }
  }

  /** exo lists models from its card registry, so completed exo downloads are registered via its API. */
  private async registerJobInExo(job: DownloadJob): Promise<void> {
    if (this.exoRegistrationsInFlight.has(job.jobId)) return
    this.exoRegistrationsInFlight.add(job.jobId)
    try {
      const reg = await this.deps.registerInExo(job.repoId)
      if (this.jobs.has(job.jobId)) job.setExoRegistration(reg)
    } finally {
      this.exoRegistrationsInFlight.delete(job.jobId)
    }
  }

  retryExoRegistration(jobId: string): void {
    const job = this.jobs.get(jobId)
    if (!job || job.state !== 'completed' || job.destination.kind !== 'exo') return
    void this.registerJobInExo(job)
  }

  pause(jobId: string): void {
    this.jobs.get(jobId)?.pause()
  }

  resume(jobId: string): void {
    const job = this.jobs.get(jobId)
    if (!job || !RESUMABLE_STATES.has(job.state)) return
    job.prepareResume()
    this.pump()
  }

  async cancel(jobId: string, deletePartial = true): Promise<void> {
    await this.jobs.get(jobId)?.cancel(deletePartial)
  }

  remove(jobId: string): void {
    const job = this.jobs.get(jobId)
    if (!job || job.isActive) return
    this.jobs.delete(jobId)
    this.persistence.schedule()
  }

  async shutdown(): Promise<void> {
    for (const job of this.jobs.values()) {
      if (job.isActive) job.pause()
    }
    await this.persistence.flush()
  }
}
