/**
 * Grab screenshots of the main views for a visual check.
 *
 * Usage: node scripts/screenshot.mjs [outDir] [dark|light|both]
 *
 * Playwright pins prefers-color-scheme when it attaches, which desyncs the
 * renderer from nativeTheme.themeSource and makes the theme look broken when it
 * isn't. emulateMedia({ colorScheme: null }) hands control back to the app.
 */
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { _electron as electron } from 'playwright-core'

const outDir = process.argv[2] ?? '/tmp/hfgui-shots'
const themes = process.argv[3] === 'both' ? ['dark', 'light'] : [process.argv[3] ?? 'dark']
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
await win.emulateMedia({ colorScheme: null })

// Surface CSP violations and page errors — the bundled font is the likely one.
const problems = []
win.on('console', (m) => {
  if (/content security policy|refused to/i.test(m.text())) problems.push(m.text())
})
win.on('pageerror', (e) => problems.push(String(e)))

await win.waitForSelector('[data-testid="model-grid"] > button', { timeout: 30000 })

for (const theme of themes) {
  await app.evaluate(({ nativeTheme }, t) => {
    nativeTheme.themeSource = t
  }, theme)
  const suffix = themes.length > 1 ? `-${theme}` : ''
  // nativeTheme -> prefers-color-scheme -> html.light is async and can lag well
  // past a fixed timeout when the renderer is busy; wait for the real class.
  await win.waitForFunction(
    (t) => document.documentElement.classList.contains('light') === (t === 'light'),
    theme,
    { timeout: 10000 }
  )
  await win.waitForTimeout(250)

  await win.evaluate(() => window.__hfguiTest.setView('browse'))
  await win.waitForTimeout(400)
  await win.screenshot({ path: join(outDir, `browse${suffix}.png`) })

  await win.evaluate(
    (id) => window.__hfguiTest.openModel(id),
    'unsloth/SmolLM2-135M-Instruct-GGUF'
  )
  await win.waitForSelector('[data-testid^="download-"]', { timeout: 30000 })
  await win.click('[data-testid="destination-custom"]')
  await win.waitForTimeout(500)
  await win.screenshot({ path: join(outDir, `detail${suffix}.png`) })

  await win.keyboard.press('Escape')
  await win.evaluate(() => window.__hfguiTest.setView('settings'))
  await win.waitForTimeout(400)
  await win.screenshot({ path: join(outDir, `settings${suffix}.png`) })

  await win.evaluate(() => window.__hfguiTest.setView('private-inference'))
  await win.waitForTimeout(1200)
  await win.screenshot({ path: join(outDir, `private-inference${suffix}.png`) })

  await win.evaluate(() => window.__hfguiTest.setView('downloads'))
  await win.waitForTimeout(300)
  await win.screenshot({ path: join(outDir, `downloads${suffix}.png`) })
}

await app.close()
if (problems.length) {
  console.error(`page problems:\n${problems.join('\n')}`)
  process.exitCode = 1
}
console.log(`saved to ${outDir}`)
