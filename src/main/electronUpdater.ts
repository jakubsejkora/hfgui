import { autoUpdater } from 'electron-updater'
import type { UpdaterLike } from './appUpdater'

/**
 * electron-updater, set up for GitHub Releases. Where to look comes from
 * app-update.yml, which electron-builder writes into the app from the
 * `publish` section of electron-builder.yml.
 */
export function createElectronUpdater(): UpdaterLike {
  autoUpdater.autoDownload = true
  // A downloaded version installs whenever hfgui next quits, restart or not.
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false
  autoUpdater.logger = {
    info: (m?: unknown) => console.log('[hfgui] updater:', m),
    warn: (m?: unknown) => console.warn('[hfgui] updater:', m),
    error: (m?: unknown) => console.error('[hfgui] updater:', m),
    debug: () => {}
  }

  return {
    subscribe(h) {
      autoUpdater.on('checking-for-update', () => h.checking())
      autoUpdater.on('update-available', (info) => h.available(info.version))
      autoUpdater.on('update-not-available', () => h.notAvailable())
      autoUpdater.on('download-progress', (p) => h.progress(p.percent))
      autoUpdater.on('update-downloaded', (info) => h.downloaded(info.version))
      autoUpdater.on('error', (error) => h.error(error))
    },
    async checkForUpdates() {
      const result = await autoUpdater.checkForUpdates()
      // A failed download is reported through the error event; this promise
      // rejecting as well would only surface as an unhandled rejection.
      result?.downloadPromise?.catch(() => {})
    },
    quitAndInstall() {
      // isSilent only matters on Windows; relaunch once installed.
      autoUpdater.quitAndInstall(false, true)
    }
  }
}
