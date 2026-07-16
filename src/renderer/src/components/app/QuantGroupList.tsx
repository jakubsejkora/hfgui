import { ArrowDownToLine, Check, Loader2 } from 'lucide-react'
import { formatBytes } from '@shared/format'
import type { QuantGroup } from '@shared/quant'
import type { DownloadJobSnapshot } from '@shared/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RamFitBadge } from './RamFitBadge'

interface QuantGroupListProps {
  groups: QuantGroup[]
  jobFor(group: QuantGroup): DownloadJobSnapshot | undefined
  onDownload(group: QuantGroup): void
  downloadDisabled: boolean
}

function JobStateChip({ job }: { job: DownloadJobSnapshot }) {
  switch (job.state) {
    case 'completed':
      return (
        <Badge variant="success">
          <Check className="h-3 w-3" /> Downloaded
        </Badge>
      )
    case 'downloading':
    case 'verifying': {
      const pct = job.totalBytes > 0 ? Math.round((job.bytesDone / job.totalBytes) * 100) : 0
      return (
        <Badge variant="accent">
          <Loader2 className="h-3 w-3 animate-spin" /> {pct}%
        </Badge>
      )
    }
    case 'queued':
      return <Badge variant="accent">Queued</Badge>
    case 'paused':
      return <Badge variant="warning">Paused</Badge>
    default:
      return null
  }
}

export function QuantGroupList({ groups, jobFor, onDownload, downloadDisabled }: QuantGroupListProps) {
  const main = groups.filter((g) => !g.isExtra)
  const extras = groups.filter((g) => g.isExtra)

  const renderRow = (group: QuantGroup) => {
    const job = jobFor(group)
    const busy = job && job.state !== 'cancelled' && job.state !== 'error'
    return (
      <div
        key={group.key}
        className="border-border bg-surface-2 flex items-center gap-3 rounded-xl border px-3.5 py-2.5"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[13px] font-semibold">{group.label}</span>
            {group.partCount > 1 && (
              <Badge variant="outline">{group.partCount} parts</Badge>
            )}
          </div>
          <div className="text-faint truncate font-mono text-[11px]" title={group.key}>
            {group.key.split('/').pop()}
          </div>
        </div>
        <span className="text-muted shrink-0 text-xs font-medium">{formatBytes(group.totalSize)}</span>
        <RamFitBadge sizeBytes={group.totalSize} />
        {busy && job ? (
          <JobStateChip job={job} />
        ) : (
          <Button
            variant="primary"
            size="sm"
            disabled={downloadDisabled}
            onClick={() => onDownload(group)}
            data-testid={`download-${group.label}`}
          >
            <ArrowDownToLine className="h-3.5 w-3.5" />
            Get
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {main.map(renderRow)}
      {extras.length > 0 && (
        <>
          <div className="text-faint mt-2 text-[11px] font-medium tracking-wide uppercase">
            Companion files (vision projector, imatrix)
          </div>
          {extras.map(renderRow)}
        </>
      )}
    </div>
  )
}
