import { describe, expect, it } from 'vitest'
import type { DownloadEvent, DownloadJobSnapshot, JobState } from '@shared/types'
import { createNotifier, type DownloadNotice } from './notifications'

function snap(state: JobState, overrides: Partial<DownloadJobSnapshot> = {}): DownloadJobSnapshot {
  return {
    jobId: 'job_1',
    repoId: 'org/model',
    revision: 'main',
    displayName: 'model · Q4_K_M',
    format: 'gguf',
    destination: { kind: 'lmstudio', baseDir: '/m' },
    jobDir: '/m/org/model',
    files: [{ path: 'm.gguf', size: 100, bytesDone: 40, state: 'active' }],
    state,
    bytesDone: 40,
    totalBytes: 100,
    error: null,
    createdAt: 1,
    completedAt: null,
    exoRegistration: null,
    ...overrides
  }
}

const stateEvent = (s: DownloadJobSnapshot): DownloadEvent => ({ type: 'state', jobId: s.jobId, snapshot: s })

function harness(opts: { focused?: boolean; enabled?: boolean } = {}, initial: DownloadJobSnapshot[] = []) {
  const notices: DownloadNotice[] = []
  const badges: string[] = []
  const progress: number[] = []
  const notifier = createNotifier(
    {
      enabled: () => opts.enabled ?? true,
      appFocused: () => opts.focused ?? false,
      notify: (n) => notices.push(n),
      setBadge: (t) => badges.push(t),
      setProgress: (f) => progress.push(f)
    },
    initial
  )
  return { notifier, notices, badges, progress }
}

describe('createNotifier', () => {
  it('announces a download that finishes while hfgui is in the background', () => {
    const h = harness()
    h.notifier.handle(stateEvent(snap('downloading')))
    h.notifier.handle(stateEvent(snap('completed')))
    expect(h.notices).toEqual([
      { jobId: 'job_1', title: 'Download finished', body: 'model · Q4_K_M is ready in LM Studio.' }
    ])
  })

  it('explains failures with the shared error copy', () => {
    const h = harness()
    h.notifier.handle(stateEvent(snap('downloading')))
    h.notifier.handle(
      stateEvent(snap('error', { error: { code: 'disk-full', message: 'ENOSPC' } }))
    )
    expect(h.notices[0].body).toBe('model · Q4_K_M — Not enough disk space.')
  })

  it('does not throw on an error code from another build', () => {
    const h = harness()
    h.notifier.handle(stateEvent(snap('downloading')))
    const weird = snap('error', { error: { code: 'held-paused' as never, message: 'Held' } })
    expect(() => h.notifier.handle(stateEvent(weird))).not.toThrow()
    expect(h.notices[0].body).toBe('model · Q4_K_M — Didn’t finish.')
  })

  it('stays silent for re-sent states — exo registration re-emits completed on launch', () => {
    const h = harness({}, [snap('completed')])
    h.notifier.handle(stateEvent(snap('completed', { exoRegistration: { status: 'registered', message: null } })))
    expect(h.notices).toEqual([])
  })

  it('stays silent in the foreground, when switched off, and for jobs it never saw start', () => {
    const focused = harness({ focused: true })
    focused.notifier.handle(stateEvent(snap('downloading')))
    focused.notifier.handle(stateEvent(snap('completed')))
    const off = harness({ enabled: false })
    off.notifier.handle(stateEvent(snap('downloading')))
    off.notifier.handle(stateEvent(snap('completed')))
    const unseen = harness()
    unseen.notifier.handle(stateEvent(snap('completed')))
    expect([...focused.notices, ...off.notices, ...unseen.notices]).toEqual([])
  })

  it('badges the Dock with the number of busy downloads and clears it', () => {
    const h = harness()
    h.notifier.handle(stateEvent(snap('queued')))
    h.notifier.handle(stateEvent(snap('downloading', { jobId: 'job_2' })))
    h.notifier.handle(stateEvent(snap('paused')))
    h.notifier.handle({ type: 'removed', jobId: 'job_2' })
    expect(h.badges).toEqual(['1', '2', '1', ''])
  })

  it('reports combined progress at most once per tick, and clears it when idle', () => {
    const h = harness()
    h.notifier.handle(stateEvent(snap('downloading')))
    h.notifier.handle({ type: 'progress', jobId: 'job_1', bytesDone: 50, totalBytes: 100, bytesPerSec: 1, etaSec: 1, currentFile: null })
    h.notifier.handle({ type: 'progress', jobId: 'job_1', bytesDone: 60, totalBytes: 100, bytesPerSec: 1, etaSec: 1, currentFile: null })
    h.notifier.tick()
    h.notifier.tick()
    h.notifier.handle(stateEvent(snap('completed', { bytesDone: 100 })))
    h.notifier.tick()
    expect(h.progress).toEqual([0.6, -1])
  })
})
