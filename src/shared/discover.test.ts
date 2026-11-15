import { describe, expect, it } from 'vitest'
import { isValidRepoId } from '../main/pathSafety'
import {
  TRUSTED_PUBLISHERS,
  baseKey,
  isUnsuitable,
  ladderOf,
  macMemoryGB,
  modelKey,
  pickKeys,
  popularOf,
  recommendationsFor,
  repoFor,
  selectPicks,
  tierFor,
  tiersOf,
  type PopularCandidate
} from './discover'
import { estimateQ4Bytes } from './fit'
import { CATEGORIES, type Category } from './picks'

const GiB = 1024 ** 3
const chat = CATEGORIES.find((c) => c.id === 'chat')!

describe('the catalog', () => {
  it('has the five categories, each with picks', () => {
    expect(CATEGORIES.map((c) => c.id)).toEqual(['chat', 'coding', 'vision', 'speech', 'embeddings'])
    for (const c of CATEGORIES) expect(c.picks.length, c.id).toBeGreaterThan(0)
  })

  it.each(CATEGORIES.map((c) => [c.id, c] as const))('%s: every pick is well-formed', (_id, category) => {
    let previousTier = 0
    const names = new Set<string>()
    for (const p of category.picks) {
      expect(p.gguf ?? p.mlx, `${p.name} has no repo`).toBeTruthy()
      if (p.gguf) expect(isValidRepoId(p.gguf), p.gguf).toBe(true)
      if (p.mlx) expect(isValidRepoId(p.mlx), p.mlx).toBe(true)
      expect([8, 16, 24, 32, 48, 64, 96, 128, 192, 256, 512], `${p.name}: tier`).toContain(p.minMemoryGB)
      // Smallest tier first, so the ladder and "first pick of a tier" read right.
      expect(p.minMemoryGB, `${p.name} is out of order`).toBeGreaterThanOrEqual(previousTier)
      previousTier = p.minMemoryGB
      expect(names.has(p.name), `${p.name} twice`).toBe(false)
      names.add(p.name)
      expect(p.why.length, `${p.name}: why`).toBeGreaterThan(20)
      expect(p.why.length, `${p.name}: why is too long for a card`).toBeLessThanOrEqual(140)
    }
  })

  it('names its repos so a pick and its other format count as one model', () => {
    for (const c of CATEGORIES) {
      for (const p of c.picks) {
        if (p.gguf && p.mlx) expect(modelKey(p.gguf), p.name).toBe(modelKey(p.mlx))
      }
    }
  })
})

