import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type HfguiApi, type NavigateTarget } from '@shared/ipc'
import type { AppUpdateStatus, DownloadEvent, DownloadRequest, Settings } from '@shared/types'

const api: HfguiApi = {
  startDownload: (req: DownloadRequest) => ipcRenderer.invoke(IPC.startDownload, req),
  pauseDownload: (jobId) => ipcRenderer.invoke(IPC.pauseDownload, jobId),
  resumeDownload: (jobId) => ipcRenderer.invoke(IPC.resumeDownload, jobId),
  cancelDownload: (jobId, opts) => ipcRenderer.invoke(IPC.cancelDownload, jobId, opts),
  removeDownload: (jobId) => ipcRenderer.invoke(IPC.removeDownload, jobId),
  retryExoRegistration: (jobId) => ipcRenderer.invoke(IPC.retryExoRegistration, jobId),
  listDownloads: () => ipcRenderer.invoke(IPC.listDownloads),
  deleteDownload: (jobId) => ipcRenderer.invoke(IPC.deleteDownload, jobId),
  getStorageReport: () => ipcRenderer.invoke(IPC.getStorageReport),
  cleanLeftovers: () => ipcRenderer.invoke(IPC.cleanLeftovers),
  getUpdates: () => ipcRenderer.invoke(IPC.getUpdates),
  checkForUpdates: () => ipcRenderer.invoke(IPC.checkForUpdates),
  updateDownload: (jobId, opts) => ipcRenderer.invoke(IPC.updateDownload, jobId, opts),
  onDownloadEvent: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, ev: DownloadEvent): void => cb(ev)
    ipcRenderer.on(IPC.downloadEvent, listener)
    return () => ipcRenderer.removeListener(IPC.downloadEvent, listener)
  },

  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  setSettings: (patch: Partial<Settings>) => ipcRenderer.invoke(IPC.setSettings, patch),
  setHfToken: (token) => ipcRenderer.invoke(IPC.setHfToken, token),
  getHfTokenStatus: () => ipcRenderer.invoke(IPC.getHfTokenStatus),

  getDestinations: () => ipcRenderer.invoke(IPC.getDestinations),
  pickDirectory: (opts) => ipcRenderer.invoke(IPC.pickDirectory, opts),
  revealPath: (absPath) => ipcRenderer.invoke(IPC.revealPath, absPath),
  checkDiskSpace: (dir) => ipcRenderer.invoke(IPC.checkDiskSpace, dir),
  getSystemInfo: () => ipcRenderer.invoke(IPC.getSystemInfo),
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
  openInLmStudio: (repoId) => ipcRenderer.invoke(IPC.openInLmStudio, repoId),
  readClipboardModelRef: () => ipcRenderer.invoke(IPC.readClipboardModelRef),
  onNavigate: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, target: NavigateTarget): void => cb(target)
    ipcRenderer.on(IPC.navigate, listener)
    return () => ipcRenderer.removeListener(IPC.navigate, listener)
  },

  getAppUpdate: () => ipcRenderer.invoke(IPC.getAppUpdate),
  checkAppUpdate: () => ipcRenderer.invoke(IPC.checkAppUpdate),
  installAppUpdate: () => ipcRenderer.invoke(IPC.installAppUpdate),
  onAppUpdate: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, status: AppUpdateStatus): void => cb(status)
    ipcRenderer.on(IPC.appUpdateEvent, listener)
    return () => ipcRenderer.removeListener(IPC.appUpdateEvent, listener)
  }
}

contextBridge.exposeInMainWorld('hfgui', api)
