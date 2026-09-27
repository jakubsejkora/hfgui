/**
 * End-to-end test for the download speed cap, against the real Hugging Face CDN.
 *
 * Checks the cap at two levels: the app's own byte count, and the Electron main
 * process's actual network bytes-in as measured by macOS `nettop` — the second
 * is what proves the connection is freed up, not just the disk writes.
 *
 * Downloads to a temp dir and cancels at the end; nothing is left behind.
 * Run: npm run build && node scripts/e2e-throttle.mjs [screenshotDir]
 */
import { execFile } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { _electron as electron } from 'playwright-core'

const MODEL = 'unsloth/SmolLM2-135M-Instruct-GGUF'
// 258 MB: enough headroom that a fast link can't finish mid-measurement.
const QUANT = 'F16'
const MiB = 1024 * 1024
const CAP = 2 * MiB
const shotDir = process.argv[2] ?? null

const userDataDir = mkdtempSync(join(tmpdir(), 'hfgui-throttle-'))
const downloadDir = mkdtempSync(join(tmpdir(), 'hfgui-throttle-models-'))
writeFileSync(
  join(userDataDir, 'settings.json'),
  JSON.stringify({
    customDir: downloadDir,
    maxConcurrentJobs: 2,
    autoResume: false,
    speedLimitEnabled: true,
    speedLimitBytesPerSec: CAP
  })
)

const log = (m) => console.log(`[throttle] ${m}`)
const fail = (m) => {
  console.error(`[throttle] FAIL: ${m}`)
  process.exitCode = 1
}
const mbps = (bytesPerSec) => `${(bytesPerSec / MiB).toFixed(2)} MB/s`

/**
 * Average bytes-in per second for `pid` over `seconds`, from nettop's delta
 * mode (the first sample is a cumulative total, so it's dropped). null when
 * nettop is unavailable or reports nothing for the process.
 */
function networkRate(pid, seconds) {
  return new Promise((resolve) => {
    execFile(
      'nettop',
      // -n matters: without it nettop blocks on reverse-DNS lookups and never prints.
      ['-P', '-x', '-n', '-d', '-L', String(seconds + 1), '-s', '1', '-J', 'bytes_in', '-p', String(pid)],
      { timeout: (seconds + 6) * 1000 },
      (error, stdout) => {
        if (error && !stdout) return resolve(null)
        const samples = String(stdout)
          .split('\n')
          .filter((line) => line.includes(`.${pid},`))
          .map((line) => Number(line.split(',')[1]))
          .slice(1)
        if (!samples.length || samples.some((n) => !Number.isFinite(n))) return resolve(null)
        resolve(samples.reduce((a, b) => a + b, 0) / samples.length)
      }
    )
  })
}

const app = await electron.launch({
  executablePath: join(
    process.cwd(),
    'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'
  ),
  args: [join(process.cwd(), 'out/main/index.js')],
  env: { ...process.env, HFGUI_USER_DATA_DIR: userDataDir }
})
const pid = app.process().pid

