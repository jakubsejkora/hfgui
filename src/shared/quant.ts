import type { TreeFile } from './types'

export interface QuantGroup {
  /** Stable grouping key (path with part suffix stripped). */
  key: string
  /** Human label, e.g. "Q4_K_M", "F16", or "GGUF" when no quant token found. */
  label: string
  files: TreeFile[]
  totalSize: number
  partCount: number
  /** Expected part count from "-of-0000N" suffix, if the file is multi-part. */
  expectedParts: number | null
  /** mmproj / imatrix companion files rather than the model itself. */
  isExtra: boolean
}

const PART_RE = /-(\d{5})-of-(\d{5})\.gguf$/i
const QUANT_RE = /(?:^|[-._ /])(i?q[1-8](?:_[a-z0-9]+)*|f16|f32|bf16|fp16|fp32|mxfp4(?:_moe)?)(?=[-._ /]|$)/gi

/** Extract the quantization label from a GGUF file path, e.g. "Q4_K_M". */
export function quantLabelFor(path: string): string | null {
  const stripped = path.replace(PART_RE, '.gguf').replace(/\.gguf$/i, '')
  let last: string | null = null
  QUANT_RE.lastIndex = 0
  for (const m of stripped.matchAll(QUANT_RE)) {
    last = m[1]
  }
  return last ? last.toUpperCase() : null
}

function isExtraFile(path: string): boolean {
  const base = path.split('/').pop() ?? path
  return /mmproj|imatrix/i.test(base)
}

/**
 * Group a repo's GGUF files into downloadable quant variants.
 * Multi-part files ("-00001-of-00003.gguf") collapse into a single group.
 * Non-GGUF files are returned separately as `others`.
 */
export function groupGgufFiles(files: TreeFile[]): { groups: QuantGroup[]; others: TreeFile[] } {
  const groups = new Map<string, QuantGroup>()
  const others: TreeFile[] = []

  for (const file of files) {
    if (!/\.gguf$/i.test(file.path)) {
      others.push(file)
      continue
    }
    const partMatch = file.path.match(PART_RE)
    const key = partMatch ? file.path.replace(PART_RE, '.gguf') : file.path
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        label: quantLabelFor(file.path) ?? 'GGUF',
        files: [],
        totalSize: 0,
        partCount: 0,
        expectedParts: partMatch ? parseInt(partMatch[2], 10) : null,
        isExtra: isExtraFile(file.path)
      }
      groups.set(key, group)
    }
    group.files.push(file)
    group.totalSize += file.size
    group.partCount += 1
  }

  for (const group of groups.values()) {
    group.files.sort((a, b) => a.path.localeCompare(b.path))
  }

  const sorted = [...groups.values()].sort((a, b) => {
    if (a.isExtra !== b.isExtra) return a.isExtra ? 1 : -1
    return a.totalSize - b.totalSize
  })
  return { groups: sorted, others }
}
