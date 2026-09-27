import { describe, expect, it } from 'vitest'
import { isValidRepoId, parseModelRef, parseUriList } from './modelRef'

describe('parseModelRef', () => {
  const accepts: Array<[string, string, string | null, string | null]> = [
    ['https://huggingface.co/unsloth/Qwen3-8B-GGUF', 'unsloth/Qwen3-8B-GGUF', null, null],
    ['http://huggingface.co/unsloth/Qwen3-8B-GGUF', 'unsloth/Qwen3-8B-GGUF', null, null],
    ['https://www.huggingface.co/mlx-community/gemma-3-4b', 'mlx-community/gemma-3-4b', null, null],
    ['https://hf.co/unsloth/Qwen3-8B-GGUF', 'unsloth/Qwen3-8B-GGUF', null, null],
    ['huggingface.co/unsloth/Qwen3-8B-GGUF', 'unsloth/Qwen3-8B-GGUF', null, null],
    ['hf.co/unsloth/Qwen3-8B-GGUF', 'unsloth/Qwen3-8B-GGUF', null, null],
    ['https://huggingface.co/models/unsloth/Qwen3-8B-GGUF', 'unsloth/Qwen3-8B-GGUF', null, null],
    ['https://huggingface.co/unsloth/Qwen3-8B-GGUF/', 'unsloth/Qwen3-8B-GGUF', null, null],
    [
      'https://huggingface.co/unsloth/Qwen3-8B-GGUF?library=true#files',
      'unsloth/Qwen3-8B-GGUF',
      null,
      null
    ],
    ['https://huggingface.co/org/model/tree/main', 'org/model', 'main', null],
    [
      'https://huggingface.co/org/model/blob/main/model-Q4_K_M.gguf',
      'org/model',
      'main',
      'model-Q4_K_M.gguf'
    ],
    [
      'https://huggingface.co/org/model/resolve/a1b2c3/sub/dir/w.safetensors',
      'org/model',
      'a1b2c3',
      'sub/dir/w.safetensors'
    ],
    ['https://huggingface.co/org/model/refs%2Fpr%2F1', 'org/model', null, null],
    ['https://huggingface.co/org/model/tree/refs%2Fpr%2F1', 'org/model', 'refs/pr/1', null],
    ['https://huggingface.co/org/model/discussions/3', 'org/model', null, null],
    ['  unsloth/Qwen3-8B-GGUF  ', 'unsloth/Qwen3-8B-GGUF', null, null],
    ['meta-llama/Meta-Llama-3.1-8B-Instruct', 'meta-llama/Meta-Llama-3.1-8B-Instruct', null, null]
  ]

  it.each(accepts)('parses %s', (input, repoId, revision, filePath) => {
    const ref = parseModelRef(input)
    expect(ref).not.toBeNull()
    expect(ref!.repoId).toBe(repoId)
    expect(ref!.revision).toBe(revision)
    expect(ref!.filePath).toBe(filePath)
  })

  const rejects = [
    '',
    '   ',
    'qwen3 gguf',
    'gguf',
    'https://huggingface.co',
    'https://huggingface.co/',
    'https://huggingface.co/unsloth',
    'https://huggingface.co/datasets/open-r1/codeforces',
    'https://huggingface.co/spaces/org/demo',
    'https://huggingface.co/settings/tokens',
    'https://huggingface.co/collections/org/stuff',
    'https://example.com/org/model',
    'https://huggingface.co.evil.com/org/model',
    'file:///Users/me/org/model',
    'javascript://huggingface.co/org/model',
    'org/model/extra',
    '../../etc/passwd',
    'org/.hidden',
    'org name/model'
  ]

  it.each(rejects)('rejects %j', (input) => {
    expect(parseModelRef(input)).toBeNull()
  })

  it('marks URLs and bare ids differently', () => {
    expect(parseModelRef('https://hf.co/org/model')!.fromUrl).toBe(true)
    expect(parseModelRef('org/model')!.fromUrl).toBe(false)
  })
})

describe('parseUriList', () => {
  it('takes the first parseable line and skips comments', () => {
    const text = '# a comment\r\nhttps://huggingface.co/org/model\r\nhttps://hf.co/other/model'
    expect(parseUriList(text)!.repoId).toBe('org/model')
  })

  it('returns null when no line is a model link', () => {
    expect(parseUriList('# comment\r\nhttps://example.com/a/b')).toBeNull()
  })
})

describe('isValidRepoId', () => {
  it('requires exactly namespace/name', () => {
    expect(isValidRepoId('org/model')).toBe(true)
    expect(isValidRepoId('org')).toBe(false)
    expect(isValidRepoId('org/model/extra')).toBe(false)
    expect(isValidRepoId('../etc')).toBe(false)
    expect(isValidRepoId('org/.git')).toBe(false)
  })
})
