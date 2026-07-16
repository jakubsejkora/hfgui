import { describe, expect, it } from 'vitest'
import { formatBytes, formatCount, formatEta, relativeTime } from './format'

describe('formatBytes', () => {
  it('formats across units', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1023)).toBe('1023 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(4.4 * 1024 ** 3)).toBe('4.4 GB')
    expect(formatBytes(230 * 1024 ** 3)).toBe('230 GB')
  })

  it('handles null/invalid', () => {
    expect(formatBytes(null)).toBe('—')
    expect(formatBytes(-5)).toBe('—')
  })
})

describe('formatCount', () => {
  it('abbreviates thousands and millions', () => {
    expect(formatCount(950)).toBe('950')
    expect(formatCount(1234)).toBe('1.2k')
    expect(formatCount(45600)).toBe('46k')
    expect(formatCount(2_300_000)).toBe('2.3M')
  })
})

describe('formatEta', () => {
  it('formats durations', () => {
    expect(formatEta(30)).toBe('30s')
    expect(formatEta(90)).toBe('1m 30s')
    expect(formatEta(3700)).toBe('1h 1m')
    expect(formatEta(null)).toBe('—')
  })
})

describe('relativeTime', () => {
  const now = Date.parse('2026-07-16T12:00:00Z')
  it('buckets correctly', () => {
    expect(relativeTime('2026-07-16T11:30:00Z', now)).toBe('just now')
    expect(relativeTime('2026-07-16T04:00:00Z', now)).toBe('8h ago')
    expect(relativeTime('2026-07-10T12:00:00Z', now)).toBe('6d ago')
    expect(relativeTime('2026-03-16T12:00:00Z', now)).toBe('4mo ago')
    expect(relativeTime('2024-07-16T12:00:00Z', now)).toBe('2y ago')
  })
})
