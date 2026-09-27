/**
 * One budget of network bandwidth shared by every download.
 *
 * Downloads call `acquire(chunk.length)` before passing each chunk on. Holding a
 * chunk back stalls the stream pipeline, the pipeline stops reading the fetch
 * body, undici stops reading the socket, and TCP flow control slows the sender
 * — so the cap limits the connection itself, not just the disk writes.
 *
 * The algorithm is a virtual clock (GCRA): `tat` is the moment the link is next
 * free, and each acquisition books `bytes / rate` of link time after it.
 * Reservations are sequential, so parallel downloads interleave fairly and
 * together never exceed the cap.
 */
export class BandwidthLimiter {
  private bytesPerSec: number | null = null
  /** "Theoretical arrival time": when the link is next free under the cap. */
  private tat = 0
  private readonly now: () => number
  private readonly burstMs: number
  private readonly sleepers = new Set<() => void>()

  constructor(opts: { now?: () => number; burstMs?: number } = {}) {
    this.now = opts.now ?? (() => performance.now())
    // Lets the booking fall this far behind real time. That absorbs setTimeout
    // waking late (which would otherwise shave the rate below the cap on every
    // chunk) and bounds the burst after an idle spell to a quarter-second of data.
    this.burstMs = opts.burstMs ?? 250
  }

  /** Bytes per second, or null when unlimited. */
  get limit(): number | null {
    return this.bytesPerSec
  }

  /** Takes effect immediately, including for chunks already waiting. */
  setLimit(bytesPerSec: number | null): void {
    const next =
      bytesPerSec !== null && Number.isFinite(bytesPerSec) && bytesPerSec > 0 ? bytesPerSec : null
    if (next === this.bytesPerSec) return
    this.bytesPerSec = next
    // Bookings made under the old cap no longer mean anything. Start the clock
    // fresh and release every waiting chunk: raising or lifting the cap is
    // instant, and lowering it costs at most one chunk per download of slack.
    this.tat = this.now()
    for (const wake of [...this.sleepers]) wake()
  }

  /**
   * Books `bytes` of link time. Returns null when they may pass right away —
   * so an uncapped download stays fully synchronous — or a promise that
   * resolves when they may, and rejects with an AbortError if `signal` fires.
   */
  acquire(bytes: number, signal: AbortSignal): Promise<void> | null {
    const rate = this.bytesPerSec
    if (rate === null || !(bytes > 0)) return null
    const now = this.now()
    const start = Math.max(this.tat, now - this.burstMs)
    this.tat = start + (bytes / rate) * 1000
    const wait = this.tat - now
    return wait > 0 ? this.sleep(wait, signal) : null
  }

  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'))
        return
      }
      const settle = (): void => {
        clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
        this.sleepers.delete(wake)
      }
      const wake = (): void => {
        settle()
        resolve()
      }
      const onAbort = (): void => {
        settle()
        reject(new DOMException('Aborted', 'AbortError'))
      }
      const timer = setTimeout(wake, ms)
      signal.addEventListener('abort', onAbort, { once: true })
      this.sleepers.add(wake)
    })
  }
}
