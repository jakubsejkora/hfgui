import { Clock, Download, Heart, Lock } from 'lucide-react'
import { useRef } from 'react'
import { formatBytes, formatCount, relativeTime } from '@shared/format'
import type { ModelSummary } from '@/lib/hfApi'
import { MODEL_DRAG_MIME, useDragStore } from '@/lib/dragStore'
import { Badge } from '@/components/ui/badge'
import { Artwork } from '@/components/ui/sleeve'

function FormatBadge({ format }: { format: ModelSummary['format'] }) {
  if (format === 'gguf') return <Badge variant="accent">GGUF</Badge>
  if (format === 'mlx') return <Badge variant="mlx">MLX</Badge>
  return null
}

export function ModelCard({ model, onClick }: { model: ModelSummary; onClick(): void }) {
  const sizeBytes = model.ggufTotalFileSize ?? model.safetensorsSizeBytes
  const beginDrag = useDragStore((s) => s.begin)
  const endDrag = useDragStore((s) => s.end)
  // Chromium can still fire a click after a drag; without this, dropping a card
  // on a destination would also open the detail sheet on top of it.
  const dragged = useRef(false)

  return (
    <button
      onClick={() => {
        if (dragged.current) return
        onClick()
      }}
      draggable
      data-repo-id={model.id}
      onDragStart={(e) => {
        dragged.current = true
        const payload = { repoId: model.id, name: model.name, format: model.format }
        e.dataTransfer.effectAllowed = 'copy'
        e.dataTransfer.setData(MODEL_DRAG_MIME, JSON.stringify(payload))
        // Bonus: dragging a card into any other app yields its Hub link.
        e.dataTransfer.setData('text/plain', `https://huggingface.co/${model.id}`)
        beginDrag(payload)
      }}
      onDragEnd={() => {
        endDrag()
        setTimeout(() => {
          dragged.current = false
        }, 0)
      }}
      className="sleeve sleeve-interactive no-drag flex w-full cursor-pointer items-center gap-3 p-2 text-left"
    >
      <Artwork repoId={model.id} className="h-[68px] w-[68px] rounded-[15px]">
        <div className="scrim relative flex h-full flex-col justify-end p-2">
          <span
            className="tnum relative z-[1] text-[11px] font-semibold text-white"
            style={{ textShadow: '0 1px 3px rgb(0 0 0 / 0.55)' }}
          >
            {sizeBytes != null
              ? formatBytes(sizeBytes)
              : model.paramCount
                ? `${formatCount(model.paramCount)}p`
                : ''}
          </span>
        </div>
      </Artwork>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5 pr-1.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-text truncate text-[13px] leading-snug font-semibold">
              {model.name}
            </div>
            <div className="text-muted truncate text-xs">{model.author}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {model.gated !== false && (
              <Badge variant="warning">
                <Lock className="h-3 w-3" /> gated
              </Badge>
            )}
            <FormatBadge format={model.format} />
          </div>
        </div>

        <div className="text-muted tnum flex w-full items-center gap-3 text-xs">
          <span className="flex items-center gap-1">
            <Download className="h-3 w-3" />
            {formatCount(model.downloads)}
          </span>
          <span className="flex items-center gap-1">
            <Heart className="h-3 w-3" />
            {formatCount(model.likes)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {relativeTime(model.lastModified)}
          </span>
        </div>
      </div>
    </button>
  )
}
