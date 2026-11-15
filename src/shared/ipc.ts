import type { ModelRef } from './modelRef'
import type {
  ActionResult,
  DeleteResult,
  DestinationInfo,
  DiskSpace,
  DownloadEvent,
  DownloadJobSnapshot,
  DownloadRequest,
  Settings,
  StartDownloadResult,
  StorageReport,
  SystemInfo,
  TokenStatus,
  UpdateStatus
} from './types'

export const IPC = {
  startDownload: 'hfgui:start-download',
  pauseDownload: 'hfgui:pause-download',
  resumeDownload: 'hfgui:resume-download',
  cancelDownload: 'hfgui:cancel-download',
  removeDownload: 'hfgui:remove-download',
  retryExoRegistration: 'hfgui:retry-exo-registration',
  listDownloads: 'hfgui:list-downloads',
  deleteDownload: 'hfgui:delete-download',
  getStorageReport: 'hfgui:get-storage-report',
  cleanLeftovers: 'hfgui:clean-leftovers',
  getUpdates: 'hfgui:get-updates',
  checkForUpdates: 'hfgui:check-for-updates',
  updateDownload: 'hfgui:update-download',
  downloadEvent: 'hfgui:download-event',
  getSettings: 'hfgui:get-settings',
  setSettings: 'hfgui:set-settings',
  setHfToken: 'hfgui:set-hf-token',
  getHfTokenStatus: 'hfgui:get-hf-token-status',
  getDestinations: 'hfgui:get-destinations',
  pickDirectory: 'hfgui:pick-directory',
  revealPath: 'hfgui:reveal-path',
  checkDiskSpace: 'hfgui:check-disk-space',
  getSystemInfo: 'hfgui:get-system-info',
  openExternal: 'hfgui:open-external',
  openInLmStudio: 'hfgui:open-in-lmstudio',
  readClipboardModelRef: 'hfgui:read-clipboard-model-ref',
  navigate: 'hfgui:navigate'
} as const

/** Pages main can ask the window to show (e.g. after a notification click). */
export type NavigateTarget = 'downloads' | 'settings'

export interface HfguiApi {
  startDownload(req: DownloadRequest): Promise<StartDownloadResult>
  pauseDownload(jobId: string): Promise<void>
  /** Refused (ok: false) when another download already owns the same files. */
  resumeDownload(jobId: string): Promise<ActionResult>
  cancelDownload(jobId: string, opts?: { deletePartial?: boolean }): Promise<void>
  removeDownload(jobId: string): Promise<void>
  /** Re-attempt registering a completed exo download in exo's model list. */
  retryExoRegistration(jobId: string): Promise<void>
  listDownloads(): Promise<DownloadJobSnapshot[]>
  /** Remove a download from the list and delete its data (a finished model's files, or partial data). */
  deleteDownload(jobId: string): Promise<DeleteResult>
  getStorageReport(): Promise<StorageReport>
  /** Delete data of unfinished downloads that are no longer in the list. */
  cleanLeftovers(): Promise<{ files: number; freedBytes: number }>
  /** What hfgui last learned about newer versions of finished downloads, by job id. */
  getUpdates(): Promise<Record<string, UpdateStatus>>
  /** Ask Hugging Face now. */
  checkForUpdates(): Promise<Record<string, UpdateStatus>>
  /** Download the newer version of a finished download, keeping the old one. */
  updateDownload(jobId: string): Promise<ActionResult>
  /** Returns an unsubscribe function. */
  onDownloadEvent(cb: (e: DownloadEvent) => void): () => void

  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<Settings>
  setHfToken(token: string | null): Promise<void>
  getHfTokenStatus(): Promise<TokenStatus>

  getDestinations(): Promise<DestinationInfo[]>
  pickDirectory(opts?: { title?: string; defaultPath?: string }): Promise<string | null>
  revealPath(absPath: string): Promise<void>
  checkDiskSpace(dir: string): Promise<DiskSpace>
  getSystemInfo(): Promise<SystemInfo>
  openExternal(url: string): Promise<void>
  /** Launch LM Studio focused on the given repo via its open_from_hf deep link. */
  openInLmStudio(repoId: string): Promise<void>
  /**
   * The clipboard, parsed in main — the renderer only ever sees a model
   * reference or null, never whatever else the user last copied.
   */
  readClipboardModelRef(): Promise<ModelRef | null>
  /** Main asks the window to show a page. Returns an unsubscribe function. */
  onNavigate(cb: (target: NavigateTarget) => void): () => void
}
