import {
  ArrowDownToLine,
  Copy,
  ExternalLink,
  FolderOpen,
  KeyRound,
  MoreHorizontal,
  PanelRightOpen,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Trash2,
  X
} from 'lucide-react'
import { describeChanges } from '@shared/changes'
import { formatBytes, formatEta, formatSpeed, timeAgo } from '@shared/format'
import { errorCopy, isInProgress } from '@shared/jobStates'
import type { DownloadJobSnapshot, ExoRegistration } from '@shared/types'
import { copyText, jobActions, openExternal, openOnHub } from '@/lib/actions'
import { requestCancel, requestDelete } from '@/lib/cancelStore'
import { STALL_MS, jobFraction, useDownloadsStore } from '@/lib/downloadsStore'
import { useStorageReport, useUpdates } from '@/lib/queries'
import { useNow } from '@/lib/useNow'
import { useUiStore } from '@/lib/uiStore'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { JobStatusBadge, StatusPill } from './badges'
import { ModelAvatar } from './ModelAvatar'
import { Tip } from './Tip'

const DEST_LABEL: Record<DownloadJobSnapshot['destination']['kind'], string> = {
  lmstudio: 'LM Studio',
  exo: 'exo',
  custom: 'Models folder'
}

const EXO_DASHBOARD_URL = 'http://localhost:52415'

/** "Aug 29": the day a version was downloaded. */
const shortDate = (ms: number): string =>
  new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

/** Downloading or verifying: stop it first (Cancel), then it can be discarded. */
const isRunningState = (state: DownloadJobSnapshot['state']): boolean =>
  state === 'downloading' || state === 'verifying'

function revealTarget(job: DownloadJobSnapshot): string {
  return job.files.length === 1 ? `${job.jobDir}/${job.files[0].path}` : job.jobDir
}

const percentOf = (done: number, total: number): number =>
  total > 0 ? Math.floor((done / total) * 100) : 0

/** Live speed for a running job; null when there is no fresh sample. */
function useLiveProgress(job: DownloadJobSnapshot) {
  const progress = useDownloadsStore((s) => s.progress[job.jobId])
  const running = job.state === 'downloading'
  const now = useNow(running)
  const stalled = running && (!progress || now - progress.at > STALL_MS)
  return { progress: running && !stalled ? progress : undefined, stalled }
}

function ExoLine({ job, reg }: { job: DownloadJobSnapshot; reg: ExoRegistration | null }) {
  if (!reg) {
    return (
      <span className="flex items-center gap-1.5">
        <Spinner className="size-3" /> Adding to exo…
      </span>
    )
  }
  const ok = reg.status === 'registered' || reg.status === 'already-listed'
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className={ok ? 'text-foreground/80' : undefined}>
        {reg.status === 'registered'
          ? 'Added to exo'
          : reg.status === 'already-listed'
            ? 'Ready in exo'
            : reg.status === 'exo-offline'
              ? "exo isn't running — start it, then retry"
              : `exo couldn't add it${reg.message ? `: ${reg.message}` : ''}`}
      </span>
      {ok ? (
        <Button
          variant="link"
          size="xs"
          className="h-auto px-0"
          onClick={() => openExternal(EXO_DASHBOARD_URL)}
          data-testid={`exo-dashboard-${job.jobId}`}
        >
          Open exo dashboard <ExternalLink />
        </Button>
      ) : (
        <Button
          variant="link"
          size="xs"
          className="h-auto px-0"
          onClick={() => void jobActions.retryExo(job.jobId)}
          data-testid={`retry-exo-${job.jobId}`}
        >
          <RotateCcw /> Retry
        </Button>
      )}
    </span>
  )
}

