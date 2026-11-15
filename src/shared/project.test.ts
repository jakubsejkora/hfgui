import { describe, expect, it } from 'vitest'
import { REPO_URL, bugReportUrl, releaseUrl } from './project'

describe('releaseUrl', () => {
  it('points at the tag electron-builder publishes (v-prefixed)', () => {
    expect(releaseUrl('0.3.0')).toBe(`${REPO_URL}/releases/tag/v0.3.0`)
  })
})

describe('bugReportUrl', () => {
  it('opens the bug form with version, macOS and the Mac filled in', () => {
    const url = new URL(
      bugReportUrl({
        version: '0.3.0',
        osVersion: '15.6.1',
        cpuModel: 'Apple M3 Pro ',
        totalMemoryBytes: 36 * 1024 ** 3
      })
    )
    expect(`${url.origin}${url.pathname}`).toBe(`${REPO_URL}/issues/new`)
    expect(url.searchParams.get('template')).toBe('bug_report.yml')
    expect(url.searchParams.get('version')).toBe('0.3.0')
    expect(url.searchParams.get('macos')).toBe('15.6.1')
    expect(url.searchParams.get('mac')).toBe('Apple M3 Pro, 36 GB')
  })

  it('leaves out what it does not know', () => {
    const url = new URL(bugReportUrl({ version: '0.3.0', osVersion: '', cpuModel: '', totalMemoryBytes: 0 }))
    expect(url.searchParams.get('mac')).toBe('')
  })
})
