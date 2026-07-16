import {
  FolderOpen,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  X
} from 'lucide-react'
import { formatBytes, formatEta, formatSpeed } from '@shared/format'
import type { DownloadJobSnapshot } from '@shared/types'
import type { ProgressInfo } from '@/lib/downloadsStore'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tooltip } from '@/components/ui/tooltip'

const DEST_LABEL: Record<string, string> = {
  lmstudio: 'LM Studio',
  exo: 'exo',
  custom: 'Custom'
}

const STATE_LABEL: Record<string, string> = {
  queued: 'Queued',
  downloading: 'Downloading',
  verifying: 'Verifying',
  completed: 'Completed',
  paused: 'Paused',
  cancelled: 'Stopped',
  error: 'Failed'
}

export function DownloadRow({
  job,
  progress
}: {
  job: DownloadJobSnapshot
  progress?: ProgressInfo
}) {
  const g = window.hfgui
  const active = job.state === 'downloading' || job.state === 'verifying'
  const showBar = active || job.state === 'paused' || job.state === 'queued'
  const fraction = job.totalBytes > 0 ? job.bytesDone / job.totalBytes : 0
  const multiFile = job.files.length > 1

  return (
    <div className="border-border bg-surface flex flex-col gap-2.5 rounded-xl border p-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-text truncate text-[13px] font-semibold">{job.displayName}</span>
            {job.format !== 'other' && (
              <Badge variant={job.format === 'gguf' ? 'accent' : 'mlx'}>
                {job.format.toUpperCase()}
              </Badge>
            )}
            <Tooltip content={job.jobDir}>
              <span>
                <Badge variant="outline">{DEST_LABEL[job.destination.kind]}</Badge>
              </span>
            </Tooltip>
          </div>
          <div className="text-faint truncate text-[11px]">{job.repoId}</div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {job.state === 'downloading' || job.state === 'queued' ? (
            <>
              {job.state === 'downloading' && (
                <Tooltip content="Pause">
                  <Button variant="ghost" size="icon" onClick={() => void g.pauseDownload(job.jobId)} data-testid={`pause-${job.jobId}`}>
                    <Pause className="h-4 w-4" />
                  </Button>
                </Tooltip>
              )}
              <Tooltip content="Cancel and delete partial file">
                <Button variant="ghost" size="icon" onClick={() => void g.cancelDownload(job.jobId)} data-testid={`cancel-${job.jobId}`}>
                  <X className="h-4 w-4" />
                </Button>
              </Tooltip>
            </>
          ) : job.state === 'paused' ? (
            <>
              <Tooltip content="Resume">
                <Button variant="ghost" size="icon" onClick={() => void g.resumeDownload(job.jobId)} data-testid={`resume-${job.jobId}`}>
                  <Play className="h-4 w-4" />
                </Button>
              </Tooltip>
              <Tooltip content="Cancel and delete partial file">
                <Button variant="ghost" size="icon" onClick={() => void g.cancelDownload(job.jobId)}>
                  <X className="h-4 w-4" />
                </Button>
              </Tooltip>
            </>
          ) : job.state === 'error' || job.state === 'cancelled' ? (
            <>
              <Tooltip content="Retry">
                <Button variant="ghost" size="icon" onClick={() => void g.resumeDownload(job.jobId)}>
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </Tooltip>
              <Tooltip content="Remove from list">
                <Button variant="ghost" size="icon" onClick={() => void g.removeDownload(job.jobId)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </Tooltip>
            </>
          ) : (
            <>
              <Tooltip content="Reveal in Finder">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void g.revealPath(`${job.jobDir}/${job.files[0]?.path ?? ''}`)}
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </Tooltip>
              <Tooltip content="Remove from list">
                <Button variant="ghost" size="icon" onClick={() => void g.removeDownload(job.jobId)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </Tooltip>
            </>
          )}
        </div>
      </div>

      {showBar && (
        <Progress value={fraction} indeterminate={job.state === 'verifying'} />
      )}

      <div className="text-muted flex items-center gap-2 text-[11px]">
        <span
          className={
            job.state === 'error'
              ? 'text-danger font-medium'
              : job.state === 'completed'
                ? 'text-success font-medium'
                : 'font-medium'
          }
        >
          {STATE_LABEL[job.state] ?? job.state}
        </span>
        {active && progress && progress.bytesPerSec > 0 && (
          <>
            <span>·</span>
            <span>{formatSpeed(progress.bytesPerSec)}</span>
            <span>·</span>
            <span>{formatEta(progress.etaSec)} left</span>
          </>
        )}
        {showBar && (
          <>
            <span>·</span>
            <span>
              {formatBytes(job.bytesDone)} / {formatBytes(job.totalBytes)}
            </span>
          </>
        )}
        {job.state === 'completed' && <span>· {formatBytes(job.totalBytes)}</span>}
        {active && multiFile && progress?.currentFile && (
          <span className="text-faint ml-auto max-w-[45%] truncate font-mono">
            {progress.currentFile}
          </span>
        )}
      </div>

      {job.error && (
        <div className="text-danger text-[11px]">
          {job.error.message}
        </div>
      )}
    </div>
  )
}
