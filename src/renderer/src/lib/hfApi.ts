import type { ModelFormat, TreeFile } from '@shared/types'

export type SortKey = 'trendingScore' | 'downloads' | 'likes' | 'lastModified'
export type FormatFilter = 'gguf' | 'mlx' | null

export interface ModelSummary {
  id: string
  author: string
  name: string
  gated: boolean | string
  likes: number
  downloads: number
  lastModified: string | null
  pipelineTag: string | null
  tags: string[]
  trendingScore: number | null
  libraryName: string | null
  /** Aggregate GGUF metadata from the Hub, when the repo contains GGUF files. */
  ggufTotalFileSize: number | null
  /** Weight bytes computed from safetensors per-dtype counts, when available. */
  safetensorsSizeBytes: number | null
  /** Parameter count from safetensors metadata, when available. */
  paramCount: number | null
  format: ModelFormat
}

export interface ModelDetail {
  id: string
  author: string
  name: string
  sha: string | null
  gated: boolean | string
  likes: number
  downloads: number
  lastModified: string | null
  pipelineTag: string | null
  tags: string[]
  format: ModelFormat
}

export interface SearchQuery {
  search: string
  sort: SortKey
  format: FormatFilter
  pipelineTag: string | null
}

export interface SearchPage {
  models: ModelSummary[]
  nextUrl: string | null
}

const API = 'https://huggingface.co'
const EXPAND = [
  'downloads',
  'likes',
  'lastModified',
  'pipeline_tag',
  'tags',
  'trendingScore',
  'gguf',
  'safetensors',
  'gated',
  'library_name'
]

export class HfApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function hfFetch(url: string): Promise<Response> {
  const res = await fetch(url)
  if (!res.ok) {
    const message =
      res.status === 429
        ? 'Hugging Face rate limit reached — try again in a few minutes'
        : res.status === 401 || res.status === 403
          ? 'This model is gated — accept its license on huggingface.co and add your token in Settings'
          : `Hugging Face API error (HTTP ${res.status})`
    throw new HfApiError(res.status, message)
  }
  return res
}

function parseNextLink(link: string | null): string | null {
  if (!link) return null
  const match = link.match(/<([^>]+)>;\s*rel="next"/)
  return match ? match[1] : null
}

export function formatOf(tags: string[], libraryName: string | null): ModelFormat {
  const set = new Set(tags)
  if (set.has('gguf') || libraryName === 'gguf' || libraryName === 'llama.cpp') return 'gguf'
  if (set.has('mlx') || libraryName === 'mlx') return 'mlx'
  return 'other'
}

/** Bytes per element for safetensors dtype codes. */
const DTYPE_BYTES: Record<string, number> = {
  F64: 8,
  I64: 8,
  U64: 8,
  F32: 4,
  I32: 4,
  U32: 4,
  F16: 2,
  BF16: 2,
  I16: 2,
  U16: 2,
  F8_E4M3: 1,
  F8_E5M2: 1,
  I8: 1,
  U8: 1,
  BOOL: 1
}

/**
 * Total weight bytes from the Hub's safetensors per-dtype element counts.
 * Quantized MLX repos store packed U32 weights plus F16 scales, so the sum
 * matches the real download size. Null when counts are missing or contain an
 * unknown dtype (guessing would silently under-report).
 */
export function safetensorsSizeBytes(
  parameters: Record<string, number> | null | undefined
): number | null {
  if (!parameters) return null
  const entries = Object.entries(parameters)
  if (entries.length === 0) return null
  let bytes = 0
  for (const [dtype, count] of entries) {
    const perElement = DTYPE_BYTES[dtype]
    if (perElement === undefined || typeof count !== 'number') return null
    bytes += count * perElement
  }
  return bytes
}

function splitRepoId(id: string): { author: string; name: string } {
  const slash = id.indexOf('/')
  if (slash === -1) return { author: '', name: id }
  return { author: id.slice(0, slash), name: id.slice(slash + 1) }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toSummary(raw: any): ModelSummary {
  const { author, name } = splitRepoId(raw.id)
  const tags: string[] = raw.tags ?? []
  const libraryName: string | null = raw.library_name ?? null
  return {
    id: raw.id,
    author,
    name,
    gated: raw.gated ?? false,
    likes: raw.likes ?? 0,
    downloads: raw.downloads ?? 0,
    lastModified: raw.lastModified ?? null,
    pipelineTag: raw.pipeline_tag ?? null,
    tags,
    trendingScore: raw.trendingScore ?? null,
    libraryName,
    ggufTotalFileSize: raw.gguf?.totalFileSize ?? null,
    safetensorsSizeBytes: safetensorsSizeBytes(raw.safetensors?.parameters),
    paramCount: raw.safetensors?.total ?? null,
    format: formatOf(tags, libraryName)
  }
}

export async function searchModels(
  query: SearchQuery,
  pageUrl: string | null
): Promise<SearchPage> {
  let url = pageUrl
  if (!url) {
    const params = new URLSearchParams()
    params.set('limit', '30')
    params.set('sort', query.sort)
    params.set('direction', '-1')
    if (query.search.trim()) params.set('search', query.search.trim())
    if (query.format) params.append('filter', query.format)
    if (query.pipelineTag) params.set('pipeline_tag', query.pipelineTag)
    for (const e of EXPAND) params.append('expand[]', e)
    url = `${API}/api/models?${params}`
  }
  const res = await hfFetch(url)
  const raw = (await res.json()) as unknown[]
  return {
    models: raw.map(toSummary),
    nextUrl: parseNextLink(res.headers.get('Link'))
  }
}

/** Single repo fetched with the same expansions as search, for card display. */
export async function getModelSummary(repoId: string): Promise<ModelSummary> {
  const params = new URLSearchParams()
  for (const e of EXPAND) params.append('expand[]', e)
  const res = await hfFetch(`${API}/api/models/${repoId}?${params}`)
  return toSummary(await res.json())
}

export async function getModel(repoId: string): Promise<ModelDetail> {
  const res = await hfFetch(`${API}/api/models/${repoId}`)
  const raw: any = await res.json()
  const { author, name } = splitRepoId(raw.id ?? repoId)
  const tags: string[] = raw.tags ?? []
  return {
    id: raw.id ?? repoId,
    author,
    name,
    sha: raw.sha ?? null,
    gated: raw.gated ?? false,
    likes: raw.likes ?? 0,
    downloads: raw.downloads ?? 0,
    lastModified: raw.lastModified ?? null,
    pipelineTag: raw.pipeline_tag ?? null,
    tags,
    format: formatOf(tags, raw.library_name ?? null)
  }
}

/** Full recursive file listing with sizes; follows Link-header pagination. */
export async function getModelTree(repoId: string, revision: string): Promise<TreeFile[]> {
  let url: string | null =
    `${API}/api/models/${repoId}/tree/${encodeURIComponent(revision)}?recursive=true&limit=1000`
  const files: TreeFile[] = []
  while (url) {
    const res = await hfFetch(url)
    const items: any[] = await res.json()
    for (const item of items) {
      if (item.type === 'file') {
        files.push({ path: item.path, size: item.lfs?.size ?? item.size ?? 0 })
      }
    }
    url = parseNextLink(res.headers.get('Link'))
  }
  return files
}

export function modelUrl(repoId: string): string {
  return `${API}/${repoId}`
}
