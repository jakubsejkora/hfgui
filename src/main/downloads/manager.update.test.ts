import { createHash } from 'crypto'
import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DownloadJobSnapshot } from '@shared/types'

// File downloads go to the local server too.
const server = vi.hoisted(() => ({ baseUrl: '' }))
vi.mock('./resolve', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./resolve')>()
  return {
    ...actual,
    resolveUrl: (repoId: string, revision: string, path: string) => `${server.baseUrl}/resolve/${repoId}/${revision}/${path}`
  }
})

import { DownloadManager } from './manager'

const OLD = '1d4bf0f'.padEnd(40, '0')
const NEW = '3756181'.padEnd(40, '0')
const WEIGHTS = Buffer.alloc(256 * 1024, 7)
const sha256 = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex')
const gitOid = (s: string): string => createHash('sha1').update(`blob ${Buffer.byteLength(s)}\0`).update(s).digest('hex')

// The repo as it is now on the "Hub": a new chat template and README, same weights and config.
const NOW: Record<string, string> = {
  'chat_template.jinja': '{{ new template }}',
  'config.json': '{"layers": 4}',
  'README.md': '# Model, now with a better template'
}
const BEFORE: Record<string, string> = { ...NOW, 'chat_template.jinja': '{{ old }}', 'README.md': '# Model' }

let http: Server
const fetched: string[] = []
let userDataDir: string
let base: string

beforeAll(async () => {
  http = createServer((req, res) => {
    const url = new URL(req.url!, 'http://x')
    if (url.pathname === '/api/models/org/model') {
      res.end(JSON.stringify({ sha: NEW, lastModified: '2026-11-07T10:00:00.000Z' }))
    } else if (url.pathname === `/api/models/org/model/tree/${NEW}`) {
      res.end(
        JSON.stringify([
          { type: 'file', path: 'model.safetensors', size: WEIGHTS.length, oid: 'ptr', lfs: { oid: sha256(WEIGHTS) } },
          ...Object.entries(NOW).map(([path, text]) => ({ type: 'file', path, size: Buffer.byteLength(text), oid: gitOid(text) }))
        ])
      )
    } else if (url.pathname.startsWith(`/resolve/org/model/${NEW}/`)) {
      const path = url.pathname.slice(`/resolve/org/model/${NEW}/`.length)
      fetched.push(path)
      const body = path === 'model.safetensors' ? WEIGHTS : Buffer.from(NOW[path])
      res.writeHead(200, { 'Content-Length': String(body.length) })
      res.end(body)
    } else {
      res.writeHead(404)
      res.end()
    }
  })
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
  server.baseUrl = `http://127.0.0.1:${(http.address() as AddressInfo).port}`
})

afterAll(() => {
  http.close()
})

beforeEach(async () => {
  fetched.length = 0
  userDataDir = await mkdtemp(join(tmpdir(), 'hfgui-upd-data-'))
  base = await mkdtemp(join(tmpdir(), 'hfgui-upd-models-'))
})

afterEach(async () => {
  await rm(userDataDir, { recursive: true, force: true })
  await rm(base, { recursive: true, force: true })
})

/** The model as downloaded before the update, in base/org/model. */
async function seedDownloaded(dir = join(base, 'org', 'model'), revision = OLD, files = BEFORE): Promise<DownloadJobSnapshot> {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'model.safetensors'), WEIGHTS)
  for (const [path, text] of Object.entries(files)) await writeFile(join(dir, path), text)
  const list = [
    { path: 'model.safetensors', size: WEIGHTS.length, sha256: sha256(WEIGHTS), bytesDone: WEIGHTS.length, state: 'done' as const },
    ...Object.entries(files).map(([path, text]) => ({
      path,
      size: Buffer.byteLength(text),
      sha256: null,
      bytesDone: Buffer.byteLength(text),
      state: 'done' as const
    }))
  ]
  return {
    jobId: `job_${revision.slice(0, 7)}`,
    repoId: 'org/model',
    revision,
    displayName: 'model',
    format: 'other',
    destination: { kind: 'custom', baseDir: base },
    jobDir: dir,
    files: list,
    state: 'completed',
    bytesDone: list.reduce((s, f) => s + f.size, 0),
    totalBytes: list.reduce((s, f) => s + f.size, 0),
    error: null,
    createdAt: 1,
    completedAt: 2,
    exoRegistration: null
  }
}

