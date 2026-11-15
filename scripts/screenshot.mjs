// Screenshots of every page, for reviewing UI changes.
//
//   node scripts/screenshot.mjs [outDir] [dark|light|both]
//
// Runs against a throwaway profile seeded with a few downloads (finished,
// paused, failed — nothing real on disk) so Overview and Downloads are shot
// populated, and with HF_HOME pointed at an empty dir so no personal Hugging
// Face token or account ever lands in a screenshot.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const outDir = process.argv[2] ?? '/tmp/hfgui-shots'
const themes = process.argv[3] === 'both' ? ['dark', 'light'] : [process.argv[3] ?? 'dark']
const userDataDir = mkdtempSync(join(tmpdir(), 'hfgui-shot-'))
const hfHome = mkdtempSync(join(tmpdir(), 'hfgui-shot-hfhome-'))
const modelsDir = join(tmpdir(), 'hfgui-shot-models')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({ customDir: '/tmp' }))

const HOUR = 3600_000
const now = Date.now()
const job = (o) => {
  const files = o.files.map((f) => ({ sha256: null, state: 'pending', bytesDone: 0, ...f }))
  return {
    revision: 'main',
    format: 'gguf',
    error: null,
    completedAt: null,
    exoRegistration: null,
    ...o,
    files,
    bytesDone: files.reduce((s, f) => s + f.bytesDone, 0),
    totalBytes: files.reduce((s, f) => s + f.size, 0)
  }
}
writeFileSync(
  join(userDataDir, 'downloads.json'),
  JSON.stringify([
    job({
      jobId: 'job_shot_paused',
      repoId: 'bartowski/Meta-Llama-3.1-8B-Instruct-GGUF',
      displayName: 'Meta-Llama-3.1-8B-Instruct-GGUF · Q5_K_M',
      destination: { kind: 'custom', baseDir: modelsDir },
      jobDir: join(modelsDir, 'bartowski/Meta-Llama-3.1-8B-Instruct-GGUF'),
      files: [{ path: 'Meta-Llama-3.1-8B-Instruct-Q5_K_M.gguf', size: 5_732_987_232, bytesDone: 2_610_000_000 }],
      state: 'paused',
      createdAt: now - 0.4 * HOUR
    }),
    job({
      jobId: 'job_shot_failed',
      repoId: 'meta-llama/Llama-3.2-3B-Instruct',
      displayName: 'Llama-3.2-3B-Instruct',
      format: 'other',
      destination: { kind: 'custom', baseDir: modelsDir },
      jobDir: join(modelsDir, 'meta-llama/Llama-3.2-3B-Instruct'),
      files: [{ path: 'model-00001-of-00002.safetensors', size: 4_965_799_096 }],
      state: 'error',
      error: {
        code: 'auth-required',
        message: 'HTTP 401 — this model requires a Hugging Face token (and an accepted license)'
      },
      createdAt: now - 1.5 * HOUR
    }),
    job({
      jobId: 'job_shot_exo',
      repoId: 'mlx-community/Qwen3-4B-4bit',
      displayName: 'Qwen3-4B-4bit',
      format: 'mlx',
      destination: { kind: 'exo', baseDir: modelsDir },
      jobDir: join(modelsDir, 'mlx-community--Qwen3-4B-4bit'),
      files: [{ path: 'model.safetensors', size: 2_263_022_529, bytesDone: 2_263_022_529, state: 'done' }],
      state: 'completed',
      completedAt: now - 3 * HOUR,
      createdAt: now - 3.2 * HOUR,
      exoRegistration: { status: 'registered', message: null }
    }),
    job({
      jobId: 'job_shot_done',
      repoId: 'unsloth/Qwen3-8B-GGUF',
      displayName: 'Qwen3-8B-GGUF · Q4_K_M',
      destination: { kind: 'lmstudio', baseDir: modelsDir },
      jobDir: join(modelsDir, 'unsloth/Qwen3-8B-GGUF'),
      files: [{ path: 'Qwen3-8B-Q4_K_M.gguf', size: 5_027_784_416, bytesDone: 5_027_784_416, state: 'done' }],
      state: 'completed',
      completedAt: now - 26 * HOUR,
      createdAt: now - 26.5 * HOUR
    })
  ])
)

const app = await electron.launch({
  executablePath: join(
    process.cwd(),
    'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'
  ),
  args: [join(process.cwd(), 'out/main/index.js')],
  env: { ...process.env, HFGUI_USER_DATA_DIR: userDataDir, HF_HOME: hfHome }
})

const win = await app.firstWindow()
await win.emulateMedia({ colorScheme: null })

// Surface CSP violations and page errors — the bundled font is the likely one.
const problems = []
win.on('console', (m) => {
  if (/content security policy|refused to/i.test(m.text())) problems.push(m.text())
})
win.on('pageerror', (e) => problems.push(String(e)))