function StatusCell({ job, missing }: { job: DownloadJobSnapshot; missing: boolean }) {
  const { progress, stalled } = useLiveProgress(job)
  const update = useUpdates().data?.[job.jobId]
  if (missing) {
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <div>
          <StatusPill tone="warning">Files missing</StatusPill>
        </div>
        <div className="text-xs leading-relaxed whitespace-normal text-muted-foreground">
          Moved or deleted outside hfgui.
        </div>
      </div>
    )
  }
  const pct = Math.floor(jobFraction(job) * 100)
  const showBar = isInProgress(job.state)

  // A resumed file is checked against its checksum once all of it is on disk:
  // local work that sends no network progress, so say so rather than "stalled".
  const verifying = progress?.verifying
  let meta: React.ReactNode = null
  if (verifying) {
    meta = `Checking downloaded data · ${percentOf(verifying.done, verifying.total)}%`
  } else if (job.state === 'downloading') {
    meta = (
      <>
        {formatBytes(job.bytesDone)} of {formatBytes(job.totalBytes)}
        {progress && progress.bytesPerSec > 0 && (
          <>
            {' '}
            · {formatSpeed(progress.bytesPerSec)} · {formatEta(progress.etaSec)} left
          </>
        )}
      </>
    )
  } else if (job.state === 'verifying') {
    meta = 'Checking file sizes…'
  } else if (job.state === 'queued') {
    meta = job.bytesDone > 0 ? `Waiting for a slot · ${pct}% done` : 'Waiting for a slot'
  } else if (job.state === 'paused') {
    meta = `${formatBytes(job.bytesDone)} of ${formatBytes(job.totalBytes)} · ${pct}%`
  } else if (job.state === 'completed') {
    meta = job.supersededBy ? (
      <span className="whitespace-normal">
        {job.completedAt ? `Downloaded ${shortDate(job.completedAt)}, ` : ''}kept beside the newer version
      </span>
    ) : update?.status === 'available' ? (
      <span className="whitespace-normal text-foreground">
        Update available · {describeChanges(update.changed)}
        {update.fetchBytes > 0 && <> · {formatBytes(update.fetchBytes)} to download</>}
      </span>
    ) : job.destination.kind === 'exo' ? (
      <ExoLine job={job} reg={job.exoRegistration} />
    ) : (
      <>
        {formatBytes(job.totalBytes)}
        {job.completedAt && (
          <>
            {' '}
            · {job.update ? 'updated' : 'finished'} {timeAgo(job.completedAt)}
          </>
        )}
      </>
    )
  } else if (job.state === 'cancelled') {
    meta = 'Stopped — the partial file was deleted'
  } else if (job.error) {
    const copy = errorCopy(job.error)
    meta = (
      <Tip content={job.error.message}>
        <span className="line-clamp-2 whitespace-normal">
          <span className="font-medium text-destructive">{copy.title}.</span> {copy.hint}
        </span>
      </Tip>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <JobStatusBadge state={verifying ? 'verifying' : job.state} stalled={stalled} />
        {showBar && (
          <span className="text-xs text-muted-foreground tabular-nums">{pct}%</span>
        )}
      </div>
      {showBar && (
        <Progress
          value={pct}
          indeterminate={job.state === 'verifying'}
          indicatorClassName={job.state === 'downloading' && !stalled ? 'bg-brand' : 'bg-muted-foreground/50'}
        />
      )}
      {meta && (
        <div
          className={cn(
            'text-xs text-muted-foreground tabular-nums',
            job.state === 'error' ? 'leading-relaxed' : 'truncate'
          )}
        >
          {meta}
        </div>
      )}
    </div>
  )
}

