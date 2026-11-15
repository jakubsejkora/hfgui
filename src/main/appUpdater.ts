import type { AppUpdateStatus } from '@shared/types'

/*
 * hfgui's own updates, from GitHub Releases — no server of ours. electron-updater
 * reads the latest release's latest-mac.yml, downloads the zip it names
 * (checked against its sha512), and Squirrel.Mac installs it only if it is
 * signed by the same developer as the running app.
 *
 * Pure on purpose — no electron import — so the rules are unit-tested with a
 * fake updater; electronUpdater.ts adapts the real one and index.ts wires it in.
 */

/** What the updater reports, already narrowed to what's used here. */
export interface UpdaterHandlers {
  checking(): void
  available(version: string): void
  notAvailable(): void
  progress(percent: number): void
  downloaded(version: string): void
  error(error: Error): void
}

export interface UpdaterLike {
  subscribe(handlers: UpdaterHandlers): void
  /** Resolves once GitHub has answered; a newer version then downloads on its own. */
  checkForUpdates(): Promise<void>
  /** Quit, swap in the downloaded version, relaunch. */
  quitAndInstall(): void
}

export interface AppUpdatesDeps {
  /** Null when this copy can't update itself; `unavailableReason` says why. */
  updater: UpdaterLike | null
  unavailableReason?: string
  /** The Settings switch for automatic checks. Checks asked for by hand always run. */
  enabled(): boolean
  onChange(status: AppUpdateStatus): void
  /** Before the restart into the new version: pause and save downloads. */
  beforeInstall(): Promise<void>
  now?(): number
  log?(message: string): void
}

/** Not at launch itself: startup is busy enough, and a check can wait. */
export const FIRST_CHECK_DELAY_MS = 15_000
export const CHECK_INTERVAL_MS = 4 * 60 * 60_000

const BUSY: ReadonlySet<AppUpdateStatus['status']> = new Set(['checking', 'downloading', 'ready'])

export class AppUpdates {
  private status: AppUpdateStatus
  /** When GitHub last answered. */
  private lastChecked: number | null = null
  private inflight: Promise<AppUpdateStatus> | null = null
  private installing = false
  private timers: Array<ReturnType<typeof setTimeout>> = []

  constructor(private deps: AppUpdatesDeps) {
    this.status = deps.updater
      ? { status: 'idle', checkedAt: null }
      : { status: 'unavailable', reason: deps.unavailableReason ?? 'This copy of hfgui can’t update itself.' }
    deps.updater?.subscribe({
      checking: () => {
        if (!BUSY.has(this.status.status)) this.set({ status: 'checking', checkedAt: this.lastChecked })
      },
      available: (version) => {
        this.lastChecked = this.now()
        this.set({ status: 'downloading', version, percent: 0, checkedAt: this.lastChecked })
      },
      notAvailable: () => {
        this.lastChecked = this.now()
        this.set({ status: 'idle', checkedAt: this.lastChecked })
      },
      progress: (percent) => {
        if (this.status.status !== 'downloading') return
        // Whole percents: the updater reports every chunk, and each change crosses to the window.
        const whole = Math.max(0, Math.min(100, Math.floor(percent)))
        if (whole !== this.status.percent) this.set({ ...this.status, percent: whole })
      },
      downloaded: (version) => {
        this.set({ status: 'ready', version, checkedAt: this.lastChecked ?? this.now() })
      },
      error: (error) => this.fail(error)
    })
  }

  get(): AppUpdateStatus {
    return this.status
  }

  /** Automatic checks: shortly after launch, then every few hours, while the switch is on. */
  start(): void {
    if (!this.deps.updater) return
    const auto = (): void => {
      if (this.deps.enabled()) void this.check()
    }
    const first = setTimeout(auto, FIRST_CHECK_DELAY_MS)
    const every = setInterval(auto, CHECK_INTERVAL_MS)
    // Neither may hold the app open on quit.
    ;(first as { unref?: () => void }).unref?.()
    ;(every as { unref?: () => void }).unref?.()
    this.timers.push(first, every)
  }

