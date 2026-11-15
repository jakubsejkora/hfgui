/**
 * End-to-end test of hfgui updating itself — the path every future release
 * depends on, so it is checked for real: two signed builds, the real
 * electron-updater and Squirrel.Mac, a real download interrupted by the restart.
 *
 *   npm run build && node scripts/e2e-update.mjs [screenshotDir]
 *
 * Builds a throwaway "hfgui-update-test" app (its own bundle id, profile and
 * caches — never hfgui's) as 0.0.1 and 0.0.2, serves 0.0.2 from a local feed
 * standing in for GitHub Releases, and drives 0.0.1: the automatic check finds
 * the update and downloads it, a speed-capped model download is running when
 * "Restart" is clicked, Squirrel swaps the bundle and relaunches it, and 0.0.2
 * picks the download up again by itself.
 *
 * Needs a "Developer ID Application" identity in the keychain: Squirrel.Mac only
 * installs updates signed like the running app. Not notarized — nothing here is
 * quarantined, so Gatekeeper never looks. Takes a few minutes (two packagings).
 * Everything it creates is deleted at the end.
 */
import { execFileSync } from 'child_process'
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs'
import { createServer } from 'http'
import { homedir, tmpdir } from 'os'
import { join } from 'path'
import { Arch, Platform, build } from 'electron-builder'
import { _electron as electron } from 'playwright-core'

const NAME = 'hfgui-update-test'
const APP_ID = 'cz.sejkora.hfgui.updatetest'
const OLD = '0.0.1'
const NEW = '0.0.2'
// 258 MB at the slowest cap (256 KB/s): still running long after the restart.
const MODEL = 'unsloth/SmolLM2-135M-Instruct-GGUF'
const FILE_MATCH = /F16\.gguf$/
const shotDir = process.argv[2] ?? null

const log = (m) => console.log(`[update] ${m}`)
let failed = false
const fail = (m) => {
  console.error(`[update] FAIL: ${m}`)
  failed = true
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(what, fn, timeoutMs, everyMs = 500) {
  const end = Date.now() + timeoutMs
  for (;;) {
    const value = await fn()
    if (value) return value
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`)
    await sleep(everyMs)
  }
}

// Everything the test app touches outside the work dir, named after its own id.
const home = homedir()
const traces = [
  join(home, 'Library/Application Support', NAME),
  join(home, 'Library/Caches', `${NAME}-updater`),
  join(home, 'Library/Caches', APP_ID),
  join(home, 'Library/Caches', `${APP_ID}.ShipIt`),
  join(home, 'Library/HTTPStorages', APP_ID),
  join(home, 'Library/Preferences', `${APP_ID}.plist`),
  join(home, 'Library/Saved Application State', `${APP_ID}.savedState`)
]
const profile = traces[0]

if (!existsSync('out/main/index.js')) {
  console.error('[update] run `npm run build` first')
  process.exit(1)
}
const identities = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' })
if (!identities.includes('Developer ID Application')) {
  console.error('[update] needs a "Developer ID Application" signing identity in the keychain')
  process.exit(1)
}

function killTestApp() {
  try {
    execFileSync('pkill', ['-f', `${NAME}.app/Contents/MacOS/${NAME}`])
  } catch {
    // not running
  }
}

function cleanTraces() {
  for (const p of traces) rmSync(p, { recursive: true, force: true })
}

killTestApp()
cleanTraces()
const work = mkdtempSync(join(tmpdir(), 'hfgui-update-e2e-'))
const feedDir = join(work, 'feed')
const modelsDir = join(work, 'models')
mkdirSync(feedDir)
mkdirSync(modelsDir)

// The local stand-in for GitHub Releases: serves latest-mac.yml and the zip.
const requests = []
const server = createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://x').pathname.slice(1))
  requests.push(`${req.method} /${name}`)
  const file = join(feedDir, name)
  if (!name || name.includes('..') || !existsSync(file)) {
    res.writeHead(404).end()
    return
  }
  const size = statSync(file).size
  const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '')
  if (range) {
    const start = Number(range[1])
    const end = range[2] ? Number(range[2]) : size - 1
    res.writeHead(206, { 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${size}` })
    createReadStream(file, { start, end }).pipe(res)
    return
  }
  res.writeHead(200, { 'Content-Length': size })
  createReadStream(file).pipe(res)
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const feedUrl = `http://127.0.0.1:${server.address().port}/`

