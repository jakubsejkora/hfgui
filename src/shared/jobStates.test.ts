import { describe, expect, it } from 'vitest'
import {
  BUSY_STATES,
  IN_PROGRESS_STATES,
  JOB_STATE_LABEL,
  RUNNING_STATES,
  ERROR_COPY,
  compareJobs,
  errorCopy,
  jobGroup
} from './jobStates'
import type { JobState } from './types'

const ALL: JobState[] = [
  'queued',
  'downloading',
  'verifying',
  'completed',
  'paused',
  'cancelled',
  'error'
]

describe('job state sets', () => {
  it('nest: running ⊂ busy ⊂ in progress', () => {
    for (const s of RUNNING_STATES) expect(BUSY_STATES.has(s)).toBe(true)
    for (const s of BUSY_STATES) expect(IN_PROGRESS_STATES.has(s)).toBe(true)
    expect(BUSY_STATES.has('paused')).toBe(false)
    expect(RUNNING_STATES.has('queued')).toBe(false)
  })

  it('puts every state in exactly one Downloads tab', () => {
    expect(ALL.map(jobGroup)).toEqual([
      'in-progress',
      'in-progress',
      'in-progress',
      'completed',
      'in-progress',
      'failed',
      'failed'
    ])
  })

  it('labels every state, keeping the copy the e2e drivers match on', () => {
    for (const s of ALL) expect(JOB_STATE_LABEL[s]).toBeTruthy()
    expect(JOB_STATE_LABEL.completed).toBe('Completed')
  })
})

describe('compareJobs', () => {
  it('orders running before queued before paused before finished', () => {
    const jobs = [
      { state: 'completed' as const, createdAt: 5 },
      { state: 'paused' as const, createdAt: 4 },
      { state: 'queued' as const, createdAt: 3 },
      { state: 'downloading' as const, createdAt: 1 }
    ]
    expect([...jobs].sort(compareJobs).map((j) => j.state)).toEqual([
      'downloading',
      'queued',
      'paused',
      'completed'
    ])
  })

  it('breaks ties newest first', () => {
    const a = { state: 'downloading' as const, createdAt: 1 }
    const b = { state: 'downloading' as const, createdAt: 2 }
    expect([a, b].sort(compareJobs)).toEqual([b, a])
  })
})

describe('errorCopy', () => {
  it('explains known codes', () => {
    expect(errorCopy({ code: 'disk-full', message: 'ENOSPC' })).toBe(ERROR_COPY['disk-full'])
  })

  it('falls back to the message for a code this build has never seen', () => {
    // A real download list carried { code: 'held-paused' }, written by another
    // build; looking it up blindly crashed the Downloads page.
    const copy = errorCopy({ code: 'held-paused', message: 'Held, not failed: you had paused this download.' })
    expect(copy).toEqual({ title: 'Didn’t finish', hint: 'Held, not failed: you had paused this download.' })
    expect(errorCopy({ code: 'mystery', message: '' }).hint).toBe(ERROR_COPY.unknown.hint)
    expect(errorCopy(null)).toBe(ERROR_COPY.unknown)
  })
})
