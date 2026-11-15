import { existsSync } from 'fs'
import { rename, rm, unlink } from 'fs/promises'
import { dirname, join } from 'path'
import { BUSY_STATES, IN_PROGRESS_STATES, RESUMABLE_STATES } from '@shared/jobStates'
import type {
  ActionResult,
  DeleteResult,
  DownloadEvent,
  DownloadJobSnapshot,
  DownloadRequest,
  ExoRegistration,
  StartDownloadResult,
  StorageReport,
  UpdateStatus
} from '@shared/types'
import { safeJoin } from '../pathSafety'
import { checkDiskSpace, missingVolume, volumeIdFor } from '../system'
import { BandwidthLimiter } from './bandwidth'
import { DownloadJob, type JobDeps } from './job'
import { IncompleteFilesLedger } from './ledger'
import { Persistence } from './persistence'
import { isInside, pruneEmptyDirs, sizeOf } from './storage'
import {
  HubMissingError,
  canClone,
  fetchFiles,
  fetchLatest,
  fetchRevision,
  gitBlobOid,
  planUpdate,
  shareFile,
  versionedName,
  type HubOptions,
  type LatestVersion,
  type Planned
} from './updates'

export interface ManagerDeps {
  userDataDir: string
  getToken(): string | null
  getMaxConcurrent(): number
  getAutoResume(): boolean
  /** Cap on combined download speed in bytes/sec, or null for none. */
  getSpeedLimit(): number | null
  registerInExo(repoId: string): Promise<ExoRegistration>
  /** Where the Hugging Face API lives and how to reach it; tests use a local server. */
  hub?: string
  fetchHub?: typeof fetch
  /** Injectable for tests; default to the real fs-backed implementations. */
  checkDiskSpace?: typeof checkDiskSpace
  volumeIdFor?: typeof volumeIdFor
  missingVolume?: typeof missingVolume
}

export class DownloadManager {
  private jobs = new Map<string, DownloadJob>()
  private listeners = new Set<(ev: DownloadEvent) => void>()
  private persistence: Persistence
  /** Files of downloads that haven't finished — the only thing cleanup may delete. */
  private ledger: IncompleteFilesLedger
  private deps: ManagerDeps
  private exoRegistrationsInFlight = new Set<string>()
  /** One budget for every job: the cap is on the connection, not per download. */
  private limiter = new BandwidthLimiter()
  /** Newer versions of finished downloads, by job id. */
  private updates = new Map<string, UpdateStatus>()
  private checking: Promise<Record<string, UpdateStatus>> | null = null

  constructor(deps: ManagerDeps) {
    this.deps = deps
    this.persistence = new Persistence(join(deps.userDataDir, 'downloads.json'))
    this.persistence.bind(() => this.list())
    this.ledger = new IncompleteFilesLedger(join(deps.userDataDir, 'incomplete-files.json'))
    this.limiter.setLimit(deps.getSpeedLimit())
  }

  private jobDeps(): JobDeps {
    return {
      getToken: () => this.deps.getToken(),
      emit: (ev) => this.emit(ev),
      persist: () => this.persistence.schedule(),
      throttle: (bytes, signal) => this.limiter.acquire(bytes, signal),
      track: (entries) => this.ledger.track(entries),
      untrack: (paths) => this.ledger.untrack(paths)
    }
  }

  /**
   * Re-read the settings that apply to work already in progress: the speed cap
   * takes effect on running downloads immediately, and a raised concurrency
   * limit starts queued jobs now rather than when the next one finishes.
   */
  settingsChanged(): void {
    this.limiter.setLimit(this.deps.getSpeedLimit())
    this.pump()
  }

