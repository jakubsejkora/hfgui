import { Clock, Download, Heart } from 'lucide-react'
import { formatParams } from '@shared/fit'
import { formatBytes, formatCount, relativeTime } from '@shared/format'
import type { ModelSummary } from '@/lib/hfApi'
import { useLibraryState } from '@/lib/useLibraryState'
import { StatusPill } from './badges'
import { Tip } from './Tip'

/** "8B · ≈4.9 GB" — what the user would actually download, honestly labelled. */
export function SizeLabel({ model }: { model: ModelSummary }) {
  const params = formatParams(model.params)
  const size = model.sizeBytes != null ? formatBytes(model.sizeBytes) : null
  if (!params && !size) return null
  const hint =
    model.format === 'gguf'
      ? 'Estimated size of the Q4_K_M file hfgui usually recommends. Every quant’s exact size is in the details.'
      : model.sizeEstimated
        ? 'Estimated from the parameter count and the quantization in the repo name.'
        : 'Size of the weights.'
  return (
    <Tip content={hint}>
      <span className="truncate font-medium text-foreground/80 tabular-nums">
        {params}
        {params && size && <span className="text-muted-foreground"> · </span>}
        {size && (
          <>
            {model.sizeEstimated && '≈'}
            {size}
          </>
        )}
      </span>
    </Tip>
  )
}

export function ModelStats({ model }: { model: ModelSummary }) {
  return (
    <>
      <span className="flex shrink-0 items-center gap-1 whitespace-nowrap" aria-label={`${formatCount(model.downloads)} downloads`}>
        <Download className="size-3" />
        {formatCount(model.downloads)}
      </span>
      <span className="flex shrink-0 items-center gap-1 whitespace-nowrap" aria-label={`${formatCount(model.likes)} likes`}>
        <Heart className="size-3" />
        {formatCount(model.likes)}
      </span>
      <span className="flex shrink-0 items-center gap-1 whitespace-nowrap" aria-label={`Updated ${relativeTime(model.lastModified)}`}>
        <Clock className="size-3" />
        {relativeTime(model.lastModified)}
      </span>
    </>
  )
}

/** "In library" once downloaded, a live percentage while downloading. */
export function LibraryPill({ repoId }: { repoId: string }) {
  const state = useLibraryState(repoId)
  if (state === null) return null
  return state === 'done' ? (
    <StatusPill tone="success">In library</StatusPill>
  ) : (
    <StatusPill tone="success" pulse className="tabular-nums">
      {state}%
    </StatusPill>
  )
}
