import { RotateCcw } from 'lucide-react'
import { repoFor, type PickFormat } from '@shared/discover'
import type { Pick } from '@shared/picks'
import { HfApiError } from '@/lib/hfApi'
import { useModelSummary } from '@/lib/queries'
import { useUiStore } from '@/lib/uiStore'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ModelCard, ModelCardSkeleton } from './ModelCard'

/**
 * One of hfgui's picks, with the Hub's live facts (size, downloads, fit). The
 * card opens the model like any other, and drags onto a destination.
 */
export function PickCard({
  pick,
  format,
  eyebrow,
  className
}: {
  pick: Pick
  format: PickFormat
  eyebrow?: string
  className?: string
}) {
  const repoId = repoFor(pick, format)
  const openModel = useUiStore((s) => s.openModel)
  const query = useModelSummary(repoId)
  const model = query.data

  if (query.isError) {
    const gone = query.error instanceof HfApiError && query.error.status === 404
    return (
      <div
        className={cn(
          'flex flex-col justify-center gap-2 rounded-xl border border-dashed p-4 text-xs text-muted-foreground',
          className
        )}
      >
        <span>
          <span className="font-medium text-foreground">{pick.name}</span> —{' '}
          {gone ? 'this repository was removed or renamed on the Hub.' : 'couldn’t load it from Hugging Face.'}
        </span>
        {!gone && (
          <Button variant="ghost" size="xs" className="self-start" onClick={() => void query.refetch()}>
            <RotateCcw /> Retry
          </Button>
        )}
      </div>
    )
  }
  if (!model) return <ModelCardSkeleton />

  const packager = model.author.toLowerCase() === pick.maker.toLowerCase() ? null : model.author
  return (
    <ModelCard
      model={model}
      onClick={() => openModel(model.id)}
      eyebrow={eyebrow}
      title={pick.name}
      subtitle={packager ? `${pick.maker} · via ${packager}` : pick.maker}
      note={pick.why}
      className={className}
    />
  )
}