  async init(): Promise<void> {
    const ledgerExisted = await this.ledger.load()
    const snapshots = await this.persistence.load()
    for (const snap of snapshots) {
      // Anything that was in flight when the app quit resumes as paused.
      if (BUSY_STATES.has(snap.state)) {
        snap.state = 'paused'
        for (const f of snap.files) {
          if (f.state === 'active') f.state = 'pending'
        }
      }
      const job = DownloadJob.fromSnapshot(snap, this.jobDeps())
      this.jobs.set(job.jobId, job)
    }
    // An update that finished but hadn't taken over its model's folder yet.
    for (const job of [...this.jobs.values()]) {
      if (job.state === 'completed' && job.update?.pendingMove) await this.finishUpdate(job)
    }
    // First run with the ledger: adopt the data of downloads still in the list.
    if (!ledgerExisted) {
      for (const job of this.jobs.values()) {
        if (job.state !== 'completed') this.ledger.track(job.dataEntries())
      }
    }
    if (this.deps.getAutoResume()) {
      // Only what quitting interrupted — not downloads the user paused on purpose.
      for (const job of [...this.jobs.values()]) {
        if (job.state === 'paused' && !job.pausedByUser) await this.resume(job.jobId)
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

    if (this.ownerOf(jobDir, req.files)) {
      return { ok: false, code: 'duplicate', message: 'Already downloading to this destination' }
    }

    const totalBytes = req.files.reduce((sum, f) => sum + f.size, 0)
    const problem = await this.spaceProblem(jobDir, totalBytes)
    if (problem) return { ok: false, ...problem }

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
      void job.run().finally(async () => {
        if (job.state === 'completed' && job.update?.pendingMove) await this.finishUpdate(job)
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

  /**
   * Why `needBytes` more can't be written to `jobDir` right now, if it can't:
   * its drive is unplugged, or free space (minus what running downloads on the
   * same volume still have to write) is too small.
   */
  private async spaceProblem(
    jobDir: string,
    needBytes: number,
    except?: DownloadJob
  ): Promise<{ code: 'disk-full' | 'invalid'; message: string } | null> {
    const drive = (this.deps.missingVolume ?? missingVolume)(jobDir)
    if (drive) return { code: 'invalid', message: `The drive “${drive}” isn’t connected` }
    const diskCheck = this.deps.checkDiskSpace ?? checkDiskSpace
    const { freeBytes } = await diskCheck(jobDir).catch(() => ({ freeBytes: Infinity }))
    // Count bytes in-flight jobs on the same volume still have to write, so
    // individually-fitting concurrent jobs can't jointly overrun the disk.
    const volumeId = this.deps.volumeIdFor ?? volumeIdFor
    const vol = await volumeId(jobDir)
    let committedBytes = 0
    for (const job of this.jobs.values()) {
      if (job === except || !BUSY_STATES.has(job.state)) continue
      const jobVol = await volumeId(job.jobDir)
      if (vol === null || jobVol === null || jobVol === vol) {
        committedBytes += Math.max(0, job.totalBytes - job.bytesDone)
      }
    }
    if (freeBytes < needBytes * 1.05 + committedBytes) {
      return { code: 'disk-full', message: 'Not enough free disk space at the destination' }
    }
    return null
  }

  /** A pause from the user — unlike quitting, it survives "Resume on launch". */
  pause(jobId: string): void {
    const job = this.jobs.get(jobId)
    if (!job) return
    job.pausedByUser = true
    job.pause()
  }

  async resume(jobId: string): Promise<ActionResult> {
    const job = this.jobs.get(jobId)
    if (!job || !RESUMABLE_STATES.has(job.state)) return { ok: true }
    // E.g. Retry on a failed job after a fresh Get of the same files: both
    // would append to one .partial and corrupt it.
    if (this.ownerOf(job.jobDir, job.files, job)) {
      return { ok: false, message: 'Another download of these files is already in progress' }
    }
    // Resuming used to skip the disk check that starting does, so a paused
    // 40 GB download could resume onto a full disk and fail an hour later.
    const problem = await this.spaceProblem(job.jobDir, Math.max(0, job.totalBytes - job.bytesDone), job)
    if (problem) return { ok: false, message: problem.message }
    // The job may have moved on while the disk was checked.
    if (!RESUMABLE_STATES.has(job.state) || this.ownerOf(job.jobDir, job.files, job)) {
      return { ok: true }
    }
    job.prepareResume()
    this.pump()
    return { ok: true }
  }

  /** The unfinished job (other than `except`) already writing any of these files. */
  private ownerOf(
    jobDir: string,
    files: ReadonlyArray<{ path: string }>,
    except?: DownloadJob
  ): DownloadJob | undefined {
    const paths = new Set(files.map((f) => f.path))
    for (const job of this.jobs.values()) {
      if (
        job !== except &&
        job.jobDir === jobDir &&
        IN_PROGRESS_STATES.has(job.state) &&
        job.files.some((f) => paths.has(f.path))
      ) {
        return job
      }
    }
    return undefined
  }

  /**
   * Stop a download. By default everything it wrote goes: its partial files
   * and, for a multi-file model, the files it had already finished — an
   * incomplete model folder is dead space (and exo may try to load it).
   */
  async cancel(jobId: string, deletePartial = true): Promise<void> {
    const job = this.jobs.get(jobId)
    if (!job) return
    await job.cancel(deletePartial)
    if (deletePartial && job.state === 'cancelled') {
      await this.purge(job)
      job.resetProgress()
    }
  }

  /**
   * Delete a download and its data. For a finished model that removes the
   * model's files; for an unfinished one, everything it downloaded so far.
   * Files another download in the list also uses are left in place.
   */
  async deleteDownload(jobId: string): Promise<DeleteResult> {
    const job = this.jobs.get(jobId)
    if (!job) return { ok: false, message: 'This download is no longer in the list' }
    if (job.isActive || job.state === 'queued') await job.cancel(true)
    const result = await this.purge(job)
    this.jobs.delete(jobId)
    this.updates.delete(jobId)
    this.emit({ type: 'removed', jobId })
    this.persistence.schedule()
    return { ok: true, ...result }
  }

  /** The final paths other downloads in the list use, in this job's folder. */
  private sharedPaths(job: DownloadJob): Set<string> {
    const shared = new Set<string>()
    for (const other of this.jobs.values()) {
      if (other === job || other.jobDir !== job.jobDir) continue
      for (const e of other.dataEntries()) shared.add(e.path)
    }
    return shared
  }

  /** Delete what `job` wrote — finished files and partials — except shared files. */
  private async purge(job: DownloadJob): Promise<{ freedBytes: number; keptShared: number }> {
    const shared = this.sharedPaths(job)
    let freedBytes = 0
    let keptShared = 0
    const gone: string[] = []
    const dirs = new Set<string>()
    for (const entry of job.dataEntries()) {
      if (shared.has(entry.path)) {
        if (!entry.path.endsWith('.partial')) keptShared++
        continue
      }
      const size = await sizeOf(entry.path)
      if (size !== null) {
        try {
          await unlink(entry.path)
          freedBytes += size
        } catch {
          continue // in use or already gone — leave it tracked
        }
      }
      gone.push(entry.path)
      dirs.add(dirname(entry.path))
    }
    this.ledger.untrack(gone)
    for (const dir of dirs) await pruneEmptyDirs(dir, job.destination.baseDir)
    return { freedBytes, keptShared }
  }

  /** Every path a download in the list may own (finished files and partials). */
  private referencedPaths(): Set<string> {
    const refs = new Set<string>()
    for (const job of this.jobs.values()) for (const e of job.dataEntries()) refs.add(e.path)
    return refs
  }

  /**
   * Where downloads use disk space: what unfinished downloads hold, leftovers of
   * downloads that left the list unfinished, and finished models whose files
   * have gone missing or been truncated.
   */
  async storageReport(): Promise<StorageReport> {
    const held: Record<string, number> = {}
    const missing: string[] = []
    for (const job of this.jobs.values()) {
      if (job.state === 'completed') {
        if (!(await job.filesIntact())) missing.push(job.jobId)
      } else if (!job.isActive) {
        held[job.jobId] = await job.bytesOnDisk()
      }
    }
    const refs = this.referencedPaths()
    let files = 0
    let bytes = 0
    const vanished: string[] = []
    for (const entry of this.ledger.list()) {
      if (refs.has(entry.path)) continue
      const size = await sizeOf(entry.path)
      if (size === null) {
        vanished.push(entry.path)
        continue
      }
      files++
      bytes += size
    }
    this.ledger.untrack(vanished)
    return { held, leftovers: { files, bytes }, missing }
  }

  /** Delete leftovers: hfgui's own files from unfinished downloads no longer in the list. */
  async cleanLeftovers(): Promise<{ files: number; freedBytes: number }> {
    const refs = this.referencedPaths()
    let files = 0
    let freedBytes = 0
    const gone: string[] = []
    const dirs = new Map<string, string>()
    for (const entry of this.ledger.list()) {
      if (refs.has(entry.path) || !isInside(entry.path, entry.baseDir)) continue
      const size = await sizeOf(entry.path)
      if (size !== null) {
        try {
          await unlink(entry.path)
        } catch {
          continue
        }
        files++
        freedBytes += size
      }
      gone.push(entry.path)
      dirs.set(dirname(entry.path), entry.baseDir)
    }
    this.ledger.untrack(gone)
    for (const [dir, base] of dirs) await pruneEmptyDirs(dir, base)
    return { files, freedBytes }
  }

  remove(jobId: string): void {
    const job = this.jobs.get(jobId)
    if (!job || job.isActive) return
    this.jobs.delete(jobId)
    this.updates.delete(jobId)
    this.emit({ type: 'removed', jobId })
    this.persistence.schedule()
  }

  private hubOptions(): HubOptions {
    return { token: this.deps.getToken(), fetch: this.deps.fetchHub, hub: this.deps.hub }
  }

  /** Finished, not already replaced by a newer version, and not being updated right now. */
  private updatable(job: DownloadJob): boolean {
    if (job.state !== 'completed' || job.supersededBy || job.update?.pendingMove) return false
    for (const other of this.jobs.values()) if (other.update?.of === job.jobId && other.update.pendingMove) return false
    return true
  }

  getUpdates(): Record<string, UpdateStatus> {
    return Object.fromEntries(this.updates)
  }

  /**
   * Ask the Hub whether finished downloads have newer versions: one small
   * request per repo, and its file list only when the repo has changed.
   */
  checkUpdates(): Promise<Record<string, UpdateStatus>> {
    this.checking ??= this.runChecks().finally(() => {
      this.checking = null
    })
    return this.checking
  }

  private async runChecks(): Promise<Record<string, UpdateStatus>> {
    const byRepo = new Map<string, DownloadJob[]>()
    for (const job of this.jobs.values()) {
      if (this.updatable(job)) byRepo.set(job.repoId, [...(byRepo.get(job.repoId) ?? []), job])
    }
    const queue = [...byRepo.keys()]
    const worker = async (): Promise<void> => {
      for (let repo = queue.shift(); repo; repo = queue.shift()) {
        const jobs = byRepo.get(repo)!
        const checkedAt = Date.now()
        try {
          const { revision, lastModified } = await fetchRevision(repo, this.hubOptions())
          const stale = jobs.filter((j) => j.revision !== revision)
          for (const job of jobs) if (!stale.includes(job)) this.updates.set(job.jobId, { status: 'current', checkedAt })
          if (stale.length === 0) continue
          const latest = { revision, lastModified, files: await fetchFiles(repo, revision, this.hubOptions()) }
          for (const job of stale) this.updates.set(job.jobId, toStatus(await this.planFor(job, latest), checkedAt))
        } catch (e) {
          const status: UpdateStatus =
            e instanceof HubMissingError
              ? { status: 'gone', checkedAt }
              : { status: 'failed', checkedAt, message: (e as Error).message }
          for (const job of jobs) this.updates.set(job.jobId, status)
        }
      }
    }
    await Promise.all(Array.from({ length: 4 }, worker))
    this.emit({ type: 'updates' })
    return this.getUpdates()
  }

  /** Compare a download with the latest version, file by file. */
  private async planFor(job: DownloadJob, latest: LatestVersion): Promise<Planned> {
    const now = new Map(latest.files.map((f) => [f.path, f]))
    // Small files have no sha256 on record; git's id for their content does the job.
    const oids = new Map<string, string | null>()
    for (const f of job.files) {
      const next = now.get(f.path)
      if (!next || next.lfs) continue
      let path: string
      try {
        path = job.finalPathFor(f.path)
      } catch {
        continue
      }
      oids.set(f.path, await gitBlobOid(path, next.size))
    }
    return planUpdate(job, latest, oids)
  }

  /**
   * Download the newer version of a finished download and keep the old one.
   * Unchanged files are shared with it — no download, no extra disk space —
   * and the new version takes over the model's folder once complete (see
   * finishUpdate), so whatever points at that folder gets the update.
   */
  async update(jobId: string): Promise<ActionResult> {
    const old = this.jobs.get(jobId)
    if (!old || !this.updatable(old)) return { ok: false, message: 'Only a finished download can be updated' }

    let planned: Planned
    try {
      planned = await this.planFor(old, await fetchLatest(old.repoId, this.hubOptions()))
    } catch (e) {
      return { ok: false, message: (e as Error).message }
    }
    if (planned.kind !== 'available') {
      this.updates.set(jobId, { status: planned.kind, checkedAt: Date.now() })
      this.emit({ type: 'updates' })
      return {
        ok: false,
        message:
          planned.kind === 'current'
            ? 'Already up to date'
            : 'Its files were renamed or removed on Hugging Face — open the model to pick a size again'
      }
    }
    if (!this.updatable(old)) return { ok: false, message: 'This model is already being updated' }

    const { plan } = planned
    const staging = versionedName(old.jobDir, plan.revision, existsSync)
    const clone = await canClone(old.jobDir)
    const shared = new Set<string>()
    for (const path of plan.same) {
      try {
        if (await shareFile(old.finalPathFor(path), safeJoin(staging, path), clone)) shared.add(path)
      } catch {
        /* downloaded instead */
      }
    }
    const toFetch = plan.files.filter((f) => !shared.has(f.path)).reduce((sum, f) => sum + f.size, 0)
    const problem = await this.spaceProblem(staging, toFetch)
    if (problem) {
      // Only clones and links of the old files: removing them leaves those intact.
      await rm(staging, { recursive: true, force: true }).catch(() => {})
      return { ok: false, message: problem.message }
    }

    const job = new DownloadJob(
      {
        repoId: old.repoId,
        revision: plan.revision,
        displayName: old.displayName,
        format: old.format,
        files: plan.files,
        destination: old.destination
      },
      staging,
      this.jobDeps()
    )
    for (const f of job.files) {
      if (!shared.has(f.path)) continue
      f.bytesDone = f.size
      f.state = 'done'
    }
    job.update = { of: old.jobId, fromRevision: old.revision, pendingMove: old.jobDir }
    this.jobs.set(job.jobId, job)
    this.updates.delete(old.jobId)
    job.setState('queued')
    this.emit({ type: 'updates' })
    this.pump()
    return { ok: true }
  }

  /**
   * A finished update takes over its model's folder and the version it
   * replaces moves aside to `<folder>@<its revision>`: two renames on one
   * volume. The old version's new place is saved before the second, so a stop
   * in between can never leave its record pointing at the new files; init()
   * finishes whatever is left.
   */
  private async finishUpdate(job: DownloadJob): Promise<void> {
    const link = job.update
    if (job.state !== 'completed' || !link?.pendingMove) return
    const target = link.pendingMove
    const old = this.jobs.get(link.of)
    try {
      if (job.jobDir !== target) {
        if (existsSync(target)) {
          const aside = versionedName(target, link.fromRevision, existsSync)
          await rename(target, aside)
          if (old?.jobDir === target) old.jobDir = aside
          await this.persistence.flush()
        } else if (old?.jobDir === target) {
          // Stopped between the renames last time, before the old version's
          // new place was saved: it went to the usual name.
          const aside = `${target}@${link.fromRevision.slice(0, 7)}`
          if (existsSync(aside)) old.jobDir = aside
        }
        await rename(job.jobDir, target)
        job.jobDir = target
      }
    } catch (e) {
      // The update works where it is; taking over the folder is retried next launch.
      console.error('[hfgui] finished update could not take over its folder:', e)
      return
    }
    job.update = { ...link, pendingMove: null }
    if (old) {
      old.supersededBy = job.jobId
      this.updates.delete(old.jobId)
      this.emit({ type: 'state', jobId: old.jobId, snapshot: old.snapshot() })
    }
    this.updates.set(job.jobId, { status: 'current', checkedAt: Date.now() })
    this.emit({ type: 'state', jobId: job.jobId, snapshot: job.snapshot() })
    this.emit({ type: 'updates' })
    await this.persistence.flush()
  }

  async shutdown(): Promise<void> {
    // Not a user pause: these resume on the next launch if the user wants that.
    for (const job of this.jobs.values()) {
      if (job.isActive) job.pause()
    }
    await this.persistence.flush()
    await this.ledger.flush()
  }
}

function toStatus(planned: Planned, checkedAt: number): UpdateStatus {
  if (planned.kind !== 'available') return { status: planned.kind, checkedAt }
  return {
    status: 'available',
    checkedAt,
    revision: planned.plan.revision,
    lastModified: planned.plan.lastModified,
    changed: planned.changed,
    fetchBytes: planned.fetchBytes
  }
}
