import { BrowserWindow, Notification, app, dialog, nativeTheme, session, shell } from 'electron'
import { accessSync, constants } from 'fs'
import { dirname, join, resolve } from 'path'
import { IPC } from '@shared/ipc'
import { isBusy } from '@shared/jobStates'
import { effectiveSpeedLimit } from '@shared/speedLimit'
import { AppUpdates } from './appUpdater'
import { registerModelWithExo } from './destinations/exoApi'
import { DownloadManager } from './downloads/manager'
import { createElectronUpdater } from './electronUpdater'
import { registerIpc } from './ipc'
import { createNotifier, type DownloadNotice } from './notifications'
import { takeResumeMarker, writeResumeMarker } from './resumeMarker'
import { SettingsStore } from './settings'

// Deterministic userData for e2e runs.
if (process.env.HFGUI_USER_DATA_DIR) {
  app.setPath('userData', process.env.HFGUI_USER_DATA_DIR)
}

let manager: DownloadManager | null = null

/** Notifications are dropped by the OS if nothing holds them until clicked. */
const visibleNotices = new Set<Notification>()

function showDownloads(): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  win.webContents.send(IPC.navigate, 'downloads')
}

function showNotice(notice: DownloadNotice): void {
  // The e2e drivers run unfocused windows; record what would have been shown
  // (readable via app.evaluate) rather than filling Notification Center.
  if (process.env.HFGUI_USER_DATA_DIR) {
    const g = globalThis as { __hfguiNotifications?: DownloadNotice[] }
    ;(g.__hfguiNotifications ??= []).push(notice)
    return
  }
  if (!Notification.isSupported()) return
  const n = new Notification({ title: notice.title, body: notice.body })
  visibleNotices.add(n)
  n.on('click', () => {
    visibleNotices.delete(n)
    showDownloads()
  })
  n.on('close', () => visibleNotices.delete(n))
  n.show()
}

/** The .app bundle this process runs from (packaged builds). */
function appBundlePath(): string {
  return resolve(app.getPath('exe'), '../../..')
}

/**
 * Why Squirrel.Mac couldn't swap this bundle — it needs to write where the app
 * sits: not on the disk image, not under App Translocation (the read-only copy
 * macOS runs an app from when it's opened straight from Downloads), and not in
 * a folder this account can't write to. Null when it can.
 */
function updateBlocker(): 'disk-image' | 'translocated' | 'read-only' | null {
  const bundle = appBundlePath()
  if (bundle.includes('/AppTranslocation/')) return 'translocated'
  try {
    accessSync(dirname(bundle), constants.W_OK)
    return null
  } catch {
    return bundle.startsWith('/Volumes/') ? 'disk-image' : 'read-only'
  }
}

/** Why this copy can't update itself, or null when it can. */
function appUpdateUnavailableReason(): string | null {
  if (!app.isPackaged) return 'This is a development build — release builds from GitHub update themselves.'
  if (process.platform !== 'darwin') return 'Updates are built for macOS only.'
  switch (updateBlocker()) {
    case 'disk-image':
      return 'hfgui is running from the disk image. Move it to Applications to get updates.'
    case 'translocated':
      return 'macOS is running hfgui from a temporary copy. Move it to Applications to get updates.'
    case 'read-only':
      return 'hfgui can’t replace itself in the folder it’s in. Download new versions from GitHub, or move it somewhere your account can write.'
    case null:
      return null
  }
}

/**
 * Opened from the disk image (or translocated out of Downloads), hfgui can't
 * update itself — offer the move once per launch, before anything else starts.
 * True when the move is under way and this instance is quitting.
 */
