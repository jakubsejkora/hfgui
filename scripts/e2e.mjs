/**
 * End-to-end test: launches the built app, browses to a small GGUF model,
 * downloads it to a temp folder with a pause/resume in the middle, and
 * verifies the file lands with the right size and layout.
 *
 * Run: npm run build && node scripts/e2e.mjs
 */
import { mkdtempSync, statSync, writeFileSync, existsSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { _electron as electron } from 'playwright-core'

const MODEL = 'unsloth/SmolLM2-135M-Instruct-GGUF'
const userDataDir = mkdtempSync(join(tmpdir(), 'hfgui-e2e-userdata-'))
const downloadDir = mkdtempSync(join(tmpdir(), 'hfgui-e2e-models-'))

// Pre-seed the custom download folder so no native dialog is needed.
writeFileSync(
  join(userDataDir, 'settings.json'),
  JSON.stringify({ customDir: downloadDir, maxConcurrentJobs: 2, autoResume: false })
)

const log = (msg) => console.log(`[e2e] ${msg}`)
const fail = (msg) => {
  console.error(`[e2e] FAIL: ${msg}`)
  process.exitCode = 1
}

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
  log('app launched, browse view rendered')

  // Browse view should load real trending models from the HF API.
  await win.waitForSelector('[data-testid="model-grid"] > button', { timeout: 30000 })
  const cardCount = await win.locator('[data-testid="model-grid"] > button').count()
  if (cardCount < 5) fail(`expected a page of model cards, got ${cardCount}`)
  log(`browse loaded ${cardCount} model cards`)

  // Open a known small model and start the smallest quant download.
  await win.evaluate((id) => window.__hfguiTest.openModel(id), MODEL)
  await win.waitForSelector('[data-testid^="download-"]', { timeout: 30000 })
  const firstButton = win.locator('[data-testid^="download-"]').first()
  const quantLabel = await firstButton.getAttribute('data-testid')
  await firstButton.click()
  log(`started download for ${quantLabel}`)

  const jobs = async () => await win.evaluate(() => window.__hfguiTest.getJobs())
  const theJob = async () => Object.values(await jobs())[0]

  // Wait until it is actually downloading with some bytes on disk.
  await win.waitForFunction(
    () => {
      const job = Object.values(window.__hfguiTest.getJobs())[0]
      return job && (job.state === 'completed' || (job.state === 'downloading' && job.bytesDone > 1_000_000))
    },
    undefined,
    { timeout: 60000 }
  )

  // Pause mid-flight (best-effort — tiny models may finish first), then resume.
  let job = await theJob()
  if (job.state === 'downloading') {
    await win.evaluate((id) => window.hfgui.pauseDownload(id), job.jobId)
    await win.waitForFunction(
      (id) => window.__hfguiTest.getJobs()[id]?.state === 'paused',
      job.jobId,
      { timeout: 10000 }
    )
    job = await theJob()
    const pausedBytes = job.bytesDone
    if (pausedBytes <= 0) fail('paused job lost its progress')
    const partial = join(job.jobDir, `${job.files[0].path}.partial`)
    if (!existsSync(partial)) fail(`expected partial file at ${partial}`)
    log(`paused at ${(pausedBytes / 1e6).toFixed(1)} MB, .partial present — resuming`)
    await win.evaluate((id) => window.hfgui.resumeDownload(id), job.jobId)
  } else {
    log('download finished before pause could be tested (small file)')
  }

  await win.waitForFunction(
    () => {
      const j = Object.values(window.__hfguiTest.getJobs())[0]
      return j && ['completed', 'error'].includes(j.state)
    },
    undefined,
    { timeout: 300000 }
  )
  job = await theJob()
  if (job.state !== 'completed') {
    fail(`job ended in state ${job.state}: ${JSON.stringify(job.error)}`)
  } else {
    const finalPath = join(job.jobDir, job.files[0].path)
    const expected = job.files[0].size
    const actual = statSync(finalPath).size
    if (actual !== expected) fail(`size mismatch: ${actual} != ${expected}`)
    if (existsSync(`${finalPath}.partial`)) fail('.partial file left behind')
    // layout: <base>/<author>/<repo>/<file>
    const wantDir = join(downloadDir, ...MODEL.split('/'))
    if (job.jobDir !== wantDir) fail(`jobDir ${job.jobDir} != ${wantDir}`)
    log(`completed: ${finalPath} (${(actual / 1e6).toFixed(1)} MB), layout OK`)
  }

  // Downloads view shows the completed row.
  await win.evaluate(() => window.__hfguiTest.setView('downloads'))
  await win.waitForSelector('text=Completed', { timeout: 5000 })
  log('downloads view shows the completed job')

  if (process.exitCode !== 1) log('PASS — all checks green')
} catch (e) {
  fail(e.stack ?? String(e))
} finally {
  await app.close().catch(() => {})
  rmSync(downloadDir, { recursive: true, force: true })
  rmSync(userDataDir, { recursive: true, force: true })
}
