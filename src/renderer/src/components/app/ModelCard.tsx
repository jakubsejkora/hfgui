import type { ModelSummary } from '@/lib/hfApi'
import { useModelDragSource } from '@/lib/useModelDragSource'
import { cn } from '@/lib/utils'
import { FormatBadge, GatedBadge } from './badges'
import { ModelAvatar } from './ModelAvatar'
import { ModelContextMenu } from './ModelMenus'
import { LibraryPill, ModelStats, SizeLabel } from './modelFacts'

/**
 * A search result, or a recommendation with its reason (`note`) and what it's
 * for (`eyebrow`). The root stays a draggable <button> — the e2e drivers read
 * `[data-testid="model-grid"] > button` and drag the first one.
 */
export function ModelCard({
  model,
  onClick,
  eyebrow,
  title,
  subtitle,
  note,
  className
}: {
  model: ModelSummary
  onClick(): void
  eyebrow?: string
  /** Instead of the repo's name and author — a recommendation says "Qwen3.8 27B". */
  title?: string
  subtitle?: string
  note?: string
  className?: string
}) {
  const { dragProps, wasDragged } = useModelDragSource(model)

  return (
    <ModelContextMenu model={model}>
      <button
        type="button"
        onClick={() => {
          if (!wasDragged()) onClick()
        }}
        {...dragProps}
        data-repo-id={model.id}
        className={cn(
          'group flex w-full cursor-pointer flex-col gap-3 rounded-xl border bg-card p-4 text-left text-card-foreground shadow-xs',
          'transition-[border-color,box-shadow] duration-150 hover:border-foreground/20 hover:shadow-md',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
          'data-[state=open]:border-foreground/20',
          className
        )}
      >
        {eyebrow && (
          <div className="-mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{eyebrow}</div>
        )}
        <div className="flex w-full items-start gap-3">
          <ModelAvatar repoId={model.id} size="md" />
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="truncate text-sm leading-tight font-semibold">{title ?? model.name}</div>
            <div className="mt-1 truncate text-xs text-muted-foreground">{subtitle ?? model.author}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <LibraryPill repoId={model.id} />
            {model.gated !== false && <GatedBadge />}
            <FormatBadge format={model.format} />
          </div>
        </div>
        {note && <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">{note}</p>}
        <div className="mt-auto flex w-full items-center gap-3 text-xs text-muted-foreground tabular-nums">
          <ModelStats model={model} />
          <span className="ml-auto flex min-w-0">
            <SizeLabel model={model} />
          </span>
        </div>
      </button>
    </ModelContextMenu>
  )
}

export function ModelCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex items-start gap-3">
        <div className="size-9 animate-pulse rounded-lg bg-muted" />
        <div className="flex-1 space-y-2 pt-0.5">
          <div className="h-3.5 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
    </div>
  )
}
