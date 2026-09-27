import { describe, expect, it } from 'vitest'
import { canDownloadTo, defaultDestination, destinationRejection } from './destinationRules'
import type { DestinationInfo } from './types'

const info = (
  kind: DestinationInfo['kind'],
  path: string | null
): DestinationInfo => ({ kind, label: kind, path, detected: !!path, source: path ? 'detected' : 'none' })

const all = [info('lmstudio', '/lm'), info('exo', '/exo'), info('custom', '/tmp')]

describe('destinationRejection', () => {
  it('keeps non-MLX models out of exo', () => {
    expect(destinationRejection('exo', 'gguf', info('exo', '/exo'))).toBe('exo runs MLX models only')
    expect(canDownloadTo('exo', 'mlx', info('exo', '/exo'))).toBe(true)
  })

  it('rejects apps that are not installed', () => {
    expect(destinationRejection('lmstudio', 'gguf', info('lmstudio', null))).toBe(
      'Not installed on this Mac'
    )
  })

  it('always allows a custom folder', () => {
    expect(destinationRejection('custom', 'gguf', info('custom', null))).toBeNull()
  })
})

describe('defaultDestination', () => {
  it('prefers exo for MLX and LM Studio otherwise', () => {
    expect(defaultDestination('mlx', all)!.kind).toBe('exo')
    expect(defaultDestination('gguf', all)!.kind).toBe('lmstudio')
  })

  it('skips destinations without a path', () => {
    const noLm = [info('lmstudio', null), info('exo', null), info('custom', '/tmp')]
    expect(defaultDestination('gguf', noLm)!.kind).toBe('custom')
    expect(defaultDestination('gguf', [info('lmstudio', null)])).toBeNull()
  })
})
