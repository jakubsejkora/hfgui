import { Play, RefreshCw, RotateCcw } from 'lucide-react'
import type { DownloadJobSnapshot } from '@shared/types'
import { jobActions } from '@/lib/actions'
import { jobFraction } from '@/lib/downloadsStore'
import { useUpdates } from '@/lib/queries'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { StatusPill } from './badges'

/**
 * Where an existing download of these files stands, in place of a Download
 * button. Failed and stopped jobs offer Retry here rather than a fresh
 * download — two jobs on one set of files would write one .partial twice.
 */
export function JobChip({ job }: { job: DownloadJobSnapshot }) {
  const pct = Math.floor(jobFraction(job) * 100)
  const update = useUpdates().data?.[job.jobId]
  switch (job.state) {
    case 'completed':
      return (
        <span className="flex items-center gap-1.5">
          <StatusPill tone="success">Downloaded</StatusPill>
          {update?.status === 'available' && (
            <Button variant="outline" size="xs" onClick={() => void jobActions.update(job.jobId)}>
              <RefreshCw /> Update
            </Button>
          )}
          {job.destination.kind === 'lmstudio' && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => void jobActions.openInLmStudio(job.repoId)}
              data-testid={`use-${job.jobId}`}
            >
              <Play /> Use
            </Button>
          )}
        </span>
      )
    case 'downloading':
    case 'verifying':
      return (
        <span className="flex w-28 items-center gap-2" aria-label={`Downloading, ${pct}%`}>
          <Progress
            value={pct}
            indeterminate={job.state === 'verifying'}
            indicatorClassName="bg-brand"
            className="h-1.5 flex-1"
          />
          <span className="w-8 text-right text-xs text-muted-foreground tabular-nums">{pct}%</span>
        </span>
      )
    case 'queued':
      return <StatusPill tone="neutral">Queued</StatusPill>
    case 'paused':
      return (
        <span className="flex items-center gap-1.5">
          <StatusPill tone="warning" className="tabular-nums">
            Paused · {pct}%
          </StatusPill>
          <Button variant="outline" size="xs" onClick={() => void jobActions.resume(job.jobId)}>
            <Play /> Resume
          </Button>
        </span>
      )
    case 'error':
    case 'cancelled':
      return (
        <span className="flex items-center gap-1.5">
          <StatusPill tone={job.state === 'error' ? 'danger' : 'neutral'}>
            {job.state === 'error' ? 'Failed' : 'Stopped'}
          </StatusPill>
          <Button variant="outline" size="xs" onClick={() => void jobActions.resume(job.jobId)}>
            <RotateCcw /> {job.state === 'error' ? 'Retry' : 'Start over'}
          </Button>
        </span>
      )
  }
}