/**
 * Electron drag regions win over z-order, and Playwright's synthetic clicks go
 * around them — so a control left draggable looks fine in every test but eats
 * real clicks. Check the computed app-region instead.
 */
async function assertNoDragTraps(where) {
  const offenders = await win.evaluate(() => {
    const region = (el) => getComputedStyle(el).getPropertyValue('-webkit-app-region').trim()
    const interactive =
      'button, a, input, select, textarea, label, summary, [role=button], [role=combobox], [role=switch], [role=slider], [role=tab], [role=radio], [role=checkbox], [role=menuitem], [tabindex]:not([tabindex="-1"])'
    const bad = []
    for (const zone of document.querySelectorAll('.drag-region')) {
      for (const el of zone.querySelectorAll(interactive)) {
        if (region(el) !== 'no-drag') bad.push(el.outerHTML.slice(0, 90))
      }
    }
    const portals =
      '[data-radix-popper-content-wrapper], [role=dialog], [role=alertdialog], [role=menu], [role=listbox], [data-slot$="-overlay"], [data-slot=toaster]'
    for (const el of document.querySelectorAll(portals)) {
      if (region(el) !== 'no-drag') bad.push(el.outerHTML.slice(0, 90))
    }
    return bad
  })
  if (offenders.length) problems.push(`drag-region traps (${where}):\n  ${offenders.join('\n  ')}`)
}

// The app lands on Overview; the grid lives on Browse.
await win.waitForSelector('[data-testid="search-input"]', { timeout: 15000 })
await win.evaluate(() => window.__hfguiTest.setView('browse'))
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

  await win.evaluate(() => window.__hfguiTest.setView('overview'))
  await win.waitForSelector('[data-testid="overview-trending"] > button', { timeout: 30000 })
  await win.waitForTimeout(600)
  await win.screenshot({ path: join(outDir, `overview${suffix}.png`) })

  await win.evaluate(() => window.__hfguiTest.setView('browse'))
  await win.waitForSelector('[data-testid="model-grid"] > button', { timeout: 30000 })
  await win.waitForTimeout(400)
  await win.screenshot({ path: join(outDir, `browse${suffix}.png`) })

  await win.click('[data-testid="layout-table"]')
  await win.waitForSelector('[data-testid="model-table"]', { timeout: 10000 })
  await win.waitForTimeout(400)
  await win.screenshot({ path: join(outDir, `browse-table${suffix}.png`) })
  await win.click('[data-testid="layout-grid"]')

  await win.evaluate(
    (id) => window.__hfguiTest.openModel(id),
    'unsloth/SmolLM2-135M-Instruct-GGUF'
  )
  await win.waitForSelector('[data-testid^="download-"]', { timeout: 30000 })
  await win.click('[data-testid="destination-custom"]')
  await win.waitForTimeout(500)
  await assertNoDragTraps('model sheet')
  await win.screenshot({ path: join(outDir, `detail${suffix}.png`) })

  await win.keyboard.press('Escape')
  await win.evaluate(() => window.__hfguiTest.setView('downloads'))
  await win.waitForTimeout(400)
  await assertNoDragTraps('downloads')
  await win.screenshot({ path: join(outDir, `downloads${suffix}.png`) })

  await win.evaluate(() => window.__hfguiTest.setView('settings'))
  await win.waitForTimeout(400)
  await win.screenshot({ path: join(outDir, `settings${suffix}.png`) })

  await win.evaluate(() => window.__hfguiTest.setView('private-inference'))
  await win.waitForTimeout(1500)
  await win.screenshot({ path: join(outDir, `private-inference${suffix}.png`) })

  await win.evaluate(() => window.__hfguiTest.setView('guide'))
  await win.waitForSelector('#guide-how', { timeout: 10000 })
  await win.waitForTimeout(400)
  await assertNoDragTraps('guide')
  await win.screenshot({ path: join(outDir, `guide${suffix}.png`) })

  // The first-run welcome: shown again the way Settings → Show again does it.
  await win.evaluate(async () => {
    await window.hfgui.setSettings({ onboarded: false })
    window.__hfguiTest.refreshSettings()
  })
  await win.waitForSelector('[data-testid="onboarding"]', { timeout: 10000 })
  await win.waitForTimeout(400)
  await assertNoDragTraps('welcome')
  await win.screenshot({ path: join(outDir, `welcome${suffix}.png`) })
  await win.evaluate(async () => {
    await window.hfgui.setSettings({ onboarded: true })
    window.__hfguiTest.refreshSettings()
  })
  await win.waitForSelector('[data-testid="search-input"]', { timeout: 10000 })
}

await app.close()
if (problems.length) {
  console.error(`page problems:\n${problems.join('\n')}`)
  process.exitCode = 1
}
console.log(`saved to ${outDir}`)
