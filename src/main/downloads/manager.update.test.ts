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

import { DownloadManager, SMALL_JOB_BYTES, pickJobsToStart } from './manager'

const OLD = '1d4bf0f'.padEnd(40, '0')
const NEW = '3756181'.padEnd(40, '0')
const WEIGHTS = Buffer.alloc(256 * 1024, 7)
const Q8 = Buffer.alloc(64 * 1024, 8)
const Q4_OLD = Buffer.alloc(32 * 1024, 4)
const Q4_NEW = Buffer.alloc(33 * 1024, 5) // re-quantized
const sha256 = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex')
const gitOid = (s: string): string => createHash('sha1').update(`blob ${Buffer.byteLength(s)}\0`).update(s).digest('hex')

// org/model as it is now on the "Hub": a new chat template and README, same weights and config.
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
    const json = (body: unknown): void => void res.end(JSON.stringify(body))
    if (url.pathname === '/api/models/org/model' || url.pathname === '/api/models/org/model-GGUF') {
      return json({ sha: NEW, lastModified: '2026-11-07T10:00:00.000Z' })
    }
    if (url.pathname === `/api/models/org/model/tree/${NEW}`) {
      return json([
        { type: 'file', path: 'model.safetensors', size: WEIGHTS.length, oid: 'ptr', lfs: { oid: sha256(WEIGHTS) } },
        ...Object.entries(NOW).map(([path, text]) => ({ type: 'file', path, size: Buffer.byteLength(text), oid: gitOid(text) }))
      ])
    }
    if (url.pathname === `/api/models/org/model-GGUF/tree/${NEW}`) {
      return json([
        { type: 'file', path: 'm-Q4_K_M.gguf', size: Q4_NEW.length, oid: 'p4', lfs: { oid: sha256(Q4_NEW) } },
        { type: 'file', path: 'm-Q8_0.gguf', size: Q8.length, oid: 'p8', lfs: { oid: sha256(Q8) } }
      ])
    }
    const m = url.pathname.match(new RegExp(`^/resolve/(org/[^/]+)/${NEW}/(.+)$`))
    if (m) {
      fetched.push(m[2])
      const body = m[2] === 'model.safetensors' ? WEIGHTS : m[2] === 'm-Q4_K_M.gguf' ? Q4_NEW : Buffer.from(NOW[m[2]])
      res.writeHead(200, { 'Content-Length': String(body.length) })
      return void res.end(body)
    }
    res.writeHead(404)
    res.end()
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

type Files = Record<string, string | Buffer>

/** A finished download of `repoId` with these files, written into `dir`. */
async function seed(
  dir: string,
  files: Files,
  over: Partial<DownloadJobSnapshot> & { repoId?: string } = {}
): Promise<DownloadJobSnapshot> {
  await mkdir(dir, { recursive: true })
  const list = []
  for (const [path, body] of Object.entries(files)) {
    await writeFile(join(dir, path), body)
    const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body)
    list.push({
      path,
      size: bytes.length,
      sha256: Buffer.isBuffer(body) ? sha256(body) : null,
      bytesDone: bytes.length,
      state: 'done' as const
    })
  }
  const total = list.reduce((s, f) => s + f.size, 0)
  return {
    jobId: `job_${Math.random().toString(36).slice(2, 8)}`,
    repoId: 'org/model',
    revision: OLD,
    displayName: 'model',
    format: 'other',
    destination: { kind: 'custom', baseDir: base },
    jobDir: dir,
    files: list,
    state: 'completed',
    bytesDone: total,
    totalBytes: total,
    error: null,
    createdAt: 1,
    completedAt: 2,
    exoRegistration: null,
    ...over
  }
}

const modelFiles = (text: Record<string, string>): Files => ({ 'model.safetensors': WEIGHTS, ...text })

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

const done = (mgr: DownloadManager) => () => mgr.list().some((j) => j.update && j.update.pendingMove === null)
const text = (p: string): Promise<string> => readFile(p, 'utf8')
const exists = (p: string): Promise<boolean> => stat(p).then(() => true, () => false)

