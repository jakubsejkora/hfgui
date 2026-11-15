import { ramFit } from './fit'
import type { Category, Pick, PopularQuery } from './picks'

/*
 * Discover's rules, pure so they're unit-tested: which pick suits a Mac with
 * so much memory, and which live Hub results are worth showing next to them.
 */

export type PickFormat = 'gguf' | 'mlx'

/** A Mac's memory as people say it: os.totalmem() of a "36 GB" Mac is 36 GiB. */
export function macMemoryGB(totalMemoryBytes: number): number {
  return Math.round(totalMemoryBytes / 1024 ** 3)
}

/** The pick's repo in the format asked for, or in the other one when it only comes in that. */
export function repoFor(pick: Pick, format: PickFormat): string {
  const preferred = format === 'mlx' ? pick.mlx : pick.gguf
  return (preferred ?? pick.gguf ?? pick.mlx)!
}

/** The memory sizes a category has picks for, smallest first. */
export function tiersOf(category: Category): number[] {
  return [...new Set(category.picks.map((p) => p.minMemoryGB))].sort((a, b) => a - b)
}

/** The biggest tier this Mac reaches; the smallest one when it reaches none. */
export function tierFor(category: Category, memoryGB: number): number {
  const tiers = tiersOf(category)
  return [...tiers].reverse().find((t) => t <= memoryGB) ?? tiers[0]
}

export interface PickSelection {
  tier: number
  /** The one to show first: the tier's first pick. */
  pick: Pick
  /** Others that run on a Mac of this tier, biggest first. */
  alsoGood: Pick[]
}

export function selectPicks(category: Category, tier: number, max = 2): PickSelection {
  const atTier = category.picks.filter((p) => p.minMemoryGB === tier)
  const pick = atTier[0] ?? category.picks[0]
  const alsoGood = category.picks
    .filter((p) => p !== pick && p.minMemoryGB <= tier)
    // Stable: within a tier, the file's order stands.
    .sort((a, b) => b.minMemoryGB - a.minMemoryGB)
    .slice(0, max)
  return { tier, pick, alsoGood }
}

/**
 * The pick in every category for a Mac, one card per model: where categories
 * agree (at 16 GB the same model is the best for chat and for code), they
 * share it instead of showing it twice.
 */
export function recommendationsFor(
  categories: readonly Category[],
  memoryGB: number,
  format: PickFormat
): Array<{ pick: Pick; categories: Category[] }> {
  const byRepo = new Map<string, { pick: Pick; categories: Category[] }>()
  for (const category of categories) {
    const { pick } = selectPicks(category, tierFor(category, memoryGB))
    const repo = repoFor(pick, format)
    const entry = byRepo.get(repo)
    if (entry) entry.categories.push(category)
    else byRepo.set(repo, { pick, categories: [category] })
  }
  return [...byRepo.values()]
}

/** One stop per tier for the memory ladder, with the pick that tier would get. */
export function ladderOf(category: Category): Array<{ tier: number; pick: Pick }> {
  return tiersOf(category).map((tier) => ({ tier, pick: selectPicks(category, tier).pick }))
}

/* ── Popular now ─────────────────────────────────────────────────────────── */

/**
 * Model makers, and the converters people already trust to package them.
 * Lists from anyone else are mostly re-uploads and remixes.
 */
export const TRUSTED_PUBLISHERS: ReadonlySet<string> = new Set([
  'lmstudio-community',
  'ggml-org',
  'unsloth',
  'bartowski',
  'mlx-community',
  'Qwen',
  'google',
  'openai',
  'mistralai',
  'meta-llama',
  'microsoft',
  'nvidia',
  'ibm-granite',
  'deepseek-ai',
  'zai-org',
  'moonshotai',
  'LiquidAI',
  'HuggingFaceTB',
  'allenai',
  'MiniMaxAI'
])

/** Safety-stripped and adult remixes — not what a newcomer should be handed. */
const UNSUITABLE = /uncensor|abliterat|heretic|obliterat|nsfw|erotic|roleplay|lewd/i

/** A remix with its safety training removed, or flagged by the Hub as adult content. */
export function isUnsuitable(repoId: string, tags: readonly string[]): boolean {
  return UNSUITABLE.test(repoId) || tags.includes('not-for-all-audiences')
}

const FORMAT_SUFFIX =
  /[-_.](gguf|mlx|mxfp4|nvfp4|fp8|bf16|fp16|f16|qat|dwq|unquantized|mtp|q\d(_k)?(_[a-z0-9]+)?|\d+-?bits?|optiq|i1)$/i

/** "lmstudio-community/Qwen3.8-27B-MLX-4bit" → "qwen3.8-27b": the model, whoever packaged it. */
export function modelKey(repoId: string): string {
  let name = (repoId.split('/').pop() ?? repoId).toLowerCase()
  for (let previous = ''; previous !== name; ) {
    previous = name
    name = name.replace(FORMAT_SUFFIX, '')
  }
  return name
}

/** What a repo packages: its declared base model when it names one, else itself. */
export function baseKey(repoId: string, tags: readonly string[]): string {
  const base = tags.find((t) => t.startsWith('base_model:'))
  return modelKey(base ? (base.split(':').pop() ?? repoId) : repoId)
}

export interface PopularCandidate {
  id: string
  author: string
  tags: string[]
  pipelineTag: string | null
  /** What the user would download; null when the Hub doesn't say. */
  sizeBytes: number | null
}

/**
 * The Hub's most downloaded, filtered to what's worth showing: from trusted
 * publishers, not an unsuitable remix, one entry per underlying model, not
 * already a pick, and comfortably within this Mac's memory.
 */
export function popularOf<T extends PopularCandidate>(
  models: readonly T[],
  query: PopularQuery,
  opts: { memoryBytes: number; exclude: ReadonlySet<string>; limit?: number }
): T[] {
  const seen = new Set(opts.exclude)
  const out: T[] = []
  for (const m of models) {
    if (!TRUSTED_PUBLISHERS.has(m.author)) continue
    if (isUnsuitable(m.id, m.tags)) continue
    if (!query.pipelines.includes(m.pipelineTag)) continue
    if (query.nameMatches && !query.nameMatches.test(m.id)) continue
    if (query.nameExcludes && query.nameExcludes.test(m.id)) continue
    if (m.sizeBytes == null || ramFit(m.sizeBytes, opts.memoryBytes) !== 'fits') continue
    const key = baseKey(m.id, m.tags)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(m)
    if (out.length >= (opts.limit ?? 6)) break
  }
  return out
}

/** The models a category already recommends, as popularOf() excludes them. */
export function pickKeys(category: Category): Set<string> {
  const keys = new Set<string>()
  for (const p of category.picks) {
    if (p.gguf) keys.add(modelKey(p.gguf))
    if (p.mlx) keys.add(modelKey(p.mlx))
  }
  return keys
}
