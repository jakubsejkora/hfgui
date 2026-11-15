export function formatBytes(n: number | null | undefined): string {
  if (n == null || !isFinite(n) || n < 0) return '—'
  if (n < 1024) return `${Math.round(n)} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = n
  let unit = 'B'
  for (const u of units) {
    if (value < 1024) break
    value /= 1024
    unit = u
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${unit}`
}

export function formatCount(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—'
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`
  return `${(n / 1_000_000_000).toFixed(1)}B`
}

export function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`
}

export function formatEta(sec: number | null): string {
  if (sec == null || !isFinite(sec) || sec < 0) return '—'
  // Round once, up front: rounding the seconds part on its own turned 119.4 s
  // into "1m 60s".
  const total = Math.ceil(sec)
  if (total < 60) return `${total}s`
  if (total < 3600) return `${Math.floor(total / 60)}m ${total % 60}s`
  return `${Math.floor(total / 3600)}h ${Math.floor((total % 3600) / 60)}m`
}

/**
 * Minute-granularity "time ago" for events in this app (a download started,
 * finished). relativeTime() is for Hub timestamps and says "just now" for a
 * whole hour.
 */
export function timeAgo(ms: number | null | undefined, now = Date.now()): string {
  if (ms == null || !isFinite(ms)) return '—'
  const sec = Math.max(0, (now - ms) / 1000)
  if (sec < 45) return 'just now'
  if (sec < 3600) return `${Math.max(1, Math.round(sec / 60))}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  if (sec < 86400 * 2) return 'yesterday'
  if (sec < 86400 * 30) return `${Math.floor(sec / 86400)}d ago`
  return relativeTime(new Date(ms).toISOString(), now)
}

export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—'
  const then = Date.parse(iso)
  if (isNaN(then)) return '—'
  const daySec = 86400
  const diff = Math.max(0, (now - then) / 1000)
  if (diff < 3600) return 'just now'
  if (diff < daySec) return `${Math.floor(diff / 3600)}h ago`
  if (diff < daySec * 30) return `${Math.floor(diff / daySec)}d ago`
  if (diff < daySec * 365) return `${Math.floor(diff / (daySec * 30))}mo ago`
  return `${Math.floor(diff / (daySec * 365))}y ago`
}

/** Deterministic hue (0-360) from a string — used for author avatar colors. */
export function hashHue(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h) % 360
}