try {
  const win = await app.firstWindow()
  await win.emulateMedia({ colorScheme: null })
  await win.waitForSelector('[data-testid="search-input"]', { timeout: 15000 })

  await win.evaluate((id) => window.__hfguiTest.openModel(id), MODEL)
  await win.waitForSelector(`[data-testid="download-${QUANT}"]`, { timeout: 30000 })
  // Never let a test write into a real app library. The sheet auto-selects LM
  // Studio or exo when they're installed, so pick the temp folder explicitly —
  // and stop at once if a job lands anywhere else anyway.
  await win.click('[data-testid="destination-custom"]')
  await win.click(`[data-testid="download-${QUANT}"]`)
  await win.keyboard.press('Escape')
  await win.waitForFunction(() => Object.keys(window.__hfguiTest.getJobs()).length > 0)
  {
    const started = Object.values(await win.evaluate(() => window.__hfguiTest.getJobs()))[0]
    if (!started.jobDir.startsWith(downloadDir)) {
      await win.evaluate((id) => window.hfgui.cancelDownload(id), started.jobId)
      throw new Error(`download went to ${started.jobDir}, outside the test folder — cancelled`)
    }
  }

  const theJob = async () =>
    Object.values(await win.evaluate(() => window.__hfguiTest.getJobs()))[0]
  await win.waitForFunction(
    () => {
      const j = Object.values(window.__hfguiTest.getJobs())[0]
      return j && j.state === 'downloading' && j.bytesDone > 0
    },
    undefined,
    { timeout: 30000 }
  )
  const { jobId } = await theJob()

  /** The app's own rate: bytes it has passed through, over `ms`. */
  const appRate = async (ms) => {
    const a = await theJob()
    const t0 = Date.now()
    await win.waitForTimeout(ms)
    const b = await theJob()
    return (b.bytesDone - a.bytesDone) / ((Date.now() - t0) / 1000)
  }

  // 1. Capped: both the app's byte count and the socket stay at the cap.
  await win.waitForTimeout(1500) // let the first receive-buffer burst drain
  const [capped, cappedNet] = await Promise.all([appRate(6000), networkRate(pid, 6)])
  log(`capped at ${mbps(CAP)}: app ${mbps(capped)}, network ${cappedNet === null ? 'n/a' : mbps(cappedNet)}`)
  if (capped > CAP * 1.15) fail(`app rate ${mbps(capped)} exceeds the ${mbps(CAP)} cap`)
  if (capped < CAP * 0.6) fail(`app rate ${mbps(capped)} is far below the cap — throttle too eager`)
  if (cappedNet === null) log('nettop unavailable — skipped the network-level check')
  else if (cappedNet > CAP * 1.3) fail(`the socket ran at ${mbps(cappedNet)} — the cap is not reaching the network`)

  // 2. The top bar shows the cap, and its popover turns it off.
  const chip = win.locator('[data-testid="speed-chip"]')
  const chipText = (await chip.textContent()) ?? ''
  if (!chipText.includes('/ 2 MB/s')) fail(`speed chip reads "${chipText}", expected "… / 2 MB/s"`)
  await chip.click()
  const toggle = win.getByRole('switch', { name: 'Limit download speed' })
  await toggle.waitFor({ timeout: 5000 })
  await win.waitForTimeout(400) // let the popover finish animating in
  if (shotDir) await win.screenshot({ path: join(shotDir, 'speed-popover.png') })
  await toggle.click()
  log('switched the cap off from the top-bar popover')

  // 3. Uncapped: the speed rises — if the link is faster than the cap at all.
  await win.waitForTimeout(1500)
  const uncapped = await appRate(4000)
  const done = (await theJob()).state === 'completed'
  if (uncapped > CAP * 1.5 || done) log(`uncapped: ${mbps(uncapped)} — cap lifted on the running download`)
  else log(`uncapped: ${mbps(uncapped)} — this link isn't faster than the cap, so nothing to compare`)

  // 4. Switching on while downloads outrun the stored cap picks half the current speed.
  //    Store a cap far above the current speed first, and make sure the UI sees it —
  //    otherwise this would pass by keeping the old cap, proving nothing.
  if (!done && uncapped > 1 * MiB) {
    await win.evaluate((b) => window.hfgui.setSettings({ speedLimitBytesPerSec: b }), 100 * MiB)
    await win.evaluate(() => window.__hfguiTest.refreshSettings())
    await win.waitForFunction(
      () => document.querySelector('[data-testid="speed-limit-label"]')?.textContent === '100 MB/s',
      undefined,
      { timeout: 5000 }
    )
    await toggle.click()
    await win.waitForTimeout(600)
    const settings = await win.evaluate(() => window.hfgui.getSettings())
    const picked = settings.speedLimitBytesPerSec
    if (!settings.speedLimitEnabled) fail('switching on from the popover did not enable the cap')
    else if (picked < uncapped * 0.2 || picked > uncapped * 0.75) {
      fail(`switching on picked ${mbps(picked)}, not under half of the ${mbps(uncapped)} being downloaded`)
    } else log(`switching on picked ${mbps(picked)} — under half of the ${mbps(uncapped)} being downloaded`)
    if (!(await win.getByText('rest of your connection stays free').isVisible())) {
      fail('no note explaining the picked cap')
    }
    if (shotDir) await win.screenshot({ path: join(shotDir, 'speed-popover-auto.png') })
  }
  await win.keyboard.press('Escape')

  // 5. Pausing a download that's being held back is still instant.
  if ((await theJob()).state === 'downloading') {
    await win.evaluate(
      (b) => window.hfgui.setSettings({ speedLimitEnabled: true, speedLimitBytesPerSec: b }),
      0.5 * MiB
    )
    await win.waitForTimeout(1000)
    const t0 = Date.now()
    await win.evaluate((id) => window.hfgui.pauseDownload(id), jobId)
    await win.waitForFunction(
      (id) => window.__hfguiTest.getJobs()[id]?.state === 'paused',
      jobId,
      { timeout: 5000 }
    )
    const took = Date.now() - t0
    if (took > 1000) fail(`pausing a capped download took ${took} ms`)
    else log(`pausing while capped took ${took} ms`)
  }

  await win.evaluate((id) => window.hfgui.cancelDownload(id), jobId)
  await win.waitForTimeout(500)
} catch (error) {
  fail(error.stack ?? String(error))
} finally {
  await app.close().catch(() => {})
  rmSync(userDataDir, { recursive: true, force: true })
  rmSync(downloadDir, { recursive: true, force: true })
  if (!process.exitCode) console.log('[throttle] all checks passed')
}
