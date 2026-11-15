import { describe, expect, it } from 'vitest'
import { mlxQuantBits, modelFacts, safetensorsSizeBytes } from './hfApi'

describe('safetensorsSizeBytes', () => {
  it('sums a single-dtype repo', () => {
    expect(safetensorsSizeBytes({ F16: 1_000 })).toBe(2_000)
    expect(safetensorsSizeBytes({ BF16: 7_600_000_000 })).toBe(15_200_000_000)
  })

  it('counts U32 at 4 bytes when the repo is not a known MLX quant', () => {
    expect(safetensorsSizeBytes({ U32: 1_000, F16: 500 })).toBe(5_000)
  })

  it('sizes quantized MLX repos from logical U32 counts and the bit width', () => {
    // mlx-community/Qwen3-4B-4bit: the Hub reports these counts; the repo's
    // model.safetensors is 2,263,022,529 bytes. At 4 bytes per U32 it read as 16 GB.
    const size = safetensorsSizeBytes({ U32: 4_022_272_000, BF16: 196_096 }, { bits: 4 })!
    expect(Math.abs(size / 2_263_022_529 - 1)).toBeLessThan(0.001)
    // 8-bit costs twice the weight bytes; group size changes the scale overhead.
    expect(safetensorsSizeBytes({ U32: 64 }, { bits: 8 })).toBe(68)
    expect(safetensorsSizeBytes({ U32: 64 }, { bits: 4, groupSize: 32 })).toBe(40)
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

describe('mlxQuantBits', () => {
  it('reads the bit width off common MLX repo names', () => {
    expect(mlxQuantBits('mlx-community/Qwen3-4B-4bit')).toBe(4)
    expect(mlxQuantBits('mlx-community/Llama-3.3-70B-Instruct-8bit')).toBe(8)
    expect(mlxQuantBits('mlx-community/Qwen3-30B-A3B-4bit-DWQ')).toBe(4)
    expect(mlxQuantBits('org/model-3-bit')).toBe(3)
    expect(mlxQuantBits('mlx-community/gpt-oss-20b-MXFP4-Q8')).toBe(4)
  })

  it('returns null when the name does not say', () => {
    expect(mlxQuantBits('KRAFTON/Raon-1-nano-mlx')).toBeNull()
    // a version number is not a bit width
    expect(mlxQuantBits('org/model-v2-bitnet')).toBeNull()
  })
})

describe('modelFacts', () => {
  it('reads license, lineage and shape from a GGUF model-info response', () => {
    expect(
      modelFacts({
        gguf: { total: 134_515_008, architecture: 'llama', context_length: 8192 },
        cardData: { license: 'apache-2.0', base_model: 'HuggingFaceTB/SmolLM2-135M-Instruct' }
      })
    ).toEqual({
      params: 134_515_008,
      contextLength: 8192,
      architecture: 'llama',
      license: 'apache-2.0',
      baseModel: 'HuggingFaceTB/SmolLM2-135M-Instruct'
    })
  })

  it('falls back to tags and config, and tolerates lists', () => {
    expect(
      modelFacts({
        tags: ['mlx', 'license:mit'],
        config: { model_type: 'qwen3' },
        safetensors: { total: 4_022_468_096 },
        cardData: { base_model: ['Qwen/Qwen3-4B'] }
      })
    ).toEqual({
      params: 4_022_468_096,
      contextLength: null,
      architecture: 'qwen3',
      license: 'mit',
      baseModel: 'Qwen/Qwen3-4B'
    })
  })
})
