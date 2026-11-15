import { describe, expect, it } from 'vitest'
import { comfortableModelBytes, estimateQ4Bytes, formatParams, ramFit } from './fit'

const GB = 1024 ** 3

describe('estimateQ4Bytes', () => {
  it('lands near real Q4_K_M sizes for typical models', () => {
    // Llama-3.1-8B-Instruct Q4_K_M is 4,920,739,232 bytes on the Hub.
    expect(estimateQ4Bytes(8_030_261_312)! / 4_920_739_232).toBeGreaterThan(0.95)
    expect(estimateQ4Bytes(8_030_261_312)! / 4_920_739_232).toBeLessThan(1.05)
  })

  it('is a lower bound for tiny models, where embeddings dominate', () => {
    // SmolLM2-135M's Q4_K_M is 105 MB; the estimate stays under it.
    expect(estimateQ4Bytes(134_515_008)!).toBeLessThan(105_000_000)
  })

  it('returns null when the parameter count is unknown', () => {
    expect(estimateQ4Bytes(null)).toBeNull()
    expect(estimateQ4Bytes(0)).toBeNull()
  })
})

describe('ramFit', () => {
  it('uses the same headroom rule as the quant badges', () => {
    expect(ramFit(10 * GB, 16 * GB)).toBe('fits')
    expect(ramFit(13 * GB, 16 * GB)).toBe('tight')
    expect(ramFit(15 * GB, 16 * GB)).toBe('too-big')
  })

  it('agrees with comfortableModelBytes at the boundary', () => {
    expect(ramFit(comfortableModelBytes(64 * GB), 64 * GB)).toBe('fits')
  })
})

describe('formatParams', () => {
  it('abbreviates the way model names do', () => {
    expect(formatParams(134_515_008)).toBe('135M')
    expect(formatParams(1_540_000_000)).toBe('1.5B')
    expect(formatParams(8_030_261_312)).toBe('8B')
    expect(formatParams(26_895_998_464)).toBe('27B')
    expect(formatParams(null)).toBeNull()
  })
})
