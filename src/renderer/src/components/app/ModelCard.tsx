import { Clock, Download, HardDrive, Heart, Lock } from 'lucide-react'
import { formatBytes, formatCount, hashHue, relativeTime } from '@shared/format'
import type { ModelSummary } from '@/lib/hfApi'
import { Badge } from '@/components/ui/badge'

function FormatBadge({ format }: { format: ModelSummary['format'] }) {
  if (format === 'gguf') return <Badge variant="accent">GGUF</Badge>
  if (format === 'mlx') return <Badge variant="mlx">MLX</Badge>
  return null
}

export function ModelCard({ model, onClick }: { model: ModelSummary; onClick(): void }) {
  const hue = hashHue(model.author)
  const sizeBytes = model.ggufTotalFileSize ?? model.safetensorsSizeBytes

  return (
    <button
      onClick={onClick}
      className="border-border bg-surface hover:border-border-strong hover:bg-surface-2 flex cursor-pointer flex-col gap-3 rounded-xl border p-4 text-left transition-colors"
    >
      <div className="flex w-full items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
          style={{
            backgroundColor: `hsl(${hue} var(--avatar-bg-sl))`,
            color: `hsl(${hue} var(--avatar-fg-sl))`
          }}
        >
          {(model.author[0] ?? '?').toUpperCase()}
        </div>
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

      <div className="text-muted flex w-full items-center gap-3 text-xs">
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
        {sizeBytes != null ? (
          <span className="text-faint ml-auto flex items-center gap-1 font-medium">
            <HardDrive className="h-3 w-3" />
            {formatBytes(sizeBytes)}
          </span>
        ) : model.paramCount ? (
          <span className="text-faint ml-auto font-medium">
            {formatCount(model.paramCount)} params
          </span>
        ) : null}
      </div>
    </button>
  )
}
