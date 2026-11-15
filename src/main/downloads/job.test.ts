import { createHash } from 'crypto'
import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DownloadEvent, DownloadRequest } from '@shared/types'

// Point the job at a local server instead of huggingface.co.
const server = vi.hoisted(() => ({ baseUrl: '' }))
vi.mock('./resolve', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./resolve')>()
  return {
    ...actual,
    resolveUrl: (_repoId: string, _revision: string, path: string) => `${server.baseUrl}/${path}`
  }
})

import { DownloadJob, type JobDeps } from './job'

const SLOW_SIZE = 4 * 1024 * 1024

let http: Server
let dir: string

beforeAll(async () => {
  // Streams SLOW_SIZE bytes in small chunks, slowly enough to cancel mid-flight.
  http = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Length': String(SLOW_SIZE) })
    let sent = 0
    const chunk = Buffer.alloc(16 * 1024)
    const timer = setInterval(() => {
      if (sent >= SLOW_SIZE || res.destroyed) {
        clearInterval(timer)
        res.end()
        return
      }
      sent += chunk.length
      res.write(chunk)
    }, 10)
    res.on('close', () => clearInterval(timer))
  })
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
  server.baseUrl = `http://127.0.0.1:${(http.address() as AddressInfo).port}`
})

afterAll(() => {
  http.close()
})

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hfgui-job-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function deps(events: DownloadEvent[]): JobDeps {
  return {
    getToken: () => null,
    emit: (ev) => events.push(ev),
    persist: () => {},
    throttle: () => null,
    track: () => {},
    untrack: () => {}
  }
}

function request(files: DownloadRequest['files']): DownloadRequest {
  return {
    repoId: 'org/model',
    revision: 'main',
    displayName: 'model',
    format: 'mlx',
    files,
    destination: { kind: 'custom', baseDir: dir }
  }
}

async function waitFor(check: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 10))
  }
}

describe('DownloadJob', () => {
  it('does not report files already on disk as network speed', async () => {
    const jobDir = join(dir, 'job')
    await mkdir(jobDir, { recursive: true })
    const body = Buffer.alloc(8 * 1024 * 1024)
    const names = ['a.safetensors', 'b.safetensors', 'c.safetensors']
    for (const name of names) await writeFile(join(jobDir, name), body)

    // On a real disk each skipped file takes a few ms; here the whole job fits
    // in one millisecond, which the sampler's dt > 0 guard would hide. A clock
    // that advances 5 ms per read reproduces the real spacing.
    let clock = Date.now()
    const now = vi.spyOn(Date, 'now').mockImplementation(() => (clock += 5))

    const events: DownloadEvent[] = []
    const job = new DownloadJob(
      request(names.map((path) => ({ path, size: body.length }))),
      jobDir,
      deps(events)
    )
    await job.run()
    now.mockRestore()

    expect(job.state).toBe('completed')
    const speeds = events.flatMap((ev) => (ev.type === 'progress' ? [ev.bytesPerSec] : []))
    expect(speeds.length).toBeGreaterThan(0)
    // Used to read as a multi-GB/s burst with a 0 s ETA.
    expect(Math.max(...speeds)).toBe(0)
  })

  it('downloads an empty file instead of failing the job', async () => {
    const jobDir = join(dir, 'job')
    const job = new DownloadJob(request([{ path: '__init__.py', size: 0 }]), jobDir, deps([]))
    await job.run()
    expect(job.state).toBe('completed')
  })

  it('resolves cancel only once the job has actually stopped', async () => {
    const jobDir = join(dir, 'job')
    const job = new DownloadJob(request([{ path: 'slow.bin', size: SLOW_SIZE }]), jobDir, deps([]))
    const running = job.run()
    await waitFor(() => job.bytesDone > 0)

    await job.cancel(true)
    // Callers chain on this (drag-and-drop "Undo" removes the row next).
    expect(job.state).toBe('cancelled')
    await running
  })
})

describe('DownloadJob retries', () => {
  // 'drop' hands out SLICE bytes from wherever the client asks, then cuts the
  // connection — a flaky link that still makes progress. 'unavailable' is a 503.
  const SLICE = 64 * 1024
  const FILE = Buffer.alloc(8 * SLICE)
  for (let i = 0; i < FILE.length; i++) FILE[i] = (i * 31) & 0xff
  const FILE_SHA = createHash('sha256').update(FILE).digest('hex')
  let flaky: Server
  let flakyBase = ''
  let previousBase = ''
  let mode: 'drop' | 'unavailable' | 'whole' = 'drop'
  let requests = 0

  beforeAll(async () => {
    flaky = createServer((req, res) => {
      requests++
      if (mode === 'unavailable') {
        res.writeHead(503)
        res.end()
        return
      }
      const start = Number(/bytes=(\d+)-/.exec(req.headers.range ?? '')?.[1] ?? 0)
      res.writeHead(start > 0 ? 206 : 200, { 'Content-Length': String(FILE.length - start) })
      if (mode === 'whole' || start + SLICE >= FILE.length) {
        res.end(FILE.subarray(start))
        return
      }
      // Let the client take the slice in before the line goes dead.
      res.write(FILE.subarray(start, start + SLICE), () => setTimeout(() => res.socket?.destroy(), 20))
    })
    await new Promise<void>((resolve) => flaky.listen(0, '127.0.0.1', resolve))
    flakyBase = `http://127.0.0.1:${(flaky.address() as AddressInfo).port}`
  })

  afterAll(() => {
    flaky.close()
  })

  beforeEach(() => {
    previousBase = server.baseUrl
    server.baseUrl = flakyBase
    requests = 0
  })

  afterEach(() => {
    server.baseUrl = previousBase
  })

  const noWait = (events: DownloadEvent[]): JobDeps => ({ ...deps(events), retryDelaysMs: [0, 0, 0, 0, 0] })

  it('keeps going while each dropped connection moved the file forward', async () => {
    mode = 'drop'
    const job = new DownloadJob(
      request([{ path: 'weights.bin', size: FILE.length, sha256: FILE_SHA }]),
      join(dir, 'job'),
      noWait([])
    )
    await job.run()
    // More drops in one file than the five retries a streak allows.
    expect(job.error).toBeNull()
    expect(job.state).toBe('completed')
    expect(requests).toBeGreaterThan(6)
  })

  it('gives up after five failed retries in a row that got nowhere', async () => {
    mode = 'unavailable'
    const job = new DownloadJob(request([{ path: 'weights.bin', size: FILE.length }]), join(dir, 'job'), noWait([]))
    await job.run()
    expect(job.state).toBe('error')
    expect(job.error?.code).toBe('http')
    expect(requests).toBe(6)
  })

  it('does not count a download that failed its checksum as progress', async () => {
    mode = 'whole'
    const job = new DownloadJob(
      request([{ path: 'weights.bin', size: FILE.length, sha256: '0'.repeat(64) }]),
      join(dir, 'job'),
      noWait([])
    )
    await job.run()
    expect(job.error?.code).toBe('checksum-mismatch')
    // Five retries, not fifty full re-downloads.
    expect(requests).toBe(6)
  })
})
