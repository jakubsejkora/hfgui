/**
 * End-to-end test for the link-paste and drag-to-download paths.
 *
 * Only the final drag step touches the network for a download; everything else
 * is resolve-only. Run: npm run build && node scripts/e2e-paste.mjs
 */
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { _electron as electron } from 'playwright-core'

const MODEL = 'unsloth/SmolLM2-135M-Instruct-GGUF'
const userDataDir = mkdtempSync(join(tmpdir(), 'hfgui-paste-'))
const downloadDir = mkdtempSync(join(tmpdir(), 'hfgui-paste-models-'))
writeFileSync(
  join(userDataDir, 'settings.json'),
  JSON.stringify({ customDir: downloadDir, maxConcurrentJobs: 2, autoResume: false })
)

const log = (m) => console.log(`[paste] ${m}`)
const fail = (m) => {
  console.error(`[paste] FAIL: ${m}`)
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

// Step 6 writes to the real system clipboard; put back whatever was there.
const savedClipboard = await app.evaluate(({ clipboard }) => clipboard.readText())

try {
  const win = await app.firstWindow()
  await win.emulateMedia({ colorScheme: null })
  await win.waitForSelector('[data-testid="model-grid"] > button', { timeout: 30000 })
  const ui = () => win.evaluate(() => window.__hfguiTest.getUi())

  // 1. Pasting a full Hub URL into the empty omnibox jumps straight to it.
  await win.evaluate((url) => {
    const input = document.querySelector('[data-testid="search-input"]')
    input.focus()
    const data = new DataTransfer()
    data.setData('text/plain', url)
    input.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
    )
  }, `https://huggingface.co/${MODEL}?library=true#files`)
  await win.waitForSelector('[data-testid^="download-"]', { timeout: 30000 })
  if ((await ui()).selectedModelId !== MODEL) fail('paste did not open the model')
  if ((await ui()).search !== '') fail('pasted URL leaked into the search box')
  log('pasting a Hub URL opens the model')

  await win.keyboard.press('Escape')

  // 2. A typed bare repo id offers a jump without hijacking the search.
  await win.fill('[data-testid="search-input"]', MODEL)
  await win.waitForSelector('[data-testid="omnibox-open"]', { timeout: 5000 })
  await win.click('[data-testid="omnibox-open"]')
  await win.waitForSelector('[data-testid^="download-"]', { timeout: 30000 })
  log('typed owner/model offers a direct jump')
  await win.keyboard.press('Escape')

  // 3. Ordinary search words must not look like a reference.
  await win.fill('[data-testid="search-input"]', 'small instruct gguf')
  await win.waitForTimeout(400)
  if (await win.locator('[data-testid="omnibox-open"]').count()) {
    fail('a plain search phrase was treated as a model reference')
  }
  await win.fill('[data-testid="search-input"]', '')
  log('plain search phrases still search')

  // 4. Dropping a non-model link is rejected — and must not navigate the window.
  const drop = (text, mime = 'text/uri-list') =>
    win.evaluate(
      ({ text, mime }) => {
        const data = new DataTransfer()
        data.setData(mime, text)
        document.dispatchEvent(
          new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true })
        )
      },
      { text, mime }
    )

  await drop('https://huggingface.co/datasets/open-r1/codeforces')
  await win.waitForTimeout(300)
  if ((await ui()).selectedModelId) fail('a dataset link opened a model')
  if (!(await win.locator('[data-testid="search-input"]').count())) {
    fail('the app navigated away on drop')
  }
  log('dropping a dataset link is rejected, app intact')

  await drop(`# comment\r\nhttps://hf.co/${MODEL}`)
  await win.waitForSelector('[data-testid^="download-"]', { timeout: 30000 })
  if ((await ui()).selectedModelId !== MODEL) fail('dropping a model link did not open it')
  log('dropping a model link opens it')
  await win.keyboard.press('Escape')

  // 5. A repo that does not exist must surface an error, not an endless skeleton.
  //    The Hub answers 401 for unknown names, so the panel reports "missing".
  await win.evaluate(() => window.__hfguiTest.openModel('hfgui-nope/does-not-exist'))
  const errorPanel = win.locator('[data-testid="sheet-error"]')
  await errorPanel.waitFor({ timeout: 20000 })
  if ((await errorPanel.getAttribute('data-error-code')) !== 'missing') {
    fail('missing repo did not report an unreachable-repo error')
  }
  log('a missing repo shows an error instead of hanging')
  await win.keyboard.press('Escape')

  // 6. The clipboard chip appears on focus and stays dismissed.
  await app.evaluate(({ clipboard }, url) => clipboard.writeText(url), `https://hf.co/${MODEL}`)
  await win.evaluate(() => window.dispatchEvent(new Event('focus')))
  await win.waitForSelector('[data-testid="clipboard-chip"]', { timeout: 5000 })
  await win.click('[data-testid="clipboard-chip-dismiss"]')
  await win.waitForTimeout(1800)
  await win.evaluate(() => window.dispatchEvent(new Event('focus')))
  await win.waitForTimeout(500)
  if (await win.locator('[data-testid="clipboard-chip"]').count()) {
    fail('the clipboard chip came back after being dismissed')
  }
  log('clipboard chip offers the copied link once')

  // 7. Cards are really draggable in Chromium (a <button> with draggable).
  const card = win.locator('[data-testid="model-grid"] > button').first()
  const box = await card.boundingBox()
  await win.mouse.move(box.x + 30, box.y + 30)
  await win.mouse.down()
  await win.mouse.move(box.x + 160, box.y + 220, { steps: 12 })
  const dragging = await win.evaluate(() => window.__hfguiTest.getDragModel())
  await win.mouse.up()
  await win.evaluate(() => window.__hfguiTest.endDrag())
  if (!dragging) fail('dragging a model card did not start a drag')
  else log(`native drag works (picked up ${dragging.repoId})`)

  // 8. Dropping on a destination starts the recommended quantization.
  await win.evaluate(
    (id) => window.__hfguiTest.dropModel({ repoId: id, name: id.split('/')[1], format: 'gguf' }, 'custom'),
    MODEL
  )
  await win.waitForFunction(() => Object.keys(window.__hfguiTest.getJobs()).length > 0, undefined, {
    timeout: 30000
  })
  const job = await win.evaluate(() => Object.values(window.__hfguiTest.getJobs())[0])
  if (job.destination.kind !== 'custom') fail(`dropped into ${job.destination.kind}`)
  if (!/·\s+\w/.test(job.displayName)) fail(`no quantization named in "${job.displayName}"`)
  log(`drop started "${job.displayName}"`)

  // The dock is the visible confirmation of that job.
  await win.waitForSelector('[data-testid="downloads-dock"]', { timeout: 5000 })
  log('downloads dock is showing the job')

  await win.evaluate((id) => window.hfgui.cancelDownload(id), job.jobId)
  await win.waitForTimeout(500)
} catch (error) {
  fail(error.stack ?? String(error))
} finally {
  await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), savedClipboard).catch(() => {})
  await app.close()
  if (!process.exitCode) console.log('[paste] all checks passed')
}
