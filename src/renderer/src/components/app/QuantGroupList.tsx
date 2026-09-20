import { ArrowDownToLine, Check, Loader2, Play } from 'lucide-react'
import { useMemo } from 'react'
import { formatBytes } from '@shared/format'
import { recommendQuant, type QuantGroup } from '@shared/quant'
import type { DownloadJobSnapshot } from '@shared/types'
import { useSystemInfo } from '@/lib/queries'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { RamFitBadge } from './RamFitBadge'

interface QuantGroupListProps {
  groups: QuantGroup[]
  jobFor(group: QuantGroup): DownloadJobSnapshot | undefined
  onDownload(group: QuantGroup): void
  downloadDisabled: boolean
}

/** Shared job-state chip; also used for the whole-repo row in the detail sheet. */
export function JobStateChip({ job }: { job: DownloadJobSnapshot }) {
  switch (job.state) {
    case 'completed':
      return (
        <span className="flex items-center gap-1.5">
          <Badge variant="success">
            <Check className="h-3 w-3" /> Downloaded
          </Badge>
          {job.destination.kind === 'lmstudio' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void window.hfgui.openInLmStudio(job.repoId)}
              data-testid={`use-${job.jobId}`}
            >
              <Play className="h-3 w-3" />
              Use
            </Button>
          )}
        </span>
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
      return (
        <span className="flex items-center gap-1.5">
          <Badge variant="warning">Paused</Badge>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Resume"
            onClick={() => void window.hfgui.resumeDownload(job.jobId)}
          >
            <Play className="h-3 w-3" />
            Resume
          </Button>
        </span>
      )
    default:
      return null
  }
}

export function QuantGroupList({ groups, jobFor, onDownload, downloadDisabled }: QuantGroupListProps) {
  const { data: sys } = useSystemInfo()
  const main = groups.filter((g) => !g.isExtra)
  const extras = groups.filter((g) => g.isExtra)
  const recommendedKey = useMemo(
    () => (sys ? recommendQuant(groups, sys.totalMemoryBytes) : null),
    [groups, sys]
  )

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
            {group.partCount > 1 && group.isComplete && (
              <Badge variant="outline">{group.partCount} parts</Badge>
            )}
            {!group.isComplete && (
              <Tooltip content="This variant is missing parts on Hugging Face and would not load — check the repo.">
                <span>
                  <Badge variant="danger">
                    {group.partCount}/{group.expectedParts} parts
                  </Badge>
                </span>
              </Tooltip>
            )}
            {group.key === recommendedKey && (
              <Tooltip
                content={`Best quality-for-size that fits your ${formatBytes(sys?.totalMemoryBytes ?? 0)} RAM`}
              >
                <span>
                  <Badge variant="accent">Recommended</Badge>
                </span>
              </Tooltip>
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
        ) : group.isComplete ? (
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
        ) : null}
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