describe('updates', () => {
  it('finds what changed upstream, file by file', async () => {
    const old = await seed(join(base, 'org', 'model'), modelFiles(BEFORE))
    const mgr = await start([old])
    expect((await mgr.checkUpdates())[old.jobId]).toMatchObject({
      status: 'available',
      revision: NEW,
      changed: ['chat_template.jinja'],
      fetchBytes: Buffer.byteLength(NOW['chat_template.jinja']) + Buffer.byteLength(NOW['README.md'])
    })
    await mgr.shutdown()
  })

  it('keeps both: fetches only what changed, moves in, and keeps the old version beside it', async () => {
    const canonical = join(base, 'org', 'model')
    const old = await seed(canonical, modelFiles(BEFORE))
    const mgr = await start([old])
    expect(await mgr.update(old.jobId, { keepOld: true })).toEqual({ ok: true })
    await until(done(mgr))

    expect(fetched.sort()).toEqual(['README.md', 'chat_template.jinja'])
    const aside = join(base, 'org', 'model@1d4bf0f')
    expect(await text(join(canonical, 'chat_template.jinja'))).toBe(NOW['chat_template.jinja'])
    expect(await text(join(aside, 'chat_template.jinja'))).toBe(BEFORE['chat_template.jinja'])
    expect(await readFile(join(canonical, 'model.safetensors'))).toEqual(WEIGHTS)
    expect(await readFile(join(aside, 'model.safetensors'))).toEqual(WEIGHTS)
    expect(await exists(join(base, 'org', 'model@3756181'))).toBe(false) // the staging folder is gone

    const jobs = mgr.list()
    const fresh = jobs.find((j) => j.revision === NEW)!
    expect(fresh).toMatchObject({ state: 'completed', jobDir: canonical, update: { of: old.jobId, pendingMove: null } })
    expect(jobs.find((j) => j.jobId === old.jobId)).toMatchObject({ jobDir: aside, supersededBy: fresh.jobId })
    const updates = await mgr.checkUpdates()
    expect(updates[fresh.jobId]).toMatchObject({ status: 'current' })
    expect(updates[old.jobId]).toBeUndefined()

    // Deleting the old version leaves the new one whole.
    await mgr.deleteDownload(old.jobId)
    expect(await exists(aside)).toBe(false)
    expect(await readFile(join(canonical, 'model.safetensors'))).toEqual(WEIGHTS)
    await mgr.shutdown()
  })

  it('replaces: the new version takes the folder and the old one is gone', async () => {
    const canonical = join(base, 'org', 'model')
    const old = await seed(canonical, modelFiles(BEFORE))
    const mgr = await start([old])
    expect(await mgr.update(old.jobId, { keepOld: false })).toEqual({ ok: true })
    await until(done(mgr))

    expect(await text(join(canonical, 'chat_template.jinja'))).toBe(NOW['chat_template.jinja'])
    expect(await readFile(join(canonical, 'model.safetensors'))).toEqual(WEIGHTS)
    expect(await exists(join(base, 'org', 'model@1d4bf0f'))).toBe(false)
    expect(mgr.list().map((j) => j.revision)).toEqual([NEW])
    await mgr.shutdown()
  })

  it('updates one GGUF size without touching another in the same folder', async () => {
    const folder = join(base, 'org', 'model-GGUF')
    const q4 = await seed(folder, { 'm-Q4_K_M.gguf': Q4_OLD }, { repoId: 'org/model-GGUF', format: 'gguf', createdAt: 1 })
    const q8 = await seed(folder, { 'm-Q8_0.gguf': Q8 }, { repoId: 'org/model-GGUF', format: 'gguf', createdAt: 2 })
    const mgr = await start([q4, q8])
    expect(await mgr.update(q4.jobId, { keepOld: true })).toEqual({ ok: true })
    await until(done(mgr))

    expect(fetched).toEqual(['m-Q4_K_M.gguf'])
    expect(await readFile(join(folder, 'm-Q4_K_M.gguf'))).toEqual(Q4_NEW)
    expect(await readFile(join(folder, 'm-Q8_0.gguf'))).toEqual(Q8) // untouched, still where its record says
    expect(await readFile(join(folder + '@1d4bf0f', 'm-Q4_K_M.gguf'))).toEqual(Q4_OLD)
    expect(await exists(join(folder + '@1d4bf0f', 'm-Q8_0.gguf'))).toBe(false)
    expect((await mgr.storageReport()).missing).toEqual([])
    await mgr.shutdown()
  })

  it('starts one update however fast the button is clicked', async () => {
    const old = await seed(join(base, 'org', 'model'), modelFiles(BEFORE))
    const mgr = await start([old])
    const results = await Promise.all([1, 2, 3, 4].map(() => mgr.update(old.jobId, { keepOld: true })))
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    await until(done(mgr))
    expect(mgr.list().filter((j) => j.update)).toHaveLength(1)
    await mgr.shutdown()
  })

  it('drops duplicate updates left by earlier versions, keeping the first', async () => {
    const canonical = join(base, 'org', 'model')
    const old = await seed(canonical, modelFiles(BEFORE))
    const pending = (n: number) => ({
      jobId: `job_dupe_${n}`,
      revision: NEW,
      state: 'queued' as const,
      createdAt: 10 + n,
      completedAt: null,
      update: { of: old.jobId, fromRevision: OLD, pendingMove: canonical }
    })
    const dupes = await Promise.all(
      [1, 2, 3].map(async (n) => seed(`${canonical}@3756181${n > 1 ? `-${n}` : ''}`, modelFiles(NOW), pending(n)))
    )
    const mgr = await start([old, ...dupes])
    const updates = mgr.list().filter((j) => j.update)
    expect(updates.map((j) => j.jobId)).toEqual(['job_dupe_1'])
    expect(await exists(`${canonical}@3756181-2`)).toBe(false)
    expect(await exists(`${canonical}@3756181-3`)).toBe(false)
    // Restored as paused (auto-resume is off here); the one left finishes once resumed.
    await mgr.resume('job_dupe_1')
    await until(done(mgr))
    expect(await text(join(canonical, 'chat_template.jinja'))).toBe(NOW['chat_template.jinja'])
    await mgr.shutdown()
  })

  it('finishes moving in after a stop part-way through', async () => {
    // Stopped mid-way through moving the old files aside: one already moved.
    const canonical = join(base, 'org', 'model')
    const aside = `${canonical}@1d4bf0f`
    const staging = `${canonical}@3756181`
    const old = await seed(canonical, modelFiles(BEFORE))
    await mkdir(aside, { recursive: true })
    await writeFile(join(aside, 'README.md'), BEFORE['README.md'])
    await rm(join(canonical, 'README.md'))
    const fresh = await seed(staging, modelFiles(NOW), {
      jobId: 'job_new',
      revision: NEW,
      update: { of: old.jobId, fromRevision: OLD, pendingMove: canonical, keepOld: true, aside, stage: 'aside' }
    })

    const mgr = await start([old, fresh])
    const jobs = mgr.list()
    expect(jobs.find((j) => j.jobId === 'job_new')).toMatchObject({ jobDir: canonical, update: { pendingMove: null } })
    expect(jobs.find((j) => j.jobId === old.jobId)).toMatchObject({ jobDir: aside, supersededBy: 'job_new' })
    for (const [path, body] of Object.entries(NOW)) expect(await text(join(canonical, path))).toBe(body)
    for (const [path, body] of Object.entries(BEFORE)) expect(await text(join(aside, path))).toBe(body)
    expect(await exists(staging)).toBe(false)
    await mgr.shutdown()
  })
})

describe('pickJobsToStart', () => {
  const job = (state: string, left: number, createdAt: number) => ({
    state: state as 'queued',
    isActive: state === 'downloading',
    totalBytes: left,
    bytesDone: 0,
    createdAt
  })
  const BIG = 50e9

  it('lets small jobs past a full queue, and keeps big ones to the limit', () => {
    const running = [job('downloading', BIG, 1), job('downloading', BIG, 2)]
    const tiny = job('queued', 80 * 1024, 3)
    const big = job('queued', BIG, 4)
    expect(pickJobsToStart([...running, big, tiny], 2)).toEqual([tiny])
    expect(pickJobsToStart([running[0], big, tiny], 2)).toEqual([tiny, big]) // oldest first
    expect(pickJobsToStart([job('queued', SMALL_JOB_BYTES + 1, 1), job('queued', BIG, 2)], 1)).toHaveLength(1)
    expect(pickJobsToStart([tiny], 0)).toEqual([])
  })
})
