import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DownloadJobSnapshot } from '@shared/types'
import { DownloadManager, type ManagerDeps } from './manager'

let userDataDir: string
let base: string

beforeEach(async () => {
  userDataDir = await mkdtemp(join(tmpdir(), 'hfgui-store-'))
  base = await mkdtemp(join(tmpdir(), 'hfgui-models-'))
})

afterEach(async () => {
  await rm(userDataDir, { recursive: true, force: true })
  await rm(base, { recursive: true, force: true })
})

function makeManager(overrides: Partial<ManagerDeps> = {}): DownloadManager {
  return new DownloadManager({
    userDataDir,
    getToken: () => null,
    getMaxConcurrent: () => 0, // queued jobs stay queued: no network in these tests
    getAutoResume: () => false,
    getSpeedLimit: () => null,
    registerInExo: async () => ({ status: 'registered', message: null }),
    checkDiskSpace: async () => ({ freeBytes: 1e9, totalBytes: 1e9 }),
    volumeIdFor: async () => 1,
    missingVolume: () => null,
    ...overrides
  })
}

const exists = (p: string): Promise<boolean> => stat(p).then(() => true, () => false)

/** A multi-file model in `base/org/<name>`: `a` finished, `b` half done. */
async function seedJob(
  name: string,
  overrides: Partial<DownloadJobSnapshot> = {}
): Promise<DownloadJobSnapshot> {
  const jobDir = join(base, 'org', name)
  await mkdir(jobDir, { recursive: true })
  await writeFile(join(jobDir, 'a.safetensors'), 'x'.repeat(10))
  await writeFile(join(jobDir, 'b.safetensors.partial'), 'y'.repeat(5))
  return {
    jobId: `job_${name}`,
    repoId: `org/${name}`,
    revision: 'main',
    displayName: name,
    format: 'mlx',
    destination: { kind: 'custom', baseDir: base },
    jobDir,
    files: [
      { path: 'a.safetensors', size: 10, sha256: null, bytesDone: 10, state: 'done' },
      { path: 'b.safetensors', size: 20, sha256: null, bytesDone: 5, state: 'pending' }
    ],
    state: 'paused',
    bytesDone: 15,
    totalBytes: 30,
    error: null,
    createdAt: 1,
    completedAt: null,
    exoRegistration: null,
    ...overrides
  }
}

async function restore(snaps: DownloadJobSnapshot[], deps: Partial<ManagerDeps> = {}) {
  await writeFile(join(userDataDir, 'downloads.json'), JSON.stringify(snaps))
  const mgr = makeManager(deps)
  await mgr.init()
  return mgr
}

describe('cancel', () => {
  it('deletes everything an unfinished download wrote, and the folders it leaves empty', async () => {
    const snap = await seedJob('m')
    const mgr = await restore([snap])
    await mgr.cancel(snap.jobId)
    expect(await exists(join(snap.jobDir, 'a.safetensors'))).toBe(false)
    expect(await exists(join(snap.jobDir, 'b.safetensors.partial'))).toBe(false)
    expect(await exists(join(base, 'org'))).toBe(false) // pruned…
    expect(await exists(base)).toBe(true) // …but never the destination itself
    const job = mgr.list()[0]
    expect(job.state).toBe('cancelled')
    expect(job.bytesDone).toBe(0)
  })

  it('never deletes a file it did not write, even in its own folder', async () => {
    const snap = await seedJob('m')
    const foreign = join(snap.jobDir, 'notes.partial')
    await writeFile(foreign, 'someone else')
    const mgr = await restore([snap])
    await mgr.cancel(snap.jobId)
    expect(await exists(foreign)).toBe(true)
  })
})

describe('deleteDownload', () => {
  it('deletes a finished model but keeps files another download in the list uses', async () => {
    const done = await seedJob('m', {
      jobId: 'job_done',
      state: 'completed',
      completedAt: 2,
      files: [{ path: 'a.safetensors', size: 10, sha256: null, bytesDone: 10, state: 'done' }]
    })
    const other = { ...done, jobId: 'job_other', createdAt: 3 } // same file, still listed
    const mgr = await restore([done, other])
    const result = await mgr.deleteDownload('job_done')
    expect(result).toEqual({ ok: true, freedBytes: 0, keptShared: 1 })
    expect(await exists(join(done.jobDir, 'a.safetensors'))).toBe(true)
    expect(mgr.list().map((j) => j.jobId)).toEqual(['job_other'])
  })

  it('leaves sibling quantizations in the same folder alone', async () => {
    const q4 = await seedJob('m', {
      jobId: 'job_q4',
      state: 'completed',
      files: [{ path: 'a.safetensors', size: 10, sha256: null, bytesDone: 10, state: 'done' }]
    })
    const sibling = join(q4.jobDir, 'model-Q8_0.gguf')
    await writeFile(sibling, 'q8')
    const mgr = await restore([q4])
    const result = await mgr.deleteDownload('job_q4')
    expect(result).toMatchObject({ ok: true, freedBytes: 10 })
    expect(await exists(sibling)).toBe(true)
  })
})

