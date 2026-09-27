import { createHash } from 'crypto'
import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'
import { mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { BandwidthLimiter } from './bandwidth'
import { downloadFile } from './fileDownloader'
import { DownloadError, isAbortError } from './resolve'

const CONTENT = Buffer.from('hfgui integrity test payload | '.repeat(512))
const SHA256 = createHash('sha256').update(CONTENT).digest('hex')

let server: Server
let url: string
let ignoreRange = false
let dir: string

beforeAll(async () => {
  server = createServer((req, res) => {
    const m = ignoreRange ? null : /bytes=(\d+)-/.exec(req.headers.range ?? '')
    if (m) {
      const start = parseInt(m[1], 10)
      res.writeHead(206, { 'Content-Length': String(CONTENT.length - start) })
      res.end(CONTENT.subarray(start))
    } else {
      res.writeHead(200, { 'Content-Length': String(CONTENT.length) })
      res.end(CONTENT)
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/file.bin`
})

afterAll(() => {
  server.close()
})

beforeEach(async () => {
  ignoreRange = false
  dir = await mkdtemp(join(tmpdir(), 'hfgui-dl-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function run(destPath: string, sha256: string | null): Promise<void> {
  return downloadFile({
    url,
    destPath,
    expectedSize: CONTENT.length,
    sha256,
    token: null,
    signal: new AbortController().signal,
    onProgress: () => {}
  })
}

describe('downloadFile', () => {
  it('downloads fresh and passes checksum verification', async () => {
    const dest = join(dir, 'model.gguf')
    await run(dest, SHA256)
    expect(await readFile(dest)).toEqual(CONTENT)
  })

  it('throws checksum-mismatch and deletes the partial on a wrong hash', async () => {
    const dest = join(dir, 'model.gguf')
    const err = await run(dest, '0'.repeat(64)).catch((e) => e)
    expect(err).toBeInstanceOf(DownloadError)
    expect(err.code).toBe('checksum-mismatch')
    expect(err.retryable).toBe(true)
    await expect(stat(`${dest}.partial`)).rejects.toThrow()
    await expect(stat(dest)).rejects.toThrow()
  })

  it('resumes from a partial and still verifies the full-file hash', async () => {
    const dest = join(dir, 'model.gguf')
    await writeFile(`${dest}.partial`, CONTENT.subarray(0, 1000))
    await run(dest, SHA256)
    expect(await readFile(dest)).toEqual(CONTENT)
  })

  it('verifies correctly when the server ignores Range and restarts from zero', async () => {
    ignoreRange = true
    const dest = join(dir, 'model.gguf')
    await writeFile(`${dest}.partial`, CONTENT.subarray(0, 1000))
    await run(dest, SHA256)
    expect(await readFile(dest)).toEqual(CONTENT)
  })

  it('skips hashing when no sha256 is known (size-only)', async () => {
    const dest = join(dir, 'model.gguf')
    await run(dest, null)
    expect((await stat(dest)).size).toBe(CONTENT.length)
  })

  it('rejects a corrupted resume where sizes match but content differs', async () => {
    const dest = join(dir, 'model.gguf')
    const corrupt = Buffer.from(CONTENT.subarray(0, 1000))
    corrupt.fill(0xff, 0, 100)
    await writeFile(`${dest}.partial`, corrupt)
    const err = await run(dest, SHA256).catch((e) => e)
    expect(err).toBeInstanceOf(DownloadError)
    expect(err.code).toBe('checksum-mismatch')
    // partial removed so the retry restarts clean
    await expect(stat(`${dest}.partial`)).rejects.toThrow()
  })
})

describe('downloadFile under a speed cap', () => {
  function capped(bytesPerSec: number, destPath: string, signal: AbortSignal): Promise<void> {
    const limiter = new BandwidthLimiter({ burstMs: 0 })
    limiter.setLimit(bytesPerSec)
    return downloadFile({
      url,
      destPath,
      expectedSize: CONTENT.length,
      sha256: SHA256,
      token: null,
      signal,
      onProgress: () => {},
      throttle: (bytes, s) => limiter.acquire(bytes, s)
    })
  }

  it('takes as long as the cap dictates and still verifies the hash', async () => {
    const dest = join(dir, 'model.gguf')
    const started = Date.now()
    // ~15.5 KB at 8 KiB/s ≈ 1.9 s.
    await capped(8 * 1024, dest, new AbortController().signal)
    expect(Date.now() - started).toBeGreaterThan(1500)
    expect(await readFile(dest)).toEqual(CONTENT)
  })

  it('pauses promptly while a chunk is being held back', async () => {
    const dest = join(dir, 'model.gguf')
    const controller = new AbortController()
    // At 1 KiB/s the whole file would take ~15 s.
    const run = capped(1024, dest, controller.signal)
    setTimeout(() => controller.abort(), 150)
    const started = Date.now()
    const err = await run.catch((e) => e)
    expect(isAbortError(err)).toBe(true)
    expect(Date.now() - started).toBeLessThan(1000)
    await expect(stat(dest)).rejects.toThrow()
  })
})
