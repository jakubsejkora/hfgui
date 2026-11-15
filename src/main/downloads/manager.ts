import { existsSync } from 'fs'
import { mkdir, rename, rm, unlink } from 'fs/promises'
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
  UpdateLink,
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
  LINK_MIN_BYTES,
  fetchFiles,
  fetchLatest,
  fetchRevision,
  gitBlobOid,
  planUpdate,
  relinkCopy,
  removeEmptyTree,
  shareFile,
  versionedName,
  type DownloadedVersion,
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
  /** Updates being set up (checking the Hub, sharing files), by the job they update. */
  private updatesStarting = new Set<string>()

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
    // Several updates of one download — repeat clicks, before that was
    // guarded. Keep the first; the rest hold only clones of the old files.
    const updatesOf = new Map<string, DownloadJob[]>()
    for (const job of this.jobs.values()) {
      if (job.update?.pendingMove && job.state !== 'completed') {
        updatesOf.set(job.update.of, [...(updatesOf.get(job.update.of) ?? []), job])
      }
    }
    for (const dupes of updatesOf.values()) {
      for (const extra of dupes.sort((a, b) => a.createdAt - b.createdAt).slice(1)) {
        await this.purge(extra)
        this.jobs.delete(extra.jobId)
      }
    }
    // The same, already finished: each took over the model's folder in turn,
    // so all their records name it. Keep the one the old version points to;
    // the rest only leave the list — the folder they name is the kept one's.
    const finishedOf = new Map<string, DownloadJob[]>()
    for (const job of this.jobs.values()) {
      if (!job.update || job.update.pendingMove || job.state !== 'completed') continue
      const key = `${job.update.of}\0${job.jobDir}\0${job.revision}`
      finishedOf.set(key, [...(finishedOf.get(key) ?? []), job])
    }
    for (const dupes of finishedOf.values()) {
      if (dupes.length < 2) continue
      const pointedTo = this.jobs.get(dupes[0].update!.of)?.supersededBy
      const keep = dupes.find((j) => j.jobId === pointedTo) ?? dupes.sort((a, b) => b.createdAt - a.createdAt)[0]
      for (const extra of dupes) if (extra !== keep) this.jobs.delete(extra.jobId)
    }
    // An update that finished but hadn't moved into its model's folder yet.
    for (const job of [...this.jobs.values()]) {
      if (job.state === 'completed' && job.update?.pendingMove) await this.finishUpdate(job)
    }
    await this.relinkVersions()
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
    const queued = pickJobsToStart([...this.jobs.values()], this.deps.getMaxConcurrent())
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

  /** The final paths other downloads in the list use, in `dir` (the job's own folder by default). */
  private sharedPaths(job: DownloadJob, dir = job.jobDir): Set<string> {
    const shared = new Set<string>()
    for (const other of this.jobs.values()) {
      if (other === job || other.jobDir !== dir || other.update?.pendingMove) continue
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
    if (this.updatesStarting.has(job.jobId)) return false
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
    // Downloads from before sha256 was recorded: take the checksums of the
    // revision they came from, so a re-released file of the same size isn't
    // mistaken for an unchanged one. Sizes are the fallback if it's gone.
    let mine: DownloadedVersion = job
    if (job.files.some((f) => !f.sha256 && now.get(f.path)?.lfs)) {
      try {
        const then = new Map((await fetchFiles(job.repoId, job.revision, this.hubOptions())).map((f) => [f.path, f]))
        mine = {
          format: job.format,
          files: job.files.map((f) => ({ ...f, sha256: f.sha256 ?? then.get(f.path)?.lfs?.oid ?? null }))
        }
      } catch {
        /* the old revision is gone: compare sizes */
      }
    }
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
    return planUpdate(mine, latest, oids)
  }

  /**
   * Download the newer version of a finished download. Unchanged files are
   * shared with the old one — no download, no extra disk space — and the new
   * version moves into the model's folder once complete (see finishUpdate), so
   * whatever points at that folder gets the update. The old version is kept
   * beside it, or replaced.
   */
  async update(jobId: string, opts: { keepOld: boolean } = { keepOld: true }): Promise<ActionResult> {
    // Checking the Hub and sharing files takes a moment; a second click in that
    // window used to start a second update of the same model (and a third…).
    if (this.updatesStarting.has(jobId)) return { ok: false, message: 'This model is already being updated' }
    const old = this.jobs.get(jobId)
    if (!old || !this.updatable(old)) return { ok: false, message: 'Only a finished download can be updated' }
    this.updatesStarting.add(jobId)
    try {
      return await this.startUpdate(old, opts.keepOld)
    } finally {
      this.updatesStarting.delete(jobId)
    }
  }

  private async startUpdate(old: DownloadJob, keepOld: boolean): Promise<ActionResult> {
    let planned: Planned
    try {
      planned = await this.planFor(old, await fetchLatest(old.repoId, this.hubOptions()))
    } catch (e) {
      return { ok: false, message: (e as Error).message }
    }
    if (planned.kind !== 'available') {
      this.updates.set(old.jobId, { status: planned.kind, checkedAt: Date.now() })
      this.emit({ type: 'updates' })
      return {
        ok: false,
        message:
          planned.kind === 'current'
            ? 'Already up to date'
            : 'Its files were renamed or removed on Hugging Face — open the model to pick a size again'
      }
    }

    const { plan } = planned
    const staging = versionedName(old.jobDir, plan.revision, existsSync)
    const shared = new Set<string>()
    for (const path of plan.same) {
      try {
        if (await shareFile(old.finalPathFor(path), safeJoin(staging, path))) shared.add(path)
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
    job.update = { of: old.jobId, fromRevision: old.revision, pendingMove: old.jobDir, keepOld, aside: null, stage: null }
    this.jobs.set(job.jobId, job)
    this.updates.delete(old.jobId)
    job.setState('queued')
    this.emit({ type: 'updates' })
    this.pump()
    return { ok: true }
  }

  /**
   * A finished update moves into its model's folder, file by file — other
   * downloads can share that folder (other GGUF sizes of one repo), so it is
   * never moved as a whole. Kept, the old version's files go first, to
   * `<folder>@<its revision>`; replaced, the new files land over them and files
   * the new version dropped are deleted. Each stage is saved before it starts
   * and safe to repeat, so a stop part-way is finished by the next init().
   */
  private async finishUpdate(job: DownloadJob): Promise<void> {
    const link = job.update
    if (job.state !== 'completed' || !link?.pendingMove) return
    const target = link.pendingMove
    const old = this.jobs.get(link.of)
    const ownsTarget = old?.jobDir === target || (old !== undefined && old.jobDir === link.aside)
    const keepOld = link.keepOld !== false && ownsTarget
    const saveStage = async (stage: NonNullable<UpdateLink['stage']>, extra: Partial<UpdateLink> = {}): Promise<void> => {
      job.update = { ...job.update!, ...extra, stage }
      await this.persistence.flush()
    }
    try {
      // 1. Kept: the old version's files move aside, complete.
      if (keepOld && old && (link.stage ?? 'aside') === 'aside') {
        const aside = link.aside ?? versionedName(target, link.fromRevision, existsSync)
        await saveStage('aside', { aside })
        const shared = this.sharedPaths(old, target)
        for (const f of old.files) {
          const from = safeJoin(target, f.path)
          const to = safeJoin(aside, f.path)
          if (existsSync(to) || !existsSync(from)) continue
          // Another download in this folder uses it too: share it, don't take it.
          if (shared.has(from)) await shareFile(from, to)
          else await renameInto(from, to)
        }
        old.jobDir = aside
        await this.persistence.flush()
      }

      // 2. The new version's files move in, over whatever is left of the old.
      if (job.update?.stage !== 'drop') {
        await saveStage('place')
        for (const f of job.files) {
          const from = safeJoin(job.jobDir, f.path)
          if (!existsSync(from)) continue
          await renameInto(from, safeJoin(target, f.path))
          // Renaming a hard link onto another link of the same file is a no-op
          // that leaves the source: replacing, an unchanged file is exactly that.
          if (existsSync(from)) await unlink(from)
        }
        // Its files moved in; what is left of the staging folder is empty folders.
        await removeEmptyTree(job.jobDir)
        job.jobDir = target
      }

      // 3. Replaced: files the new version no longer has go, and so does the old record.
      if (!keepOld && old) {
        await saveStage('drop')
        const keep = new Set(job.files.map((f) => f.path))
        const shared = this.sharedPaths(old, target)
        for (const f of old.files) {
          const path = safeJoin(target, f.path)
          if (!keep.has(f.path) && !shared.has(path)) await unlink(path).catch(() => {})
        }
      }
    } catch (e) {
      // The update works where it is; moving in is retried next launch.
      console.error('[hfgui] finished update could not move into its folder:', e)
      return
    }

    job.jobDir = target
    job.update = { ...job.update!, pendingMove: null, stage: null }
    if (old && keepOld) {
      old.supersededBy = job.jobId
      this.emit({ type: 'state', jobId: old.jobId, snapshot: old.snapshot() })
    } else if (old) {
      this.jobs.delete(old.jobId)
      this.emit({ type: 'removed', jobId: old.jobId })
    }
    if (old) this.updates.delete(old.jobId)
    this.updates.set(job.jobId, { status: 'current', checkedAt: Date.now() })
    this.emit({ type: 'state', jobId: job.jobId, snapshot: job.snapshot() })
    this.emit({ type: 'updates' })
    await this.persistence.flush()
  }

  /**
   * A kept older version and its update share the files that didn't change.
   * Updates made before sharing worked hold full byte copies instead (Node's
   * "clone" copied); make each copy a hard link to the original again, freeing
   * its space. Only files both records say are identical (same sha256 and
   * size), large ones, on one drive; already-shared files are left alone.
   */
  private async relinkVersions(): Promise<void> {
    for (const job of this.jobs.values()) {
      // Staging folders earlier versions left behind as trees of empty folders.
      if (job.state !== 'completed' || !job.update || job.update.pendingMove) continue
      const staging = `${job.jobDir}@${job.revision.slice(0, 7)}`
      for (const suffix of ['', '-2', '-3', '-4', '-5']) await removeEmptyTree(staging + suffix)
    }
    for (const old of this.jobs.values()) {
      const fresh = old.supersededBy ? this.jobs.get(old.supersededBy) : undefined
      if (!fresh || fresh.state !== 'completed' || fresh.update?.pendingMove) continue
      const before = new Map(old.files.map((f) => [f.path, f]))
      for (const f of fresh.files) {
        const was = before.get(f.path)
        // Same checksum on record — or none on the old record, from before sha256
        // was kept: then the update shared it by size, so the new file is a copy.
        const same = was && (was.sha256 ? was.sha256 === f.sha256 : true)
        if (!was || !same || was.size !== f.size || f.size <= LINK_MIN_BYTES) continue
        try {
          await relinkCopy(old.finalPathFor(f.path), fresh.finalPathFor(f.path))
        } catch {
          /* missing or moved: leave it */
        }
      }
    }
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

/** Move a file, making its folder first; replaces what is there. */
async function renameInto(from: string, to: string): Promise<void> {
  await mkdir(dirname(to), { recursive: true })
  await rename(from, to)
}

/** Below this much left to fetch, a download doesn't wait for a slot: an 80 KB update shouldn't queue behind a 500 GB model. */
export const SMALL_JOB_BYTES = 256 * 1024 * 1024

/**
 * Queued jobs to start now, oldest first. Downloads take the free slots;
 * updates of models already downloaded and small jobs start regardless, and
 * don't count against the limit either — an update is usually seconds of
 * work, and waiting hours behind a queue of new models made no sense.
 * A limit of 0 starts nothing (tests use it to keep jobs queued).
 */
export function pickJobsToStart<
  J extends Pick<DownloadJob, 'state' | 'isActive' | 'totalBytes' | 'bytesDone' | 'createdAt' | 'update'>
>(jobs: readonly J[], maxConcurrent: number): J[] {
  if (maxConcurrent <= 0) return []
  const small = (j: J): boolean => !!j.update?.pendingMove || j.totalBytes - j.bytesDone <= SMALL_JOB_BYTES
  let slots = maxConcurrent - jobs.filter((j) => j.isActive && !small(j)).length
  const start: J[] = []
  for (const job of [...jobs].filter((j) => j.state === 'queued').sort((a, b) => a.createdAt - b.createdAt)) {
    if (small(job)) start.push(job)
    else if (slots > 0) {
      start.push(job)
      slots--
    }
  }
  return start
}