describe('leftovers', () => {
  it('finds and deletes data of unfinished downloads removed from the list — and nothing else', async () => {
    const snap = await seedJob('m')
    // exo's own downloader writes *.partial files into the same models folder.
    const exoOwn = join(base, 'moonshotai--Kimi', 'model-00001.safetensors.partial')
    await mkdir(join(base, 'moonshotai--Kimi'), { recursive: true })
    await writeFile(exoOwn, 'exo is downloading this')

    const mgr = await restore([snap])
    expect((await mgr.storageReport()).held[snap.jobId]).toBe(15)

    mgr.remove(snap.jobId) // "remove from list" keeps data — it becomes a leftover
    expect((await mgr.storageReport()).leftovers).toEqual({ files: 2, bytes: 15 })

    expect(await mgr.cleanLeftovers()).toEqual({ files: 2, freedBytes: 15 })
    expect((await mgr.storageReport()).leftovers).toEqual({ files: 0, bytes: 0 })
    expect(await exists(snap.jobDir)).toBe(false)
    expect(await readFile(exoOwn, 'utf8')).toBe('exo is downloading this')
  })

  it('survives a restart: the ledger is saved alongside the list', async () => {
    const snap = await seedJob('m')
    const first = await restore([snap])
    first.remove(snap.jobId)
    await first.shutdown()
    const again = makeManager()
    await again.init()
    expect((await again.storageReport()).leftovers.files).toBe(2)
  })
})

describe('storage report', () => {
  it('flags finished models whose files were deleted or truncated outside hfgui', async () => {
    const done = await seedJob('m', {
      state: 'completed',
      files: [{ path: 'a.safetensors', size: 10, sha256: null, bytesDone: 10, state: 'done' }]
    })
    const mgr = await restore([done])
    expect((await mgr.storageReport()).missing).toEqual([])
    await writeFile(join(done.jobDir, 'a.safetensors'), 'short')
    expect((await mgr.storageReport()).missing).toEqual([done.jobId])
  })
})

describe('resume', () => {
  it('on launch resumes only what quitting interrupted, not what the user paused', async () => {
    const userPaused = await seedJob('mine', { pausedByUser: true })
    const interrupted = await seedJob('quit', { state: 'downloading' })
    const mgr = await restore([userPaused, interrupted], { getAutoResume: () => true })
    const state = Object.fromEntries(mgr.list().map((j) => [j.jobId, j.state]))
    expect(state).toEqual({ job_mine: 'paused', job_quit: 'queued' })
  })

  it('remembers a user pause across restarts and forgets it on resume', async () => {
    const snap = await seedJob('m', { state: 'queued' })
    const mgr = await restore([snap])
    mgr.pause(snap.jobId)
    expect(mgr.list()[0].pausedByUser).toBe(true)
    expect(await mgr.resume(snap.jobId)).toEqual({ ok: true })
    expect(mgr.list()[0].pausedByUser).toBe(false)
  })

  it('checks free space like a fresh start does', async () => {
    const snap = await seedJob('m')
    const mgr = await restore([snap], { checkDiskSpace: async () => ({ freeBytes: 5, totalBytes: 100 }) })
    expect(await mgr.resume(snap.jobId)).toEqual({
      ok: false,
      message: 'Not enough free disk space at the destination'
    })
    expect(mgr.list()[0].state).toBe('paused')
  })

  it('refuses when the drive is not connected, instead of measuring the boot disk', async () => {
    const snap = await seedJob('m')
    const mgr = await restore([snap], { missingVolume: () => 'Models SSD' })
    expect(await mgr.resume(snap.jobId)).toEqual({
      ok: false,
      message: 'The drive “Models SSD” isn’t connected'
    })
  })
})
