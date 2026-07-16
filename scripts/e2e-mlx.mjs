/**
 * MLX/exo scenario: download a tiny multi-file MLX repo to the detected exo
 * models dir and verify the flat {org}--{repo} layout exo expects.
 *
 * Run: npm run build && node scripts/e2e-mlx.mjs
 */
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { join } from 'path'
import { _electron as electron } from 'playwright-core'

const MODEL = 'mlx-community/SmolLM2-135M-Instruct-8bit'
const expectedDir = join(homedir(), '.exo', 'models', MODEL.replace('/', '--'))

const log = (msg) => console.log(`[e2e-mlx] ${msg}`)
const fail = (msg) => {
  console.error(`[e2e-mlx] FAIL: ${msg}`)
  process.exitCode = 1
}

if (existsSync(expectedDir)) {
  log(`${expectedDir} already exists — remove it first to re-run this scenario`)
  process.exit(0)
}

const userDataDir = mkdtempSync(join(tmpdir(), 'hfgui-e2e-mlx-'))
const app = await electron.launch({
  executablePath: join(
    process.cwd(),
    'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'
  ),
  args: [join(process.cwd(), 'out/main/index.js')],
  env: { ...process.env, HFGUI_USER_DATA_DIR: userDataDir }
})

try {
  const win = await app.firstWindow()
  await win.waitForSelector('[data-testid="search-input"]', { timeout: 15000 })
  await win.evaluate((id) => window.__hfguiTest.openModel(id), MODEL)

  // The picker should auto-select exo (detected install + MLX model).
  await win.waitForSelector('[data-testid="download-all"]', { timeout: 30000 })
  const destText = await win.locator('text=/Users/').first().textContent()
  if (!destText.includes('.exo/models')) fail(`expected exo destination, saw: ${destText}`)
  log(`destination auto-selected: ${destText.trim()}`)

  await win.click('[data-testid="download-all"]')
  log('multi-file download started')

  await win.waitForFunction(
    () => {
      const j = Object.values(window.__hfguiTest.getJobs())[0]
      return j && ['completed', 'error'].includes(j.state)
    },
    undefined,
    { timeout: 300000 }
  )
  const job = await win.evaluate(() => Object.values(window.__hfguiTest.getJobs())[0])
  if (job.state !== 'completed') {
    fail(`job ended ${job.state}: ${JSON.stringify(job.error)}`)
  } else {
    if (job.jobDir !== expectedDir) fail(`jobDir ${job.jobDir} != ${expectedDir}`)
    for (const f of job.files) {
      const p = join(expectedDir, f.path)
      const s = statSync(p)
      if (s.size !== f.size) fail(`${f.path}: ${s.size} != ${f.size}`)
    }
    const leftovers = readdirSync(expectedDir).filter((n) => n.endsWith('.partial'))
    if (leftovers.length) fail(`partials left: ${leftovers}`)
    if (!existsSync(join(expectedDir, 'model.safetensors.index.json'))) {
      fail('missing safetensors index — exo would not accept this folder')
    }
    log(`completed: ${job.files.length} files in ${expectedDir}`)
    log('layout + completeness OK — exo will pick this up')
  }
  if (process.exitCode !== 1) log('PASS')
} catch (e) {
  fail(e.stack ?? String(e))
} finally {
  await app.close().catch(() => {})
  rmSync(userDataDir, { recursive: true, force: true })
}