async function buildVersion(version) {
  const output = join(work, `build-${version}`)
  log(`packaging ${NAME} ${version} (signed, not notarized)…`)
  await build({
    targets: Platform.MAC.createTarget(['zip'], Arch.arm64),
    publish: 'never',
    config: {
      appId: APP_ID,
      productName: NAME,
      // userData, the updater cache and the version all follow these.
      extraMetadata: { name: NAME, productName: NAME, version },
      directories: { output },
      mac: { notarize: false },
      // An array replaces electron-builder.yml's GitHub entry instead of merging into it.
      publish: [{ provider: 'generic', url: feedUrl }]
    }
  })
  return output
}

let app = null
try {
  const oldBuild = await buildVersion(OLD)
  const newBuild = await buildVersion(NEW)

  const updateYml = readFileSync(join(oldBuild, 'mac-arm64', `${NAME}.app/Contents/Resources/app-update.yml`), 'utf8')
  if (!updateYml.includes(feedUrl)) fail(`the old build doesn't point at the local feed:\n${updateYml}`)
  for (const f of readdirSync(newBuild)) {
    if (f === 'latest-mac.yml' || f.endsWith('.zip') || f.endsWith('.blockmap')) {
      execFileSync('cp', [join(newBuild, f), feedDir])
    }
  }
  const latest = readFileSync(join(feedDir, 'latest-mac.yml'), 'utf8')
  if (!latest.includes(`version: ${NEW}`)) fail(`latest-mac.yml doesn't announce ${NEW}:\n${latest}`)

  // Install the old version somewhere Squirrel can write.
  const appsDir = join(work, 'Applications')
  mkdirSync(appsDir)
  const appPath = join(appsDir, `${NAME}.app`)
  execFileSync('ditto', [join(oldBuild, 'mac-arm64', `${NAME}.app`), appPath])
  const plist = join(appPath, 'Contents/Info.plist')
  const bundleVersion = () => execFileSync('defaults', ['read', plist, 'CFBundleShortVersionString'], { encoding: 'utf8' }).trim()
  log(`installed ${bundleVersion()} at ${appPath}`)

  // A set-up install: no welcome screen, downloads go to the work dir, slowly.
  mkdirSync(profile, { recursive: true })
  writeFileSync(
    join(profile, 'settings.json'),
    JSON.stringify({
      onboarded: true,
      customDir: modelsDir,
      maxConcurrentJobs: 1,
      autoResume: false,
      speedLimitEnabled: true,
      speedLimitBytesPerSec: 256 * 1024
    })
  )

  // What to download, straight from the Hub.
  const info = await (await fetch(`https://huggingface.co/api/models/${MODEL}`)).json()
  const tree = await (await fetch(`https://huggingface.co/api/models/${MODEL}/tree/${info.sha}`)).json()
  const file = tree.find((f) => f.type === 'file' && FILE_MATCH.test(f.path))
  if (!file) throw new Error(`no file matching ${FILE_MATCH} in ${MODEL}`)

  app = await electron.launch({
    executablePath: join(appPath, 'Contents/MacOS', NAME),
    args: ['--force-device-scale-factor=2'],
    // Not HFGUI_USER_DATA_DIR: under it automatic update checks are off, and
    // the relaunched app wouldn't inherit it anyway. The test app's own name
    // keeps its profile apart from hfgui's.
    env: { ...process.env }
  })
  const win = await app.firstWindow()
  await win.emulateMedia({ colorScheme: null })
  const running = await app.evaluate(({ app }) => ({ version: app.getVersion(), userData: app.getPath('userData') }))
  if (running.version !== OLD) fail(`launched ${running.version}, expected ${OLD}`)
  if (running.userData !== profile) fail(`profile is ${running.userData}, expected ${profile}`)
  await win.waitForSelector('[data-testid="nav-overview"]')

  const started = await win.evaluate(
    ([req]) => window.hfgui.startDownload(req),
    [
      {
        repoId: MODEL,
        revision: info.sha,
        displayName: `${MODEL.split('/')[1]} · F16`,
        format: 'gguf',
        files: [{ path: file.path, size: file.lfs?.size ?? file.size, sha256: file.lfs?.oid ?? null }],
        destination: { kind: 'custom', baseDir: modelsDir }
      }
    ]
  )
  if (!started.ok) throw new Error(`download didn't start: ${started.message}`)
  const jobId = started.jobId
  const jobDir = await win.evaluate((id) => window.__hfguiTest.getJobs()[id]?.jobDir, jobId)
  if (!jobDir?.startsWith(modelsDir)) throw new Error(`download landed outside the work dir: ${jobDir}`)
  await until('the download to run', () => win.evaluate((id) => window.__hfguiTest.getJobs()[id]?.state === 'downloading', jobId), 30_000)
  log(`downloading ${file.path} at 256 KB/s`)

  // The automatic check runs 15 s after launch; then the update downloads.
  const seen = new Set()
  const status = await until(
    'the update to be ready',
    async () => {
      const s = await win.evaluate(() => window.hfgui.getAppUpdate())
      seen.add(s.status)
      if (s.status === 'error') throw new Error(`update failed: ${s.message}`)
      return s.status === 'ready' ? s : null
    },
    180_000
  )
  log(`statuses seen: ${[...seen].join(' → ')}`)
  if (status.version !== NEW) fail(`ready version is ${status.version}, expected ${NEW}`)
  if (!requests.some((r) => r.startsWith('GET /latest-mac.yml'))) fail('the app never asked for latest-mac.yml')
  if (!requests.some((r) => r.endsWith('.zip'))) fail('the app never fetched the zip')

  await win.waitForSelector('[data-testid="app-update-card"]')
  if (shotDir) {
    mkdirSync(shotDir, { recursive: true })
    await sleep(400)
    await win.screenshot({ path: join(shotDir, 'update-ready.png') })
    await win.evaluate(() => window.__hfguiTest.setView('settings'))
    await win.locator('[data-testid="app-update-status"]').scrollIntoViewIfNeeded()
    await sleep(300)
    await win.screenshot({ path: join(shotDir, 'update-settings.png') })
  }

  // Restart mid-download: the dialog says what happens to it.
  await win.click('[data-testid="app-update-card"]')
  const dialog = win.getByRole('alertdialog')
  await dialog.waitFor()
  const text = await dialog.innerText()
  if (!/A download is in progress/.test(text)) fail(`restart dialog says: ${text}`)
  if (shotDir) {
    await sleep(350)
    await win.screenshot({ path: join(shotDir, 'update-restart-dialog.png') })
  }
  const bytesBefore = await win.evaluate((id) => window.__hfguiTest.getJobs()[id]?.bytesDone ?? 0, jobId)
  const closed = app.waitForEvent('close', { timeout: 60_000 })
  await win.click('[data-testid="app-update-restart-confirm"]')
  await closed
  app = null
  log('old version quit; waiting for Squirrel to install and relaunch…')

  await until('the new version on disk', () => bundleVersion() === NEW, 90_000, 1000)
  log(`bundle is now ${bundleVersion()}`)
  const pid = await until(
    'the new version to relaunch',
    () => {
      try {
        return execFileSync('pgrep', ['-f', `${appPath}/Contents/MacOS/${NAME}`], { encoding: 'utf8' }).trim()
      } catch {
        return null
      }
    },
    60_000,
    1000
  )
  log(`relaunched (pid ${pid.split('\n')[0]})`)
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath])
  log('installed bundle passes codesign --verify --deep --strict')

  // The relaunched copy resumes the download the restart interrupted.
  const job = await until(
    'the interrupted download to resume',
    () => {
      try {
        const jobs = JSON.parse(readFileSync(join(profile, 'downloads.json'), 'utf8'))
        const j = jobs.find((x) => x.jobId === jobId)
        return j && (j.state === 'downloading' || j.state === 'completed') ? j : null
      } catch {
        return null
      }
    },
    60_000,
    1000
  )
  log(`after the restart the download is ${job.state}`)
  if (existsSync(join(profile, 'resume-after-update.json'))) fail('the resume note was not consumed')
  const partial = join(jobDir, `${file.path}.partial`)
  const sizeAt = () => (existsSync(partial) ? statSync(partial).size : 0)
  const before = sizeAt()
  await sleep(4000)
  const after = sizeAt()
  if (!(after > before)) fail(`the partial file isn't growing (${before} → ${after})`)
  else log(`partial file growing: ${before} → ${after} bytes (was ${bytesBefore} before the restart)`)
} catch (e) {
  fail(e.stack ?? String(e))
} finally {
  if (app) await app.close().catch(() => {})
  killTestApp()
  server.close()
  await sleep(500)
  try {
    // Forget the throwaway bundle in Launch Services before deleting it.
    execFileSync(
      '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister',
      ['-u', join(work, 'Applications', `${NAME}.app`)],
      { stdio: 'ignore' }
    )
  } catch {
    // never registered
  }
  rmSync(work, { recursive: true, force: true })
  cleanTraces()
}

log(failed ? 'FAILED' : 'PASSED')
process.exit(failed ? 1 : 0)