describe('picking for a Mac', () => {
  it('reads memory the way Macs are sold', () => {
    expect(macMemoryGB(36 * GiB)).toBe(36)
    expect(macMemoryGB(17179869184)).toBe(16)
  })

  it('uses the biggest tier the Mac reaches', () => {
    expect(tiersOf(chat)).toEqual([8, 16, 24, 32, 96])
    expect(tierFor(chat, 8)).toBe(8)
    expect(tierFor(chat, 18)).toBe(16)
    expect(tierFor(chat, 36)).toBe(32)
    expect(tierFor(chat, 64)).toBe(32)
    expect(tierFor(chat, 128)).toBe(96)
    // Below every tier: still something to show.
    expect(tierFor(chat, 4)).toBe(8)
  })

  it('shows the tier’s first pick, then others that run there, biggest first', () => {
    const s = selectPicks(chat, 32)
    expect(s.pick.name).toBe('Qwen3.8 27B')
    expect(s.alsoGood.map((p) => p.name)).toEqual(['Qwen3.6 35B A3B', 'Gemma 4 26B A4B'])
    expect(selectPicks(chat, 32, 3).alsoGood.map((p) => p.name)).toEqual(['Qwen3.6 35B A3B', 'Gemma 4 26B A4B', 'gpt-oss 20B'])
    expect(selectPicks(chat, 8).alsoGood.map((p) => p.name)).toEqual(['Gemma 4 E2B'])
    // Never something bigger than the tier.
    for (const t of tiersOf(chat)) {
      for (const p of selectPicks(chat, t).alsoGood) expect(p.minMemoryGB).toBeLessThanOrEqual(t)
    }
  })

  it('recommends one card per model across categories, naming every category it serves', () => {
    const at16 = recommendationsFor(CATEGORIES, 16, 'gguf')
    expect(at16.map((r) => `${r.pick.name}: ${r.categories.map((c) => c.id).join('+')}`)).toEqual([
      'Qwen3.5 9B: chat+coding',
      'Gemma 4 E4B: vision',
      'Whisper large v3 turbo: speech',
      'Qwen3 Embedding 8B: embeddings'
    ])
    const at36 = recommendationsFor(CATEGORIES, 36, 'mlx')
    expect(at36.map((r) => `${r.pick.name}: ${r.categories.map((c) => c.id).join('+')}`)).toEqual([
      'Qwen3.8 27B: chat+vision',
      'Qwen3-Coder 30B A3B: coding',
      'Whisper large v3 turbo: speech',
      'Qwen3 Embedding 8B: embeddings'
    ])
  })

  it('has one ladder stop per tier', () => {
    expect(ladderOf(chat).map((s) => `${s.tier}:${s.pick.name}`)).toEqual([
      '8:Qwen3.5 4B',
      '16:Qwen3.5 9B',
      '24:Gemma 4 26B A4B',
      '32:Qwen3.8 27B',
      '96:gpt-oss 120B'
    ])
  })

  it('takes the format asked for, or the one a pick comes in', () => {
    const both = chat.picks[0]
    expect(repoFor(both, 'gguf')).toBe(both.gguf)
    expect(repoFor(both, 'mlx')).toBe(both.mlx)
    const mlxOnly = CATEGORIES.find((c) => c.id === 'speech')!.picks.find((p) => !p.gguf)!
    expect(repoFor(mlxOnly, 'gguf')).toBe(mlxOnly.mlx)
  })
})

