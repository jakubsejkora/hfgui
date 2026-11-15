import { RAM_FIT_RATIO } from './quant'

/*
 * "Will it run on this Mac?" — one set of rules for every place that answers it:
 * card hints, the quant table's badges, the Overview's picks and the KPI card.
 */

/** Effective bits per weight of Q4_K_M, the quant hfgui recommends by default. */
const Q4_K_M_BITS_PER_WEIGHT = 4.85

/**
 * Approximate size of a GGUF repo's Q4_K_M file from its parameter count.
 * The Hub's own `gguf.totalFileSize` describes one arbitrary file in the repo
 * (often the F16), so it is no guide to what the user would actually download.
 */
export function estimateQ4Bytes(params: number | null | undefined): number | null {
  if (params == null || !Number.isFinite(params) || params <= 0) return null
  return Math.round((params * Q4_K_M_BITS_PER_WEIGHT) / 8)
}

export type RamFit = 'fits' | 'tight' | 'too-big'

/** Weights must leave headroom for the OS, the context and the runtime. */
export function ramFit(sizeBytes: number, ramBytes: number): RamFit {
  const ratio = sizeBytes / ramBytes
  if (ratio <= RAM_FIT_RATIO) return 'fits'
  if (ratio <= 0.9) return 'tight'
  return 'too-big'
}

/** The largest model that fits comfortably in this much memory. */
export function comfortableModelBytes(ramBytes: number): number {
  return Math.floor(ramBytes * RAM_FIT_RATIO)
}

/** 134_515_008 → "135M", 8_030_261_248 → "8B", 1_540_000_000 → "1.5B". */
export function formatParams(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null
  if (n >= 1e12) return `${trim(n / 1e12)}T`
  if (n >= 1e9) return `${trim(n / 1e9)}B`
  if (n >= 1e6) return `${Math.round(n / 1e6)}M`
  return `${Math.round(n / 1e3)}K`
}

function trim(v: number): string {
  // One decimal below 10 ("1.5B", "7.6B"), none above ("27B", "235B").
  return v < 10 ? String(Math.round(v * 10) / 10) : String(Math.round(v))
}