  stop(): void {
    for (const t of this.timers) clearTimeout(t)
    this.timers = []
  }

  /** Ask GitHub now. A no-op while a check or download runs, or once a version is ready. */
  check(): Promise<AppUpdateStatus> {
    const updater = this.deps.updater
    if (!updater || this.installing) return Promise.resolve(this.status)
    if (this.inflight) return this.inflight
    if (BUSY.has(this.status.status)) return Promise.resolve(this.status)
    this.set({ status: 'checking', checkedAt: this.lastChecked })
    this.inflight = updater
      .checkForUpdates()
      .catch((error: unknown) => {
        // The updater's error event has usually said so already.
        if (this.status.status === 'checking') this.fail(error instanceof Error ? error : new Error(String(error)))
      })
      .then(() => {
        // Answered without a word (the updater skips checks it considers inactive).
        if (this.status.status === 'checking') this.set({ status: 'idle', checkedAt: this.lastChecked })
        return this.status
      })
      .finally(() => {
        this.inflight = null
      })
    return this.inflight
  }

  /** Restart into the downloaded version. */
  async install(): Promise<{ ok: true } | { ok: false; message: string }> {
    const updater = this.deps.updater
    if (!updater || this.status.status !== 'ready') {
      return { ok: false, message: 'No update is ready to install yet.' }
    }
    if (this.installing) return { ok: true }
    this.installing = true
    try {
      await this.deps.beforeInstall()
      this.stop()
      updater.quitAndInstall()
      return { ok: true }
    } catch (error) {
      this.installing = false
      this.log(`install failed: ${String(error)}`)
      return { ok: false, message: describeUpdateError(error as Error) }
    }
  }

  private fail(error: Error): void {
    this.log(`update error: ${error.stack ?? error.message}`)
    // Squirrel refusing the update at restart lands here too: hfgui stays
    // open, so checking and restarting must work again.
    this.installing = false
    this.set({ status: 'error', message: describeUpdateError(error), checkedAt: this.lastChecked })
  }

  private set(status: AppUpdateStatus): void {
    this.status = status
    this.deps.onChange(status)
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }

  private log(message: string): void {
    this.deps.log?.(message)
  }
}

/**
 * What went wrong, in words someone can act on. electron-updater's own
 * messages carry stack traces, URLs and the whole release feed.
 */
export function describeUpdateError(error: Error): string {
  const code = (error as { code?: unknown }).code
  const text = `${typeof code === 'string' ? code : ''} ${error.message ?? ''}`
  if (/ERR_UPDATER_(LATEST_VERSION_NOT_FOUND|NO_PUBLISHED_VERSIONS)/.test(text)) {
    return 'GitHub has no release of hfgui to update to yet.'
  }
  if (/ERR_UPDATER_(CHANNEL_FILE_NOT_FOUND|ZIP_FILE_NOT_FOUND)/.test(text)) {
    return 'The newest release on GitHub can’t be installed from inside hfgui — download it from the releases page.'
  }
  if (/read-only volume/i.test(text)) {
    return 'hfgui can’t update itself while it runs from the disk image — move it to Applications first.'
  }
  if (/code ?signature|did not pass validation|designated requirement/i.test(text)) {
    return 'The update isn’t signed by hfgui’s developer, so it wasn’t installed.'
  }
  if (/sha512 checksum mismatch|checksum/i.test(text)) {
    return 'The update arrived damaged. hfgui will download it again on the next check.'
  }
  if (/\b(403|429)\b|rate limit/i.test(text)) {
    return 'GitHub is turning requests away for now — try again later.'
  }
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|net::ERR_|socket hang up|timed? ?out/i.test(text)) {
    return 'Couldn’t reach GitHub — check your connection.'
  }
  const first = (error.message ?? '').split('\n')[0].trim()
  return first ? (first.length > 160 ? `${first.slice(0, 157)}…` : first) : 'Something went wrong.'
}
