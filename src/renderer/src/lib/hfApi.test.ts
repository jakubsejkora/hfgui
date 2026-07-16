import { describe, expect, it } from 'vitest'
import { safetensorsSizeBytes } from './hfApi'

describe('safetensorsSizeBytes', () => {
  it('sums a single-dtype repo', () => {
    expect(safetensorsSizeBytes({ F16: 1_000 })).toBe(2_000)
    expect(safetensorsSizeBytes({ BF16: 7_600_000_000 })).toBe(15_200_000_000)
  })

  it('sums quantized MLX repos (packed U32 weights + F16 scales)', () => {
    expect(safetensorsSizeBytes({ U32: 1_680_834_560, F16: 883_584_240 })).toBe(
      1_680_834_560 * 4 + 883_584_240 * 2
    )
  })

  it('covers 8-bit and fp8 dtypes', () => {
    expect(safetensorsSizeBytes({ U8: 100, I8: 50, F8_E4M3: 25, BOOL: 4 })).toBe(179)
    expect(safetensorsSizeBytes({ F64: 10, I64: 10, F32: 10, I16: 10 })).toBe(220)
  })

  it('returns null on unknown dtypes rather than under-reporting', () => {
    expect(safetensorsSizeBytes({ F16: 1_000, FP4: 2_000 })).toBeNull()
  })

  it('returns null for missing or empty parameter maps', () => {
    expect(safetensorsSizeBytes(undefined)).toBeNull()
    expect(safetensorsSizeBytes(null)).toBeNull()
    expect(safetensorsSizeBytes({})).toBeNull()
  })
})
