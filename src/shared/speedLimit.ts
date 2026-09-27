import type { Settings } from './types'

/**
 * Download speed cap helpers, shared by the main process (which enforces the
 * cap) and the renderer (which edits and displays it).
 *
 * "MB" is 1024-based throughout, like formatBytes(), so a 10 MB/s cap reads the
 * same as a download the app shows running at 10.0 MB/s.
 */
const MiB = 1024 * 1024

/** The stepped slider's values, bytes/sec. Roughly geometric, and round numbers. */
export const SPEED_STEPS: readonly number[] = [0.5, 1, 2, 3, 5, 8, 10, 15, 20, 30, 50, 75, 100].map(
  (mb) => mb * MiB
)

export const DEFAULT_SPEED_LIMIT = 10 * MiB
export const MIN_SPEED_LIMIT = 256 * 1024
export const MAX_SPEED_LIMIT = 1024 * MiB

/** Clamp a stored cap into a sane range; anything unusable becomes the default. */
export function clampSpeedLimit(bytesPerSec: unknown): number {
  const n = typeof bytesPerSec === 'number' ? bytesPerSec : NaN
  if (!Number.isFinite(n)) return DEFAULT_SPEED_LIMIT
  return Math.min(MAX_SPEED_LIMIT, Math.max(MIN_SPEED_LIMIT, n))
}

/** The cap in force, bytes/sec, or null when downloads run unlimited. */
export function effectiveSpeedLimit(
  settings: Pick<Settings, 'speedLimitEnabled' | 'speedLimitBytesPerSec'>
): number | null {
  return settings.speedLimitEnabled ? clampSpeedLimit(settings.speedLimitBytesPerSec) : null
}

/** Index of the step closest to `bytesPerSec` — by ratio, since the steps are geometric. */
export function nearestStep(bytesPerSec: number): number {
  const target = Math.log(Math.max(1, bytesPerSec))
  let best = 0
  for (let i = 1; i < SPEED_STEPS.length; i++) {
    if (Math.abs(Math.log(SPEED_STEPS[i]) - target) < Math.abs(Math.log(SPEED_STEPS[best]) - target)) {
      best = i
    }
  }
  return best
}

/** "10 MB/s", "0.5 MB/s" — caps are round numbers, so no trailing ".0". */
export function formatCap(bytesPerSec: number): string {
  return `${Number((bytesPerSec / MiB).toFixed(2))} MB/s`
}

/** Speed in the same unit as a cap, without the unit: "9.8" for use in "9.8 / 10 MB/s". */
export function formatSpeedInCapUnit(bytesPerSec: number): string {
  return (bytesPerSec / MiB).toFixed(1)
}

/** ISPs sell megabits; this is the "≈ 84 Mbit/s" hint next to a cap. */
export function formatMbit(bytesPerSec: number): string {
  const mbit = (bytesPerSec * 8) / 1e6
  return `≈ ${mbit < 10 ? mbit.toFixed(1) : Math.round(mbit)} Mbit/s`
}

/**
 * The cap to apply when the user switches limiting on.
 *
 * Keep the one they chose before — unless downloads are running and it wouldn't
 * slow them at all, because then switching on would appear to do nothing (a
 * 10 MB/s cap is invisible on a 50 Mbit line). In that case take the largest
 * step at or below half the current speed — rounding down, so at least half
 * the connection is genuinely left free.
 */
export function capOnEnable(storedCap: number, currentBytesPerSec: number): number {
  if (!(currentBytesPerSec > 0) || storedCap < currentBytesPerSec) return storedCap
  const half = currentBytesPerSec / 2
  let pick = SPEED_STEPS[0]
  for (const step of SPEED_STEPS) if (step <= half) pick = step
  return pick
}