describe('popular now', () => {
  const memoryBytes = 32 * GiB
  const m = (id: string, over: Partial<PopularCandidate> = {}): PopularCandidate => ({
    id,
    author: id.split('/')[0],
    tags: [],
    pipelineTag: 'text-generation',
    sizeBytes: 5 * GiB,
    ...over
  })

  it('keys a model the same however it was packaged', () => {
    expect(modelKey('lmstudio-community/Qwen3.8-27B-MLX-4bit')).toBe('qwen3.8-27b')
    expect(modelKey('lmstudio-community/gemma-4-12B-it-QAT-GGUF')).toBe('gemma-4-12b-it')
    expect(modelKey('mlx-community/gpt-oss-20b-MXFP4-Q8')).toBe('gpt-oss-20b')
    expect(modelKey('mlx-community/Qwen3-Embedding-0.6B-4bit-DWQ')).toBe('qwen3-embedding-0.6b')
    expect(modelKey('google/gemma-4-E4B-it-qat-q4_0-unquantized')).toBe('gemma-4-e4b-it')
    expect(baseKey('unsloth/Qwen3.6-35B-A3B-MTP-GGUF', ['base_model:quantized:Qwen/Qwen3.6-35B-A3B'])).toBe(
      'qwen3.6-35b-a3b'
    )
  })

  it('keeps trusted publishers, drops remixes, other tasks, duplicates and what won’t fit', () => {
    const models = [
      m('DavidAU/Qwen3.8-27B-Heretic-Uncensored-GGUF'),
      m('unsloth/Qwen3.8-27B-Abliterated-GGUF'),
      m('unsloth/Qwen-Image-2.1-GGUF', { pipelineTag: 'text-to-image' }),
      m('unsloth/Big-Model-GGUF', { sizeBytes: 40 * GiB }),
      m('unsloth/Unknown-Size-GGUF', { sizeBytes: null }),
      m('bartowski/Some-Adult-Model-GGUF', { tags: ['not-for-all-audiences'] }),
      m('unsloth/Fresh-9B-GGUF', { tags: ['base_model:quantized:lab/Fresh-9B'] }),
      m('lmstudio-community/Fresh-9B-GGUF', { tags: ['base_model:lab/Fresh-9B'] }),
      m('ggml-org/Other-4B-GGUF', { pipelineTag: null })
    ]
    const out = popularOf(models, chat.popular!, { memoryBytes, exclude: new Set() })
    expect(out.map((x) => x.id)).toEqual(['unsloth/Fresh-9B-GGUF', 'ggml-org/Other-4B-GGUF'])
  })

  it('leaves out what the category already recommends, and coders from chat', () => {
    const models = [
      m('unsloth/Qwen3.8-27B-GGUF', { tags: ['base_model:quantized:Qwen/Qwen3.8-27B'] }),
      m('unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF'),
      m('unsloth/Fresh-9B-GGUF')
    ]
    const out = popularOf(models, chat.popular!, { memoryBytes, exclude: pickKeys(chat) })
    expect(out.map((x) => x.id)).toEqual(['unsloth/Fresh-9B-GGUF'])
    const coding = CATEGORIES.find((c) => c.id === 'coding')!
    const code = popularOf(
      [m('unsloth/North-Mini-Code-1.0-GGUF'), m('bartowski/Code2Video-GGUF'), m('unsloth/Fresh-9B-GGUF')],
      coding.popular!,
      { memoryBytes, exclude: pickKeys(coding) }
    )
    expect(code.map((x) => x.id)).toEqual(['unsloth/North-Mini-Code-1.0-GGUF'])
  })

  it('stops at the limit', () => {
    const many = Array.from({ length: 20 }, (_, i) => m(`unsloth/Model-${i}-GGUF`))
    expect(popularOf(many, chat.popular!, { memoryBytes, exclude: new Set(), limit: 6 })).toHaveLength(6)
  })

  it('spots remixes by name or by the Hub’s adult flag', () => {
    expect(isUnsuitable('DavidAU/Qwen3.8-27B-Heretic-Uncensored-GGUF', [])).toBe(true)
    expect(isUnsuitable('huihui-ai/Huihui-Qwen3.8-27B-abliterated-GGUF', [])).toBe(true)
    expect(isUnsuitable('someone/Plain-Name-GGUF', ['not-for-all-audiences'])).toBe(true)
    expect(isUnsuitable('unsloth/Qwen3.8-27B-GGUF', ['gguf'])).toBe(false)
  })

  it('trusts converters by their exact Hub name', () => {
    expect(TRUSTED_PUBLISHERS.has('lmstudio-community')).toBe(true)
    expect(TRUSTED_PUBLISHERS.has('LMStudio-Community')).toBe(false)
  })
})

// Live Hub check, opt-in: HFGUI_NETWORK_TESTS=1 npm test
describe.runIf(process.env.HFGUI_NETWORK_TESTS === '1')('picks on the Hub', () => {
  const repos = (c: Category) => c.picks.flatMap((p) => [p.gguf, p.mlx].filter(Boolean).map((r) => ({ p, repo: r! })))
  for (const category of CATEGORIES) {
    for (const { p, repo } of repos(category)) {
      it(`${category.id}: ${repo}`, async () => {
        const res = await fetch(`https://huggingface.co/api/models/${repo}?expand[]=gated&expand[]=gguf&expand[]=safetensors`)
        expect(res.status, repo).toBe(200)
        const info = (await res.json()) as { gated?: unknown; gguf?: { total?: number } }
        expect(info.gated ?? false, `${repo} is gated`).toBe(false)
        // GGUF repos: the Q4_K_M estimate must fit the tier comfortably.
        const q4 = estimateQ4Bytes(info.gguf?.total)
        if (repo === p.gguf && q4) expect(q4, `${repo} is too big for ${p.minMemoryGB} GB`).toBeLessThanOrEqual(p.minMemoryGB * GiB * 0.7)
      })
    }
  }
})
