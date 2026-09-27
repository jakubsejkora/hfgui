import { describe, expect, it } from 'vitest'
import { modelArtwork } from './artwork'

describe('modelArtwork', () => {
  it('is deterministic for the same repo id', () => {
    expect(modelArtwork('unsloth/Qwen3-8B-GGUF')).toEqual(modelArtwork('unsloth/Qwen3-8B-GGUF'))
  })

  it('gives different repos different art', () => {
    const a = modelArtwork('unsloth/Qwen3-8B-GGUF')
    const b = modelArtwork('mlx-community/gemma-3-4b')
    expect(a.background).not.toBe(b.background)
  })

  it('keeps one author within a hue family but still distinguishes models', () => {
    const a = modelArtwork('unsloth/Qwen3-8B-GGUF').hues[0]
    const b = modelArtwork('unsloth/gemma-3-27b-GGUF').hues[0]
    const distance = Math.min(Math.abs(a - b), 360 - Math.abs(a - b))
    expect(distance).toBeLessThanOrEqual(24)
    expect(a).not.toBe(b)
  })

  it('builds three gradient layers over a base colour', () => {
    const { background } = modelArtwork('org/model')
    expect(background.match(/radial-gradient/g)).toHaveLength(3)
    expect(background.endsWith(')')).toBe(true)
    // Saturation/lightness stay themeable rather than baked in.
    expect(background).toContain('var(--art-sat)')
    expect(background).toContain('var(--art-base-light)')
  })

  it('keeps every hue in range and distinct', () => {
    for (const id of ['a/b', 'unsloth/x', 'Qwen/Qwen3-235B', 'mlx-community/y']) {
      const { hues } = modelArtwork(id)
      for (const h of hues) {
        expect(h).toBeGreaterThanOrEqual(0)
        expect(h).toBeLessThan(360)
        expect(Number.isInteger(h)).toBe(true)
      }
      expect(new Set(hues).size).toBe(3)
    }
  })
})