async function start(snaps: DownloadJobSnapshot[]): Promise<DownloadManager> {
  await writeFile(join(userDataDir, 'downloads.json'), JSON.stringify(snaps))
  const mgr = new DownloadManager({
    userDataDir,
    getToken: () => null,
    getMaxConcurrent: () => 2,
    getAutoResume: () => false,
    getSpeedLimit: () => null,
    registerInExo: async () => ({ status: 'registered', message: null }),
    checkDiskSpace: async () => ({ freeBytes: 1e12, totalBytes: 1e12 }),
    volumeIdFor: async () => 1,
    missingVolume: () => null,
    hub: server.baseUrl
  })
  await mgr.init()
  return mgr
}

async function until(check: () => boolean, ms = 5000): Promise<void> {
  const t0 = Date.now()
  while (!check()) {
    if (Date.now() - t0 > ms) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 10))
  }
}

const text = (p: string): Promise<string> => readFile(p, 'utf8')
const exists = (p: string): Promise<boolean> => stat(p).then(() => true, () => false)

describe('updates', () => {
  it('finds what changed upstream, file by file', async () => {
    const mgr = await start([await seedDownloaded()])
    const updates = await mgr.checkUpdates()
    expect(updates[`job_1d4bf0f`]).toMatchObject({
      status: 'available',
      revision: NEW,
      changed: ['chat_template.jinja'],
      fetchBytes: Buffer.byteLength(NOW['chat_template.jinja']) + Buffer.byteLength(NOW['README.md'])
    })
    await mgr.shutdown()
  })

  it('downloads only what changed, takes over the folder, and keeps the old version beside it', async () => {
    const mgr = await start([await seedDownloaded()])
    expect(await mgr.update('job_1d4bf0f')).toEqual({ ok: true })
    await until(() => mgr.list().some((j) => j.update && j.update.pendingMove === null))

    // Only the two changed files crossed the network; weights and config were shared.
    expect(fetched.sort()).toEqual(['README.md', 'chat_template.jinja'])
    const canonical = join(base, 'org', 'model')
    const aside = join(base, 'org', 'model@1d4bf0f')
    expect(await text(join(canonical, 'chat_template.jinja'))).toBe(NOW['chat_template.jinja'])
    expect(await text(join(aside, 'chat_template.jinja'))).toBe(BEFORE['chat_template.jinja'])
    expect(await readFile(join(canonical, 'model.safetensors'))).toEqual(WEIGHTS)
    expect(await readFile(join(aside, 'model.safetensors'))).toEqual(WEIGHTS)

    const jobs = mgr.list()
    const fresh = jobs.find((j) => j.revision === NEW)!
    const old = jobs.find((j) => j.revision === OLD)!
    expect(fresh).toMatchObject({ state: 'completed', jobDir: canonical, update: { of: old.jobId, pendingMove: null } })
    expect(old).toMatchObject({ state: 'completed', jobDir: aside, supersededBy: fresh.jobId })
    // The old version is no longer offered an update; the new one is current.
    const updates = await mgr.checkUpdates()
    expect(updates[fresh.jobId]).toMatchObject({ status: 'current' })
    expect(updates[old.jobId]).toBeUndefined()

    // Deleting the old version leaves the new one whole.
    await mgr.deleteDownload(old.jobId)
    expect(await exists(aside)).toBe(false)
    expect(await readFile(join(canonical, 'model.safetensors'))).toEqual(WEIGHTS)
    await mgr.shutdown()
  })

  it('finishes a folder swap that a stop interrupted halfway', async () => {
    // State after the first rename (old version moved aside) but before the
    // second, with the old record not yet saved: it still names the folder.
    const aside = join(base, 'org', 'model@1d4bf0f')
    const staging = join(base, 'org', 'model@3756181')
    const old = await seedDownloaded(aside)
    old.jobDir = join(base, 'org', 'model')
    const fresh = await seedDownloaded(staging, NEW, NOW)
    fresh.jobId = 'job_new'
    fresh.update = { of: old.jobId, fromRevision: OLD, pendingMove: join(base, 'org', 'model') }

    const mgr = await start([old, fresh])
    const jobs = mgr.list()
    expect(jobs.find((j) => j.jobId === 'job_new')).toMatchObject({ jobDir: join(base, 'org', 'model') })
    expect(jobs.find((j) => j.jobId === old.jobId)).toMatchObject({ jobDir: aside, supersededBy: 'job_new' })
    expect(await text(join(base, 'org', 'model', 'chat_template.jinja'))).toBe(NOW['chat_template.jinja'])
    await mgr.shutdown()
  })
})
