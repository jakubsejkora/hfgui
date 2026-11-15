import { ArrowDown } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import { formatParams } from '@shared/fit'
import { formatBytes, formatCount, relativeTime } from '@shared/format'
import type { ModelSummary, SortKey } from '@/lib/hfApi'
import { usePrefs } from '@/lib/prefsStore'
import { useModelDragSource } from '@/lib/useModelDragSource'
import { cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { FormatBadge, GatedBadge } from './badges'
import { ModelAvatar } from './ModelAvatar'
import { ModelContextMenu, ModelRowMenu } from './ModelMenus'
import { LibraryPill } from './modelFacts'

/** "image-text-to-video" → "Image text to video", for tags without a nicer name. */
function humanizeTag(tag: string): string {
  const words = tag.replace(/[-_]+/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const TASK_LABEL: Record<string, string> = {
  'text-generation': 'Text generation',
  'image-text-to-text': 'Vision',
  'automatic-speech-recognition': 'Speech to text',
  'text-to-speech': 'Text to speech',
  'feature-extraction': 'Embeddings'
}

/** Column headers that map onto the Hub's own sort orders (always descending). */
function SortHead({
  sortKey,
  className,
  children
}: {
  sortKey: SortKey
  className?: string
  children: string
}) {
  const sort = usePrefs((s) => s.sort)
  const setPrefs = usePrefs((s) => s.set)
  const active = sort === sortKey
  return (
    <TableHead className={cn('text-right', className)} aria-sort={active ? 'descending' : 'none'}>
      <button
        type="button"
        onClick={() => setPrefs({ sort: sortKey })}
        className={cn(
          '-mr-1 inline-flex cursor-pointer items-center gap-1 rounded px-1 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
          active && 'text-foreground'
        )}
      >
        <ArrowDown className={cn('size-3', !active && 'opacity-0')} />
        {children}
      </button>
    </TableHead>
  )
}

function Row({ model, onOpen }: { model: ModelSummary; onOpen(): void }) {
  const { dragProps, wasDragged } = useModelDragSource(model)
  const size = model.sizeBytes != null ? formatBytes(model.sizeBytes) : '—'
  const onKeyDown = (e: KeyboardEvent<HTMLTableRowElement>): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen()
    }
  }
  return (
    <ModelContextMenu model={model}>
      <TableRow
        tabIndex={0}
        aria-label={`${model.name} by ${model.author}`}
        onClick={() => {
          if (!wasDragged()) onOpen()
        }}
        onKeyDown={onKeyDown}
        {...dragProps}
        data-repo-id={model.id}
        className="cursor-pointer focus-visible:bg-muted/60 focus-visible:outline-none data-[state=open]:bg-muted/50"
      >
        <TableCell className="max-w-0 py-2.5 pl-4">
          <div className="flex min-w-0 items-center gap-3">
            <ModelAvatar repoId={model.id} size="sm" />
            <div className="min-w-0">
              <div className="truncate font-medium">{model.name}</div>
              <div className="truncate text-xs text-muted-foreground">{model.author}</div>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1 pl-2">
              <LibraryPill repoId={model.id} />
              {model.gated !== false && <GatedBadge />}
            </div>
          </div>
        </TableCell>
        <TableCell>
          <FormatBadge format={model.format} />
        </TableCell>
        <TableCell className="hidden text-muted-foreground @4xl:table-cell">
          {model.pipelineTag ? (TASK_LABEL[model.pipelineTag] ?? humanizeTag(model.pipelineTag)) : '—'}
        </TableCell>
        <TableCell className="text-right tabular-nums">
          <span className="text-muted-foreground">{formatParams(model.params) ?? ''}</span>
          {model.params != null && <span className="text-muted-foreground"> · </span>}
          {model.sizeEstimated && model.sizeBytes != null && '≈'}
          {size}
        </TableCell>
        <TableCell className="text-right tabular-nums">{formatCount(model.downloads)}</TableCell>
        <TableCell className="hidden text-right tabular-nums @3xl:table-cell">
          {formatCount(model.likes)}
        </TableCell>
        <TableCell className="hidden text-right text-muted-foreground tabular-nums @3xl:table-cell">
          {relativeTime(model.lastModified)}
        </TableCell>
        <TableCell className="w-10 pr-2 text-right">
          <ModelRowMenu model={model} />
        </TableCell>
      </TableRow>
    </ModelContextMenu>
  )
}

/** The dense, scannable view of search results — Shopify index-table style. */
export function ModelTable({
  models,
  onOpen
}: {
  models: ModelSummary[]
  onOpen(id: string): void
}) {
  return (
    <div className="@container overflow-hidden rounded-xl border bg-card shadow-xs">
      <Table data-testid="model-table" className="table-fixed">
        <TableHeader className="bg-muted/40 [&_th]:text-xs [&_th]:text-muted-foreground">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-auto pl-4">Model</TableHead>
            <TableHead className="w-20">Format</TableHead>
            <TableHead className="hidden w-36 @4xl:table-cell">Task</TableHead>
            <TableHead className="w-36 text-right">Size</TableHead>
            <SortHead sortKey="downloads" className="w-28">
              Downloads
            </SortHead>
            <SortHead sortKey="likes" className="hidden w-20 @3xl:table-cell">
              Likes
            </SortHead>
            <SortHead sortKey="lastModified" className="hidden w-28 @3xl:table-cell">
              Updated
            </SortHead>
            <TableHead className="w-12">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {models.map((m) => (
            <Row key={m.id} model={m} onOpen={() => onOpen(m.id)} />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
