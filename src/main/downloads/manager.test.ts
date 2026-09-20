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
