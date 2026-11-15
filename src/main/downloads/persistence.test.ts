import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DownloadJobSnapshot } from '@shared/types'
import { Persistence, restoreSnapshot } from './persistence'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hfgui-persist-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function snapshot(overrides: Partial<DownloadJobSnapshot> = {}): DownloadJobSnapshot {
  return {
    jobId: 'job_1',
    repoId: 'org/model',
    revision: 'abc',
    displayName: 'model · Q4_K_M',
    format: 'gguf',
    destination: { kind: 'custom', baseDir: '/tmp/models' },
    jobDir: '/tmp/models/org/model',
    files: [{ path: 'm.gguf', size: 10, sha256: null, bytesDone: 4, state: 'pending' }],
    state: 'paused',
    bytesDone: 4,
    totalBytes: 10,
    error: null,
    createdAt: 1,
    completedAt: null,
    exoRegistration: null,
    ...overrides
  }
}

describe('restoreSnapshot', () => {
  it('keeps a well-formed snapshot intact', () => {
    const snap = snapshot()
    expect(restoreSnapshot(snap)).toEqual(snap)
  })

  it('rejects entries that would crash the manager on launch', () => {
    expect(restoreSnapshot(null)).toBeNull()
    expect(restoreSnapshot({ ...snapshot(), files: null })).toBeNull()
    expect(restoreSnapshot({ ...snapshot(), files: [null] })).toBeNull()
    expect(restoreSnapshot({ ...snapshot(), state: 'exploded' })).toBeNull()
    expect(restoreSnapshot({ ...snapshot(), destination: { kind: 'ftp', baseDir: '/x' } })).toBeNull()
  })

  it('fills optional fields an older version may not have written', () => {
    const { exoRegistration: _e, completedAt: _c, ...old } = snapshot()
    const restored = restoreSnapshot(old)
    expect(restored?.exoRegistration).toBeNull()
    expect(restored?.completedAt).toBeNull()
  })
})

describe('Persistence', () => {
  it('loads only the usable entries of a damaged file', async () => {
    const file = join(dir, 'downloads.json')
    await writeFile(file, JSON.stringify([snapshot(), null, { jobId: 'x' }]))
    const loaded = await new Persistence(file).load()
    expect(loaded.map((s) => s.jobId)).toEqual(['job_1'])
  })

  it('keeps saving after a write fails', async () => {
    // A directory where the file should be makes the rename fail.
    const file = join(dir, 'downloads.json')
    await mkdir(file)
    const p = new Persistence(file)
    p.bind(() => [snapshot()])
    await expect(p.flush()).rejects.toThrow()

    // The obstacle goes away (space freed, say): the next save must land.
    await rm(file, { recursive: true })
    await p.flush()
    expect(JSON.parse(await readFile(file, 'utf8'))).toHaveLength(1)
  })
})