async function offerMoveToApplications(): Promise<boolean> {
  if (!app.isPackaged || process.platform !== 'darwin' || process.env.HFGUI_USER_DATA_DIR) return false
  const blocker = updateBlocker()
  if (app.isInApplicationsFolder() || (blocker !== 'disk-image' && blocker !== 'translocated')) return false
  const { response } = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Move to Applications', 'Not Now'],
    defaultId: 0,
    cancelId: 1,
    message: 'Move hfgui to your Applications folder?',
    detail:
      blocker === 'disk-image'
        ? 'hfgui is running from the disk image. In Applications, it keeps itself up to date and stays put after you eject the disk image.'
        : 'macOS is running hfgui from a temporary copy. In Applications, it keeps itself up to date.'
  })
  if (response !== 0) return false
  try {
    // Replaces an older copy already there; relaunches from the new place.
    return app.moveToApplicationsFolder()
  } catch (e) {
    dialog.showErrorBox('Couldn’t move hfgui', (e as Error).message)
    return false
  }
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 980,
    minHeight: 640,
    show: false,
    // The window frame colour (--sidebar in globals.css), shown before first paint.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b0b0b' : '#f3f3f3',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    // Vertically centred on the 56 px header row, which starts 8 px down (inset margin).
    trafficLightPosition: { x: 20, y: 29 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })

  win.once('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // Dropping a link onto a renderer navigates it by default, which would
  // replace the whole app with a web page and no way back. The renderer also
  // preventDefault()s drops; this is the backstop.
  win.webContents.on('will-navigate', (event, url) => {
    const devServer = process.env['ELECTRON_RENDERER_URL']
    if (devServer && url.startsWith(devServer)) return
    event.preventDefault()
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

/**
 * The renderer talks to the Hugging Face API directly. In packaged builds the
 * page origin is file:// — normalize CORS on HF responses so fetch works in
 * both dev and production, and expose the Link header used for pagination.
 */
function patchHuggingFaceSession(settings: SettingsStore): void {
  const filter = { urls: ['https://huggingface.co/*'] }
  session.defaultSession.webRequest.onHeadersReceived(filter, (details, callback) => {
    const headers = details.responseHeaders ?? {}
    for (const key of Object.keys(headers)) {
      const lower = key.toLowerCase()
      if (lower === 'access-control-allow-origin' || lower === 'access-control-expose-headers') {
        delete headers[key]
      }
    }
    headers['Access-Control-Allow-Origin'] = ['*']
    headers['Access-Control-Expose-Headers'] = ['Link']
    callback({ responseHeaders: headers })
  })

  // Attach the HF token to Hub API calls at the network layer so gated repos
  // are browsable without ever exposing the token to the renderer. Scoped to
  // /api/* only: those endpoints never redirect to the CDN, so the token
  // cannot leak cross-origin. Do NOT widen this to huggingface.co/* —
  // /resolve/ responses 302 to the CDN.
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://huggingface.co/api/*'] },
    (details, callback) => {
      const token = settings.getToken()
      if (token && !details.requestHeaders['Authorization']) {
        details.requestHeaders['Authorization'] = `Bearer ${token}`
      }
      callback({ requestHeaders: details.requestHeaders })
    }
  )
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  void app.whenReady().then(async () => {
    if (await offerMoveToApplications()) return
    const settings = new SettingsStore(app.getPath('userData'))
    patchHuggingFaceSession(settings)

    // Drives the renderer's prefers-color-scheme; set before the window exists.
    nativeTheme.themeSource = settings.get().theme
    manager = new DownloadManager({
      userDataDir: app.getPath('userData'),
      getToken: () => settings.getToken(),
      getMaxConcurrent: () => settings.get().maxConcurrentJobs,
      getAutoResume: () => settings.get().autoResume,
      getSpeedLimit: () => effectiveSpeedLimit(settings.get()),
      registerInExo: registerModelWithExo
    })
    const downloads = manager

    // hfgui's own updates, from GitHub Releases. Automatic checks are off under
    // a test driver, like model update checks below.
    const updateUnavailable = appUpdateUnavailableReason()
    const appUpdates = new AppUpdates({
      updater: updateUnavailable ? null : createElectronUpdater(),
      unavailableReason: updateUnavailable ?? undefined,
      enabled: () => settings.get().autoUpdate && !process.env.HFGUI_USER_DATA_DIR,
      onChange: (status) => {
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) win.webContents.send(IPC.appUpdateEvent, status)
        }
      },
      // The quit that follows pauses and saves downloads (before-quit below);
      // this note makes the next launch resume the ones it interrupts.
      beforeInstall: async () => {
        const busy = downloads.list().filter((j) => isBusy(j.state)).map((j) => j.jobId)
        writeResumeMarker(app.getPath('userData'), busy)
      },
      log: (message) => console.log('[hfgui]', message)
    })

    registerIpc(manager, settings, appUpdates)
    // A damaged downloads.json must never cost the user their window: init()
    // used to throw here, before createWindow(), leaving a Dock icon and nothing else.
    try {
      await manager.init({ resumeJobIds: takeResumeMarker(app.getPath('userData')) })
    } catch (e) {
      console.error('[hfgui] could not restore downloads:', e)
    }
    appUpdates.start()

    // Notification Center, Dock badge and Dock progress bar. Seeded with the
    // restored jobs so only transitions from here on are announced.
    const notifier = createNotifier(
      {
        enabled: () => settings.get().notifications,
        appFocused: () => BrowserWindow.getAllWindows().some((w) => w.isFocused()),
        notify: showNotice,
        setBadge: (text) => app.dock?.setBadge(text),
        setProgress: (fraction) => {
          for (const w of BrowserWindow.getAllWindows()) {
            if (!w.isDestroyed()) w.setProgressBar(fraction)
          }
        }
      },
      manager.list()
    )
    manager.onEvent((ev) => notifier.handle(ev))
    setInterval(() => notifier.tick(), 1000).unref()

    // Newer versions of finished downloads: shortly after launch, then twice a
    // day. Not under a test driver, where results would depend on the Hub.
    if (!process.env.HFGUI_USER_DATA_DIR) {
      const m = manager
      const check = (): void => void m.checkUpdates().catch(() => {})
      setTimeout(check, 20_000).unref()
      setInterval(check, 12 * 60 * 60_000).unref()
    }

    // Packaged builds take their icon from the bundle; without this, dev runs
    // would show Electron's in the Dock.
    if (process.platform === 'darwin' && !app.isPackaged) {
      app.dock?.setIcon(join(__dirname, '../../build/icon.png'))
    }

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    app.quit()
  })

  app.on('before-quit', (event) => {
    if (manager) {
      event.preventDefault()
      const m = manager
      manager = null
      void m.shutdown().finally(() => app.quit())
    }
  })
}
