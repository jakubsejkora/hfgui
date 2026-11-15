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
