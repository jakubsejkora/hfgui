import { createHash } from 'crypto'
import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'
import { mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { downloadFile } from './fileDownloader'
import { DownloadError } from './resolve'

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
