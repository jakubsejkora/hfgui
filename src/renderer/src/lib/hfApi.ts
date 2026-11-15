import { estimateQ4Bytes } from '@shared/fit'
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
  /** Parameter count, from GGUF metadata or safetensors, when the Hub knows it. */
  params: number | null
  /**
   * What the user would download: for GGUF the estimated Q4_K_M file (the Hub's
   * own `gguf.totalFileSize` describes one arbitrary file, often the F16), for
   * MLX and others the weights.
   */
  sizeBytes: number | null
  /** sizeBytes is an estimate (GGUF quant size, or an MLX bit width read off the name). */
  sizeEstimated: boolean
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
  /** Facts from the same response — each null when the repo doesn't say. */
  params: number | null
  contextLength: number | null
  architecture: string | null
  license: string | null
  baseModel: string | null
}

export interface SearchQuery {
  search: string
  sort: SortKey
  format: FormatFilter
  pipelineTag: string | null
  /** Results per page; 30 unless a caller filters heavily afterwards. */
  limit?: number
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
          ? 'This model is gated — accept its license on huggingface.co and add your token in Settings (or your token may lack access)'
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

export interface MlxQuant {
  bits: number
  /** Quantization group size; MLX defaults to 64. */
  groupSize?: number
}

/**
 * Total weight bytes from the Hub's safetensors per-dtype element counts. Null
 * when counts are missing or contain an unknown dtype (guessing would silently
 * under-report).
 *
 * For quantized MLX repos the Hub reports the packed weights' *logical* count
 * under U32 — one per weight, not one per 32-bit word — so they cost
 * `bits` plus a 16-bit scale and bias per group, not 4 bytes each. Counting
 * them at 4 bytes made a 2.3 GB 4-bit model read as 16 GB.
 */
export function safetensorsSizeBytes(
  parameters: Record<string, number> | null | undefined,
  quant: MlxQuant | null = null
): number | null {
  if (!parameters) return null
  const entries = Object.entries(parameters)
  if (entries.length === 0) return null
  let bytes = 0
  for (const [dtype, count] of entries) {
    if (typeof count !== 'number') return null
    if (quant && dtype === 'U32') {
      bytes += (count * (quant.bits + 32 / (quant.groupSize ?? 64))) / 8
      continue
    }
    const perElement = DTYPE_BYTES[dtype]
    if (perElement === undefined) return null
    bytes += count * perElement
  }
  return Math.round(bytes)
}

/**
 * MLX quant width from the repo name — mlx-community and most others suffix it
 * ("-4bit", "-8bit", "-4bit-DWQ", "-mxfp4"). Search results don't carry the
 * repo's config (expanding it costs ~7x the payload), so the name is the
 * cheapest reliable signal. Null when the name doesn't say.
 */
export function mlxQuantBits(repoId: string): number | null {
  const name = (repoId.split('/').pop() ?? repoId).toLowerCase()
  const bits = /(?:^|[-_.])(\d{1,2})[-_]?bits?(?=$|[-_.])/.exec(name)
  if (bits) return Number(bits[1])
  if (/(?:^|[-_.])(?:mx|nv)fp4(?=$|[-_.])/.test(name)) return 4
  return null
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
  const format = formatOf(tags, libraryName)
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
    ...sizeFacts(raw, format),
    format
  }
}

function sizeFacts(
  raw: any,
  format: ModelFormat
): Pick<ModelSummary, 'params' | 'sizeBytes' | 'sizeEstimated'> {
  const ggufParams: number | null = raw.gguf?.total ?? null
  const stParams: number | null = raw.safetensors?.total ?? null
  if (format === 'gguf') {
    return { params: ggufParams, sizeBytes: estimateQ4Bytes(ggufParams), sizeEstimated: true }
  }
  const parameters = raw.safetensors?.parameters
  const hasPacked = !!parameters && typeof parameters.U32 === 'number'
  if (format === 'mlx' && hasPacked) {
    const named = mlxQuantBits(raw.id)
    return {
      params: stParams,
      sizeBytes: safetensorsSizeBytes(parameters, { bits: named ?? 4 }),
      sizeEstimated: true
    }
  }
  return {
    params: stParams,
    sizeBytes: safetensorsSizeBytes(parameters),
    sizeEstimated: false
  }
}

export async function searchModels(
  query: SearchQuery,
  pageUrl: string | null
): Promise<SearchPage> {
  let url = pageUrl
  if (!url) {
    const params = new URLSearchParams()
    params.set('limit', String(query.limit ?? 30))
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
    format: formatOf(tags, raw.library_name ?? null),
    ...modelFacts(raw)
  }
}

const firstString = (v: unknown): string | null =>
  typeof v === 'string' && v ? v : Array.isArray(v) && typeof v[0] === 'string' ? v[0] : null

/** License, lineage and shape, read from the model-info response — no extra requests. */
export function modelFacts(
  raw: any
): Pick<ModelDetail, 'params' | 'contextLength' | 'architecture' | 'license' | 'baseModel'> {
  const licenseTag = (raw.tags ?? []).find((t: unknown) => typeof t === 'string' && t.startsWith('license:'))
  return {
    params: raw.gguf?.total ?? raw.safetensors?.total ?? null,
    contextLength: raw.gguf?.context_length ?? null,
    architecture: raw.gguf?.architecture ?? raw.config?.model_type ?? null,
    license: firstString(raw.cardData?.license) ?? (licenseTag ? licenseTag.slice(8) : null),
    baseModel: firstString(raw.cardData?.base_model)
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
        files.push({
          path: item.path,
          size: item.lfs?.size ?? item.size ?? 0,
          // lfs.oid is a sha256; non-LFS files only have a git sha1, useless for content checks
          sha256: item.lfs?.oid ?? null
        })
      }
    }
    url = parseNextLink(res.headers.get('Link'))
  }
  return files
}

export function modelUrl(repoId: string): string {
  return `${API}/${repoId}`
}
