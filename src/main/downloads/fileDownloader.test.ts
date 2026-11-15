import { createHash } from 'crypto'
import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'
import { mkdtemp, open, readFile, rm, stat, writeFile } from 'fs/promises'
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

  it('creates an empty file without touching the network', async () => {
    const dest = join(dir, 'pkg', '__init__.py')
    await downloadFile({
      url: 'http://127.0.0.1:9/never-fetched',
      destPath: dest,
      expectedSize: 0,
      sha256: null,
      token: null,
      signal: new AbortController().signal,
      onProgress: () => {}
    })
    expect((await stat(dest)).size).toBe(0)
  })

  it('reports bytes found on disk separately from network bytes', async () => {
    const dest = join(dir, 'model.gguf')
    await writeFile(dest, CONTENT)
    const fromDisk: number[] = []
    await downloadFile({
      url,
      destPath: dest,
      expectedSize: CONTENT.length,
      sha256: null,
      token: null,
      signal: new AbortController().signal,
      onProgress: () => {},
      onDiskBytes: (n) => fromDisk.push(n)
    })
    expect(fromDisk).toEqual([CONTENT.length])
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

  it('hashes a fresh download as it streams, and checks a resumed one from disk once complete', async () => {
    const dest = join(dir, 'model.gguf')
    const checks: Array<[number, number]> = []
    const opts = {
      url,
      destPath: dest,
      expectedSize: CONTENT.length,
      sha256: SHA256,
      token: null,
      onProgress: () => {},
      onVerify: (done: number, total: number) => checks.push([done, total])
    }
    await downloadFile({ ...opts, signal: new AbortController().signal })
    expect(checks).toEqual([])

    await rm(dest)
    await writeFile(`${dest}.partial`, CONTENT.subarray(0, 1000))
    await downloadFile({ ...opts, signal: new AbortController().signal })
    expect(checks.at(-1)).toEqual([CONTENT.length, CONTENT.length])
    expect(await readFile(dest)).toEqual(CONTENT)
  })

  it('checks a complete partial that was never moved into place, without the network', async () => {
    const dest = join(dir, 'model.gguf')
    await writeFile(`${dest}.partial`, CONTENT)
    const checks: number[] = []
    await downloadFile({
      url: 'http://127.0.0.1:9/never-fetched',
      destPath: dest,
      expectedSize: CONTENT.length,
      sha256: SHA256,
      token: null,
      signal: new AbortController().signal,
      onProgress: () => {},
      onVerify: (done) => checks.push(done)
    })
    expect(checks.at(-1)).toBe(CONTENT.length)
    expect(await readFile(dest)).toEqual(CONTENT)
  })
})

describe('downloadFile resuming a large partial', () => {
  // Like Hugging Face's CDN, this server drops a connection whose reader stops
  // reading. hfgui used to hash the partial before reading the response: on a
  // 39 GB partial that left it unread for minutes, and every retry re-hashed it
  // all to move a few MB.
  const PREFIX = 1024 * 1024 * 1024 // already on disk (sparse zeros)
  const REST = 32 * 1024 * 1024 // more than socket buffers hold
  const IDLE_MS = 100
  const rest = Buffer.alloc(REST, 0x5a)
  let strict: Server
  let strictUrl: string
  let requests = 0

  beforeAll(async () => {
    strict = createServer((req, res) => {
      requests++
      const start = Number(/bytes=(\d+)-/.exec(req.headers.range ?? '')?.[1] ?? 0)
      const body = rest.subarray(Math.max(0, start - PREFIX))
      res.writeHead(206, { 'Content-Length': String(body.length) })
      req.socket.setTimeout(IDLE_MS, () => req.socket.destroy())
      let off = 0
      const pump = (): void => {
        while (off < body.length) {
          const chunk = body.subarray(off, off + 1024 * 1024)
          off += chunk.length
          if (!res.write(chunk)) return void res.once('drain', pump)
        }
        res.end()
      }
      pump()
    })
    await new Promise<void>((resolve) => strict.listen(0, '127.0.0.1', resolve))
    strictUrl = `http://127.0.0.1:${(strict.address() as AddressInfo).port}/big.bin`
  })

  afterAll(() => {
    strict.close()
  })

  it('reads the response at once, then checks the whole file', async () => {
    const dest = join(dir, 'big.safetensors')
    const partial = await open(`${dest}.partial`, 'w')
    await partial.truncate(PREFIX)
    await partial.close()
    const hash = createHash('sha256')
    const zeros = Buffer.alloc(16 * 1024 * 1024)
    for (let n = 0; n < PREFIX; n += zeros.length) hash.update(zeros)
    const sha256 = hash.update(rest).digest('hex')

    const checked: number[] = []
    await downloadFile({
      url: strictUrl,
      destPath: dest,
      expectedSize: PREFIX + REST,
      sha256,
      token: null,
      signal: new AbortController().signal,
      onProgress: () => {},
      onVerify: (done) => checked.push(done)
    })
    expect(requests).toBe(1)
    expect((await stat(dest)).size).toBe(PREFIX + REST)
    expect(checked.at(-1)).toBe(PREFIX + REST)
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
