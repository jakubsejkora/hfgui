import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BandwidthLimiter } from './bandwidth'

// Date is faked by vi.useFakeTimers(), so it doubles as the limiter's clock.
const clock = { now: () => Date.now() }

function limiter(bytesPerSec: number | null, burstMs = 0): BandwidthLimiter {
  const l = new BandwidthLimiter({ ...clock, burstMs })
  l.setLimit(bytesPerSec)
  return l
}

/** Pulls `chunk`-sized pieces through the limiter forever, counting what passed. */
function drain(l: BandwidthLimiter, chunk: number, signal = new AbortController().signal) {
  const state = { passed: 0, error: null as unknown }
  void (async () => {
    try {
      for (;;) {
        await l.acquire(chunk, signal)
        state.passed += chunk
      }
    } catch (e) {
      state.error = e
    }
  })()
  return state
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('BandwidthLimiter', () => {
  it('passes everything synchronously when unlimited', () => {
    const l = limiter(null)
    const signal = new AbortController().signal
    for (let i = 0; i < 100; i++) expect(l.acquire(1_000_000, signal)).toBeNull()
  })

  it('treats nonsense limits as unlimited', () => {
    for (const bad of [0, -5, NaN, Infinity]) {
      expect(limiter(bad).limit).toBeNull()
    }
  })

  it('holds throughput to the cap', async () => {
    const l = limiter(1000) // 1000 B/s
    const flow = drain(l, 100)
    await vi.advanceTimersByTimeAsync(5000)
    // 100 B every 100 ms, the fifty-first chunk lands exactly on the 5 s mark.
    expect(flow.passed).toBeGreaterThanOrEqual(4900)
    expect(flow.passed).toBeLessThanOrEqual(5000)
  })

  it('does not drift below the cap when timers fire late', async () => {
    const l = limiter(1000, 250)
    const signal = new AbortController().signal
    let passed = 0
    while (Date.now() < 10_000) {
      const wait = l.acquire(100, signal)
      if (wait) {
        await vi.advanceTimersToNextTimerAsync() // the timer fires on schedule…
        vi.setSystemTime(Date.now() + 7) // …but the event loop gets to it 7 ms late
        await wait
      }
      passed += 100
    }
    // Without the burst allowance, 7 ms late per 100 ms chunk would cost ~7 %.
    expect(passed).toBeGreaterThanOrEqual(9_800)
  })

  it('allows a bounded burst after an idle spell', () => {
    const l = limiter(1000, 250)
    const signal = new AbortController().signal
    vi.setSystemTime(10_000) // long idle
    expect(l.acquire(200, signal)).toBeNull() // within the 250 B of credit
    expect(l.acquire(100, signal)).not.toBeNull() // credit exhausted
  })

  it('makes parallel downloads share one cap', async () => {
    const l = limiter(1000)
    const a = drain(l, 100)
    const b = drain(l, 100)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(a.passed + b.passed).toBeLessThanOrEqual(10_000)
    expect(a.passed + b.passed).toBeGreaterThanOrEqual(9_800)
    // Interleaved bookings give each an even share.
    expect(Math.abs(a.passed - b.passed)).toBeLessThanOrEqual(200)
  })

  it('releases waiting chunks at once when the cap is lifted', async () => {
    const l = limiter(10) // 10 B/s: a 1000 B chunk would wait 100 s
    const signal = new AbortController().signal
    const wait = l.acquire(1000, signal)
    expect(wait).not.toBeNull()
    l.setLimit(null)
    await expect(wait).resolves.toBeUndefined()
    expect(vi.getTimerCount()).toBe(0)
    expect(l.acquire(1000, signal)).toBeNull()
  })

  it('applies a raised cap to chunks already waiting', async () => {
    const l = limiter(10)
    const flow = drain(l, 1000)
    await vi.advanceTimersByTimeAsync(10)
    expect(flow.passed).toBe(0)
    l.setLimit(1_000_000)
    await vi.advanceTimersByTimeAsync(10)
    expect(flow.passed).toBeGreaterThan(0)
  })

  it('ignores a repeated identical limit', async () => {
    const l = limiter(10)
    const signal = new AbortController().signal
    const wait = l.acquire(1000, signal)!
    let settled = false
    void wait.then(() => (settled = true))
    l.setLimit(10) // e.g. an unrelated setting changed
    await vi.advanceTimersByTimeAsync(10)
    expect(settled).toBe(false)
  })

  it('rejects promptly on abort and leaves no timers behind', async () => {
    const l = limiter(10)
    const controller = new AbortController()
    const wait = l.acquire(1000, controller.signal)!
    controller.abort()
    await expect(wait).rejects.toMatchObject({ name: 'AbortError' })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects immediately when already aborted', async () => {
    const l = limiter(10)
    const controller = new AbortController()
    controller.abort()
    await expect(l.acquire(1000, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(vi.getTimerCount()).toBe(0)
  })
})
