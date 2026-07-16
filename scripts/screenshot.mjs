/** Grab screenshots of the main views for a visual check. */
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { _electron as electron } from 'playwright-core'

const outDir = process.argv[2] ?? '/tmp/hfgui-shots'
const userDataDir = mkdtempSync(join(tmpdir(), 'hfgui-shot-'))
writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({ customDir: '/tmp' }))

const app = await electron.launch({
  executablePath: join(
    process.cwd(),
    'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'
  ),
  args: [join(process.cwd(), 'out/main/index.js')],
  env: { ...process.env, HFGUI_USER_DATA_DIR: userDataDir }
})

const win = await app.firstWindow()
await win.waitForSelector('[data-testid="model-grid"] > button', { timeout: 30000 })
await win.waitForTimeout(800)
await win.screenshot({ path: join(outDir, 'browse.png') })

await win.evaluate((id) => window.__hfguiTest.openModel(id), 'unsloth/SmolLM2-135M-Instruct-GGUF')
await win.waitForSelector('[data-testid^="download-"]', { timeout: 30000 })
await win.waitForTimeout(500)
await win.screenshot({ path: join(outDir, 'detail.png') })

await win.keyboard.press('Escape')
await win.evaluate(() => window.__hfguiTest.setView('settings'))
await win.waitForTimeout(400)
await win.screenshot({ path: join(outDir, 'settings.png') })

await win.evaluate(() => window.__hfguiTest.setView('downloads'))
await win.waitForTimeout(300)
await win.screenshot({ path: join(outDir, 'downloads.png') })

await app.close()
console.log(`saved to ${outDir}`)
