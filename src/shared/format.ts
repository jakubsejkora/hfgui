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
  if (sec < 60) return `${Math.ceil(sec)}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${Math.ceil(sec % 60)}s`
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
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
