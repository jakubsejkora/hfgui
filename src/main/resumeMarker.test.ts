import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RESUME_MARKER_MAX_AGE_MS, takeResumeMarker, writeResumeMarker } from './resumeMarker'

let dir: string
const file = (): string => join(dir, 'resume-after-update.json')

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hfgui-marker-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('resume marker', () => {
  it('is absent on an ordinary launch', () => {
    expect(takeResumeMarker(dir)).toEqual([])
  })

  it('names the downloads the update restart interrupted, once', () => {
    writeResumeMarker(dir, ['job_a', 'job_b'], 1_000)
    expect(takeResumeMarker(dir, 1_000 + 5_000)).toEqual(['job_a', 'job_b'])
    expect(existsSync(file())).toBe(false)
    expect(takeResumeMarker(dir, 1_000 + 6_000)).toEqual([])
  })

  it('is ignored, and cleared, when the restart was long ago', () => {
    writeResumeMarker(dir, ['job_a'], 1_000)
    expect(takeResumeMarker(dir, 1_000 + RESUME_MARKER_MAX_AGE_MS + 1)).toEqual([])
    expect(existsSync(file())).toBe(false)
  })

  it('is ignored when it is from the future (a clock change), unreadable or malformed', () => {
    writeResumeMarker(dir, ['job_a'], 10_000)
    expect(takeResumeMarker(dir, 5_000)).toEqual([])
    writeFileSync(file(), '{not json')
    expect(takeResumeMarker(dir)).toEqual([])
    expect(existsSync(file())).toBe(false)
    writeFileSync(file(), JSON.stringify({ at: 1_000, jobIds: ['job_a', 7, null] }))
    expect(takeResumeMarker(dir, 2_000)).toEqual(['job_a'])
  })
})