function RowActions({ job, missing }: { job: DownloadJobSnapshot; missing: boolean }) {
  const openModel = useUiStore((s) => s.openModel)
  const openTokenDialog = useUiStore((s) => s.setTokenDialogOpen)
  const update = useUpdates().data?.[job.jobId]
  const { state } = job

  return (
    <div className="flex items-center justify-end gap-1">
      {state === 'completed' && !missing && update?.status === 'available' && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => void jobActions.update(job.jobId)}
          data-testid={`update-${job.jobId}`}
        >
          <RefreshCw /> Update
        </Button>
      )}
      {state === 'completed' && missing && (
        <Button size="sm" variant="outline" onClick={() => void jobActions.redownload(job)}>
          <ArrowDownToLine /> Download again
        </Button>
      )}
      {state === 'completed' && !missing && job.destination.kind === 'lmstudio' && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => void jobActions.openInLmStudio(job.repoId)}
          data-testid={`open-lmstudio-${job.jobId}`}
        >
          <Play /> Open in LM Studio
        </Button>
      )}
      {state === 'error' && job.error?.code === 'auth-required' && (
        <Button size="sm" variant="outline" onClick={() => openTokenDialog(true)}>
          <KeyRound /> Add token
        </Button>
      )}
      {(state === 'downloading' || state === 'queued') && (
        <Tip content="Pause">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Pause"
            onClick={() => void jobActions.pause(job.jobId)}
            data-testid={`pause-${job.jobId}`}
          >
            <Pause />
          </Button>
        </Tip>
      )}
      {state === 'paused' && (
        <Tip content="Resume">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Resume"
            onClick={() => void jobActions.resume(job.jobId)}
            data-testid={`resume-${job.jobId}`}
          >
            <Play />
          </Button>
        </Tip>
      )}
      {(state === 'error' || state === 'cancelled') && (
        // A cancel deletes the partial, so retrying a Stopped job starts from zero.
        <Tip content={state === 'cancelled' ? 'Start over' : 'Retry'}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={state === 'cancelled' ? 'Start over' : 'Retry'}
            onClick={() => void jobActions.resume(job.jobId)}
          >
            <RotateCcw />
          </Button>
        </Tip>
      )}
      {isInProgress(state) && (
        <Tip content="Cancel and delete the partial file">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Cancel and delete partial file"
            onClick={() => requestCancel(job)}
            data-testid={`cancel-${job.jobId}`}
            className="hover:text-destructive"
            disabled={state === 'verifying'}
          >
            <X />
          </Button>
        </Tip>
      )}
      {state === 'error' && (
        <Tip content="Discard — delete what it downloaded">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Discard download"
            onClick={() => requestDelete(job)}
            className="hover:text-destructive"
          >
            <Trash2 />
          </Button>
        </Tip>
      )}
      {(state === 'completed' || state === 'cancelled') && (
        <Tip content="Remove from list — files stay on disk">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Remove from list"
            onClick={() => void jobActions.remove(job.jobId)}
          >
            <Trash2 />
          </Button>
        </Tip>
      )}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${job.displayName}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => void jobActions.reveal(revealTarget(job))}>
            <FolderOpen /> Reveal in Finder
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copyText(job.jobDir, 'Folder path')}>
            <Copy /> Copy folder path
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => openModel(job.repoId)}>
            <PanelRightOpen /> Model details
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openOnHub(job.repoId)}>
            <ExternalLink /> Open on Hugging Face
          </DropdownMenuItem>
          {(state === 'completed' ? !missing : !isRunningState(state)) && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => requestDelete(job)}>
                <Trash2 /> {state === 'completed' ? 'Delete files…' : 'Discard download…'}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function DownloadsTable({ jobs }: { jobs: DownloadJobSnapshot[] }) {
  const { data: report } = useStorageReport()
  const missing = new Set(report?.missing ?? [])
  return (
    <div className="@container overflow-hidden rounded-xl border bg-card shadow-xs">
      <Table className="table-fixed">
        <TableHeader className="bg-muted/40 [&_th]:text-xs [&_th]:text-muted-foreground">
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">Model</TableHead>
            <TableHead className="w-60 @4xl:w-72">Status</TableHead>
            <TableHead className="hidden w-24 @5xl:table-cell">Added</TableHead>
            <TableHead className="w-64 pr-4 text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => (
            <TableRow key={job.jobId} data-job-id={job.jobId}>
              <TableCell className="max-w-0 py-3 pl-4">
                <div className="flex min-w-0 items-center gap-3">
                  <ModelAvatar repoId={job.repoId} size="sm" />
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{job.displayName}</span>
                      {job.supersededBy ? (
                        <Badge variant="outline" className="shrink-0 font-normal text-muted-foreground">
                          Older version
                        </Badge>
                      ) : (
                        job.update?.pendingMove && (
                          <Badge variant="outline" className="shrink-0 font-normal">
                            Update
                          </Badge>
                        )
                      )}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {job.repoId} · {DEST_LABEL[job.destination.kind]}
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell className="max-w-0 py-3">
                <StatusCell job={job} missing={missing.has(job.jobId)} />
              </TableCell>
              <TableCell className="hidden text-xs text-muted-foreground tabular-nums @5xl:table-cell">
                {timeAgo(job.createdAt)}
              </TableCell>
              <TableCell className="py-3 pr-4">
                <RowActions job={job} missing={missing.has(job.jobId)} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
