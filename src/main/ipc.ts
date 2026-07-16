import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { IPC } from '@shared/ipc'
import type { DownloadRequest, Settings } from '@shared/types'
import { adapters, getDestinations } from './destinations'
import type { DownloadManager } from './downloads/manager'
import type { SettingsStore } from './settings'
import { checkDiskSpace, getSystemInfo } from './system'

export function registerIpc(manager: DownloadManager, settings: SettingsStore): void {
  const broadcast = manager.onEvent((ev) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.downloadEvent, ev)
    }
  })
  void broadcast // unsubscribed on app quit implicitly

  ipcMain.handle(IPC.startDownload, async (_e, req: DownloadRequest) => {
    const adapter = adapters[req.destination.kind]
    if (!adapter || !req.repoId.includes('/') || !req.destination.baseDir) {
      return { ok: false, code: 'invalid', message: 'Invalid download request' }
    }
    if (req.destination.kind === 'custom') {
      await settings.set({ customDir: req.destination.baseDir })
    }
    const jobDir = adapter.resolveJobDir(req.repoId, req.destination.baseDir)
    return manager.start(req, jobDir)
  })

  ipcMain.handle(IPC.pauseDownload, (_e, jobId: string) => manager.pause(jobId))
  ipcMain.handle(IPC.resumeDownload, (_e, jobId: string) => manager.resume(jobId))
  ipcMain.handle(IPC.cancelDownload, (_e, jobId: string, opts?: { deletePartial?: boolean }) =>
    manager.cancel(jobId, opts?.deletePartial ?? true)
  )
  ipcMain.handle(IPC.removeDownload, (_e, jobId: string) => manager.remove(jobId))
  ipcMain.handle(IPC.listDownloads, () => manager.list())

  ipcMain.handle(IPC.getSettings, () => settings.get())
  ipcMain.handle(IPC.setSettings, (_e, patch: Partial<Settings>) => settings.set(patch))
  ipcMain.handle(IPC.setHfToken, (_e, token: string | null) => settings.setToken(token))
  ipcMain.handle(IPC.getHfTokenStatus, () => settings.getTokenStatus())

  ipcMain.handle(IPC.getDestinations, () => getDestinations(settings.get()))

  ipcMain.handle(
    IPC.pickDirectory,
    async (e, opts?: { title?: string; defaultPath?: string }) => {
      const win = BrowserWindow.fromWebContents(e.sender)
      const result = await dialog.showOpenDialog(win!, {
        title: opts?.title ?? 'Choose a folder',
        defaultPath: opts?.defaultPath,
        properties: ['openDirectory', 'createDirectory']
      })
      return result.canceled || !result.filePaths.length ? null : result.filePaths[0]
    }
  )

  ipcMain.handle(IPC.revealPath, (_e, absPath: string) => {
    shell.showItemInFolder(absPath)
  })
  ipcMain.handle(IPC.checkDiskSpace, (_e, dir: string) => checkDiskSpace(dir))
  ipcMain.handle(IPC.getSystemInfo, () => getSystemInfo())
  ipcMain.handle(IPC.openExternal, (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) return shell.openExternal(url)
    return Promise.resolve()
  })
}
