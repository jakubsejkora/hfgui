import { BrowserWindow, app, session, shell } from 'electron'
import { join } from 'path'
import { DownloadManager } from './downloads/manager'
import { registerIpc } from './ipc'
import { SettingsStore } from './settings'

// Deterministic userData for e2e runs.
if (process.env.HFGUI_USER_DATA_DIR) {
  app.setPath('userData', process.env.HFGUI_USER_DATA_DIR)
}

let manager: DownloadManager | null = null

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: '#0b0b0e',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 18 },
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
function patchHuggingFaceCors(): void {
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
    patchHuggingFaceCors()

    const settings = new SettingsStore(app.getPath('userData'))
    manager = new DownloadManager({
      userDataDir: app.getPath('userData'),
      getToken: () => settings.getToken(),
      getMaxConcurrent: () => settings.get().maxConcurrentJobs,
      getAutoResume: () => settings.get().autoResume
    })
    registerIpc(manager, settings)
    await manager.init()

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
