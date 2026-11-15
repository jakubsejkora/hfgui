import { describe, expect, it } from 'vitest'
import { describeChanges } from './changes'

describe('describeChanges', () => {
  it('names what changed the way people talk about models', () => {
    // Qwen3.8-27B, 7 Nov 2026.
    expect(describeChanges(['chat_template.jinja', 'tokenizer_config.json'])).toBe('chat template and tokenizer')
    expect(describeChanges(['model-00001-of-00004.safetensors', 'model-00002-of-00004.safetensors'])).toBe('weights')
    expect(describeChanges(['config.json', 'generation_config.json', 'm.gguf'])).toBe('model config, generation settings and weights')
    expect(describeChanges(['a.txt', 'b.txt', 'c.txt', 'd.txt'])).toBe('a.txt, b.txt and 2 more')
  })
})
