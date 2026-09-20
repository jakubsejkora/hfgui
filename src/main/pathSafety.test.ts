import { describe, expect, it } from 'vitest'
import { isSafeRelPath, isValidRepoId, safeJoin } from './pathSafety'

describe('isValidRepoId', () => {
  it('accepts real HF repo ids', () => {
    for (const id of [
      'Qwen/Qwen3-4B-GGUF',
      'mlx-community/whisper-large-v3-turbo',
      'ggerganov/whisper.cpp',
      'distil-whisper/distil-large-v3.5-ggml',
      'bartowski/Llama-3.2-3B-Instruct-GGUF'
    ]) {
      expect(isValidRepoId(id), id).toBe(true)
    }
  })

  it('rejects traversal and malformed ids', () => {
    for (const id of [
      '../etc',
      'a/../b',
      'a/..',
      '..',
      'no-slash',
      'a/b/c',
      '/leading',
      'trailing/',
      'a//b',
      '.hidden/repo',
      'a/.git',
      'a\\b'
    ]) {
      expect(isValidRepoId(id), id).toBe(false)
    }
  })
})

describe('isSafeRelPath', () => {
  it('accepts normal tree paths', () => {
    expect(isSafeRelPath('model-Q4_K_M.gguf')).toBe(true)
    expect(isSafeRelPath('UD-Q4_K_XL/model-00001-of-00002.gguf')).toBe(true)
    expect(isSafeRelPath('config with space (1).json')).toBe(true)
  })

  it('rejects traversal vectors', () => {
    for (const p of ['../x', 'a/../../b', '/abs', 'a//b', '.', 'a/.', '..\\x', 'a\0b', '']) {
      expect(isSafeRelPath(p), JSON.stringify(p)).toBe(false)
    }
  })
})

describe('safeJoin', () => {
  it('joins inside the base dir', () => {
    expect(safeJoin('/base/dir', 'sub/file.gguf')).toBe('/base/dir/sub/file.gguf')
  })

  it('throws when the result escapes the base dir', () => {
    expect(() => safeJoin('/base/dir', '../../etc/passwd')).toThrow(/outside/)
    expect(() => safeJoin('/base/dir', 'a/../../..')).toThrow(/outside/)
  })
})
