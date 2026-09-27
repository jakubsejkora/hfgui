/**
 * Renders build/icon.svg into build/icon.png (1024 px) and build/icon.icns.
 *
 * Runs as an Electron main process, so the icon is drawn by the same Chromium
 * that draws the app — gradients, grain and blend modes come out identical.
 *
 * Run: npm run icon
 */
const { app, BrowserWindow, nativeImage } = require('electron')
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const buildDir = path.join(__dirname, '..', 'build')
const svg = fs.readFileSync(path.join(buildDir, 'icon.svg'), 'utf8')

// iconutil's required file names → pixel sizes.
const ICONSET = {
  'icon_16x16.png': 16,
  'icon_16x16@2x.png': 32,
  'icon_32x32.png': 32,
  'icon_32x32@2x.png': 64,
  'icon_128x128.png': 128,
  'icon_128x128@2x.png': 256,
  'icon_256x256.png': 256,
  'icon_256x256@2x.png': 512,
  'icon_512x512.png': 512,
  'icon_512x512@2x.png': 1024
}

/**
 * Rasterize the SVG at every requested size; returns PNG bytes per size.
 *
 * The SVG is loaded as an image and drawn into a canvas of exactly that many
 * pixels. Chromium draws SVG into canvas as vectors, so each size is rendered
 * natively rather than scaled, and the canvas keeps the transparent margin.
 * (Capturing window frames instead proved unreliable: offscreen frames lag
 * behind DOM changes, and tiny windows never paint at all.)
 */
async function renderSizes(sizes) {
  const win = new BrowserWindow({ show: false, width: 64, height: 64 })
  await win.loadURL('data:text/html,<!doctype html><title>icon</title>')
  const dataUrls = await win.webContents.executeJavaScript(`
    (async () => {
      const image = new Image()
      image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(${JSON.stringify(svg)})
      await image.decode()
      const out = {}
      for (const size of ${JSON.stringify(sizes)}) {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        canvas.getContext('2d').drawImage(image, 0, 0, size, size)
        out[size] = canvas.toDataURL('image/png')
      }
      return out
    })()
  `)
  win.destroy()

  const pngs = new Map()
  for (const size of sizes) {
    const image = nativeImage.createFromDataURL(dataUrls[size])
    const { width, height } = image.getSize()
    if (width !== size || height !== size) {
      throw new Error(`rendered ${width}×${height} for a ${size} px icon`)
    }
    pngs.set(size, image.toPNG())
  }
  return pngs
}

async function main() {
  app.dock?.hide()
  const iconset = path.join(buildDir, 'icon.iconset')
  fs.rmSync(iconset, { recursive: true, force: true })
  fs.mkdirSync(iconset)

  const pngs = await renderSizes([...new Set(Object.values(ICONSET))])
  for (const [name, size] of Object.entries(ICONSET)) {
    fs.writeFileSync(path.join(iconset, name), pngs.get(size))
  }
  fs.writeFileSync(path.join(buildDir, 'icon.png'), pngs.get(1024))

  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(buildDir, 'icon.icns')])
  fs.rmSync(iconset, { recursive: true, force: true })
  console.log('wrote build/icon.png and build/icon.icns')
}

app
  .whenReady()
  .then(main)
  .then(
    () => app.exit(0),
    (error) => {
      console.error(error)
      app.exit(1)
    }
  )
