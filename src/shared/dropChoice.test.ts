import { describe, expect, it } from 'vitest'
import { planDrop } from './dropChoice'
import type { TreeFile } from './types'

const GB = 1024 ** 3
const file = (path: string, size: number): TreeFile => ({ path, size, sha256: null })

const ggufTree: TreeFile[] = [
  file('model-Q2_K.gguf', 1 * GB),
  file('model-Q4_K_M.gguf', 4 * GB),
  file('model-Q8_0.gguf', 9 * GB),
  file('README.md', 2048)
]

describe('planDrop', () => {
  it('waits for the file tree rather than guessing', () => {
    expect(planDrop({ format: 'gguf', tree: null, modelName: 'm', ramBytes: 64 * GB })).toEqual({
      kind: 'open-details',
      reason: 'tree-not-loaded'
    })
  })

  it('sends unknown formats to the detail sheet', () => {
    expect(
      planDrop({ format: 'other', tree: ggufTree, modelName: 'm', ramBytes: 64 * GB })
    ).toEqual({ kind: 'open-details', reason: 'unknown-format' })
  })

  it('picks the recommended quant for GGUF', () => {
    const plan = planDrop({ format: 'gguf', tree: ggufTree, modelName: 'Qwen3', ramBytes: 64 * GB })
    expect(plan).toMatchObject({ kind: 'download', quantLabel: 'Q4_K_M' })
    expect(plan.kind === 'download' && plan.displayName).toBe('Qwen3 · Q4_K_M')
    expect(plan.kind === 'download' && plan.files.map((f) => f.path)).toEqual([
      'model-Q4_K_M.gguf'
    ])
  })

  it('falls back to the sheet when nothing fits RAM', () => {
    expect(planDrop({ format: 'gguf', tree: ggufTree, modelName: 'm', ramBytes: 1 * GB })).toEqual({
      kind: 'open-details',
      reason: 'nothing-fits'
    })
  })

  it('takes the whole repo for MLX, minus git metadata', () => {
    const tree = [file('model.safetensors', 3 * GB), file('config.json', 900), file('.gitattributes', 40)]
    const plan = planDrop({ format: 'mlx', tree, modelName: 'gemma', ramBytes: 64 * GB })
    expect(plan).toMatchObject({ kind: 'download', displayName: 'gemma', quantLabel: null })
    expect(plan.kind === 'download' && plan.files.map((f) => f.path)).toEqual([
      'model.safetensors',
      'config.json'
    ])
  })

  it('bows out when a repo has no complete group', () => {
    const tree = [file('model-00001-of-00003.gguf', 2 * GB)]
    expect(planDrop({ format: 'gguf', tree, modelName: 'm', ramBytes: 64 * GB })).toEqual({
      kind: 'open-details',
      reason: 'no-complete-group'
    })
    expect(planDrop({ format: 'mlx', tree: [], modelName: 'm', ramBytes: 64 * GB })).toEqual({
      kind: 'open-details',
      reason: 'no-complete-group'
    })
  })
})
