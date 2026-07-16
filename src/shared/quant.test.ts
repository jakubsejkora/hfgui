import { describe, expect, it } from 'vitest'
import { groupGgufFiles, quantLabelFor } from './quant'

describe('quantLabelFor', () => {
  it('parses common quant tokens', () => {
    expect(quantLabelFor('llama-2-7b.Q4_K_M.gguf')).toBe('Q4_K_M')
    expect(quantLabelFor('qwen2.5-0.5b-instruct-q8_0.gguf')).toBe('Q8_0')
    expect(quantLabelFor('model-IQ2_XS.gguf')).toBe('IQ2_XS')
    expect(quantLabelFor('gemma-3-27b-it-BF16.gguf')).toBe('BF16')
    expect(quantLabelFor('mistral-f16.gguf')).toBe('F16')
    expect(quantLabelFor('gpt-oss-20b-MXFP4.gguf')).toBe('MXFP4')
  })

  it('parses quant from a directory name (unsloth-style repos)', () => {
    expect(quantLabelFor('UD-Q4_K_XL/model-UD-Q4_K_XL-00001-of-00002.gguf')).toBe('Q4_K_XL')
  })

  it('ignores the multi-part suffix', () => {
    expect(quantLabelFor('DeepSeek-R1-IQ1_S-00001-of-00003.gguf')).toBe('IQ1_S')
  })

  it('returns null when no quant token exists', () => {
    expect(quantLabelFor('README.md')).toBeNull()
    expect(quantLabelFor('model.gguf')).toBeNull()
  })

  it('does not treat model size tokens as quants', () => {
    // "7b" / "0.5b" should not match; only q/f/bf/fp tokens
    expect(quantLabelFor('llama-2-7b.Q5_K_S.gguf')).toBe('Q5_K_S')
  })
})

describe('groupGgufFiles', () => {
  it('groups multi-part files into one entry with summed size', () => {
    const { groups, others } = groupGgufFiles([
      { path: 'model-Q4_K_M-00001-of-00002.gguf', size: 100 },
      { path: 'model-Q4_K_M-00002-of-00002.gguf', size: 50 },
      { path: 'model-Q8_0.gguf', size: 300 },
      { path: 'README.md', size: 5 }
    ])
    expect(groups).toHaveLength(2)
    const q4 = groups.find((g) => g.label === 'Q4_K_M')!
    expect(q4.totalSize).toBe(150)
    expect(q4.partCount).toBe(2)
    expect(q4.expectedParts).toBe(2)
    const q8 = groups.find((g) => g.label === 'Q8_0')!
    expect(q8.partCount).toBe(1)
    expect(others).toEqual([{ path: 'README.md', size: 5 }])
  })

  it('sorts by size ascending and pushes extras to the end', () => {
    const { groups } = groupGgufFiles([
      { path: 'big-Q8_0.gguf', size: 900 },
      { path: 'small-Q2_K.gguf', size: 100 },
      { path: 'mmproj-F16.gguf', size: 50 }
    ])
    expect(groups.map((g) => g.label)).toEqual(['Q2_K', 'Q8_0', 'F16'])
    expect(groups[2].isExtra).toBe(true)
  })

  it('keeps part files sorted within a group', () => {
    const { groups } = groupGgufFiles([
      { path: 'm-Q4_K_M-00002-of-00002.gguf', size: 1 },
      { path: 'm-Q4_K_M-00001-of-00002.gguf', size: 1 }
    ])
    expect(groups[0].files.map((f) => f.path)).toEqual([
      'm-Q4_K_M-00001-of-00002.gguf',
      'm-Q4_K_M-00002-of-00002.gguf'
    ])
  })
})
