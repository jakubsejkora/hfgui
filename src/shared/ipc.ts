import type {
  DestinationInfo,
  DiskSpace,
  DownloadEvent,
  DownloadJobSnapshot,
  DownloadRequest,
  Settings,
  StartDownloadResult,
  SystemInfo,
  TokenStatus
} from './types'

export const IPC = {
  startDownload: 'hfgui:start-download',
  pauseDownload: 'hfgui:pause-download',
  resumeDownload: 'hfgui:resume-download',
  cancelDownload: 'hfgui:cancel-download',
  removeDownload: 'hfgui:remove-download',
  listDownloads: 'hfgui:list-downloads',
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
  openExternal: 'hfgui:open-external'
} as const

export interface HfguiApi {
  startDownload(req: DownloadRequest): Promise<StartDownloadResult>
  pauseDownload(jobId: string): Promise<void>
  resumeDownload(jobId: string): Promise<void>
  cancelDownload(jobId: string, opts?: { deletePartial?: boolean }): Promise<void>
  removeDownload(jobId: string): Promise<void>
  listDownloads(): Promise<DownloadJobSnapshot[]>
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
}
