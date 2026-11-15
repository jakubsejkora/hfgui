import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DownloadEvent, DownloadRequest } from '@shared/types'
import { DownloadManager, type ManagerDeps } from './manager'

let userDataDir: string

beforeEach(async () => {
  userDataDir = await mkdtemp(join(tmpdir(), 'hfgui-mgr-'))
})

afterEach(async () => {
  await rm(userDataDir, { recursive: true, force: true })
})

function makeManager(overrides: Partial<ManagerDeps> = {}): DownloadManager {
  return new DownloadManager({
    userDataDir,
    getToken: () => null,
    // 0 slots: queued jobs stay queued, so tests never hit the network.
    getMaxConcurrent: () => 0,
    getAutoResume: () => false,
    getSpeedLimit: () => null,
    registerInExo: async () => ({ status: 'registered', message: null }),
    checkDiskSpace: async () => ({ freeBytes: 100, totalBytes: 1000 }),
    volumeIdFor: async () => 1,
    ...overrides
  })
}

function request(name: string, size: number): DownloadRequest {
  return {
    repoId: `org/${name}`,
    revision: 'main',
    displayName: name,
    format: 'gguf',
    files: [{ path: `${name}.gguf`, size, sha256: null }],
    destination: { kind: 'custom', baseDir: userDataDir }
  }
}

describe('DownloadManager disk preflight', () => {
  it('accepts a job that fits free space', async () => {
    const mgr = makeManager()
    const res = await mgr.start(request('a', 60), join(userDataDir, 'a'))
    expect(res.ok).toBe(true)
  })

  it('rejects a second job whose bytes jointly exceed free space on the same volume', async () => {
    const mgr = makeManager()
    expect((await mgr.start(request('a', 60), join(userDataDir, 'a'))).ok).toBe(true)
    const res = await mgr.start(request('b', 60), join(userDataDir, 'b'))
    expect(res).toEqual({
      ok: false,
      code: 'disk-full',
      message: 'Not enough free disk space at the destination'
    })
  })

  it('accepts concurrent jobs on different volumes', async () => {
    let calls = 0
    const mgr = makeManager({ volumeIdFor: async () => ++calls })
    expect((await mgr.start(request('a', 60), join(userDataDir, 'a'))).ok).toBe(true)
    expect((await mgr.start(request('b', 60), join(userDataDir, 'b'))).ok).toBe(true)
  })

  it('treats unknown volumes as shared (conservative)', async () => {
    const mgr = makeManager({ volumeIdFor: async () => null })
    expect((await mgr.start(request('a', 60), join(userDataDir, 'a'))).ok).toBe(true)
    expect((await mgr.start(request('b', 60), join(userDataDir, 'b'))).ok).toEqual(false)
  })
})

describe('DownloadManager remove', () => {
  it('emits a removed event so the renderer can drop the row', async () => {
    const mgr = makeManager()
    const events: DownloadEvent[] = []
    mgr.onEvent((ev) => events.push(ev))
    const res = await mgr.start(request('a', 10), join(userDataDir, 'a'))
    if (!res.ok) throw new Error('start failed')
    mgr.remove(res.jobId)
    expect(events.some((ev) => ev.type === 'removed' && ev.jobId === res.jobId)).toBe(true)
    expect(mgr.list()).toHaveLength(0)
  })
})

describe('DownloadManager file ownership', () => {
  it('refuses to resume a job whose files another download now owns', async () => {
    const mgr = makeManager({ checkDiskSpace: async () => ({ freeBytes: 1e9, totalBytes: 1e9 }) })
    const dir = join(userDataDir, 'a')
    const first = await mgr.start(request('a', 10), dir)
    if (!first.ok) throw new Error('start failed')
    // The first attempt stops; the user starts the same quant again from the sheet.
    await mgr.cancel(first.jobId)
    expect((await mgr.start(request('a', 10), dir)).ok).toBe(true)

    // Retrying the stopped one would make two jobs append to one .partial.
    expect(mgr.resume(first.jobId)).toEqual({
      ok: false,
      message: 'Another download of these files is already in progress'
    })
    expect(mgr.list().find((j) => j.jobId === first.jobId)?.state).toBe('cancelled')
  })

  it('resumes normally when nothing else owns the files', async () => {
    const mgr = makeManager()
    const res = await mgr.start(request('a', 10), join(userDataDir, 'a'))
    if (!res.ok) throw new Error('start failed')
    await mgr.cancel(res.jobId)
    expect(mgr.resume(res.jobId)).toEqual({ ok: true })
    expect(mgr.list()[0].state).toBe('queued')
  })
})

describe('DownloadManager restore', () => {
  it('opens with the usable jobs when downloads.json is partly damaged', async () => {
    const { writeFile } = await import('fs/promises')
    await writeFile(
      join(userDataDir, 'downloads.json'),
      JSON.stringify([null, { jobId: 'broken', files: null }])
    )
    const mgr = makeManager()
    await expect(mgr.init()).resolves.toBeUndefined()
    expect(mgr.list()).toEqual([])
  })

  it('does not relabel a completed job when cancel arrives late (e.g. Undo)', async () => {
    const { writeFile } = await import('fs/promises')
    const done = {
      jobId: 'job_done',
      repoId: 'org/a',
      revision: 'main',
      displayName: 'a',
      format: 'gguf',
      destination: { kind: 'custom', baseDir: userDataDir },
      jobDir: join(userDataDir, 'a'),
      files: [{ path: 'a.gguf', size: 10, sha256: null, bytesDone: 10, state: 'done' }],
      state: 'completed',
      bytesDone: 10,
      totalBytes: 10,
      error: null,
      createdAt: 1,
      completedAt: 2,
      exoRegistration: null
    }
    await writeFile(join(userDataDir, 'downloads.json'), JSON.stringify([done]))
    const mgr = makeManager()
    await mgr.init()
    await mgr.cancel('job_done')
    expect(mgr.list()[0].state).toBe('completed')
  })
})
