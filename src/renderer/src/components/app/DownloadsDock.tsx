import { ArrowDownToLine, ChevronUp, Pause, Play, X } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { destinationRejection } from '@shared/destinationRules'
import { formatBytes, formatEta, formatSpeed } from '@shared/format'
import { compareJobs, isInProgress } from '@shared/jobStates'
import type { DestinationInfo, DownloadJobSnapshot, ModelFormat } from '@shared/types'
import { jobActions } from '@/lib/actions'
import { requestCancel } from '@/lib/cancelStore'
import { STALL_MS, jobFraction, useDownloadsStore } from '@/lib/downloadsStore'
import { useDragStore } from '@/lib/dragStore'
import { useDropDownload } from '@/lib/useDropDownload'
import { useNow } from '@/lib/useNow'
import { useDestinations } from '@/lib/queries'
import { useUiStore } from '@/lib/uiStore'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ModelAvatar } from './ModelAvatar'
import { Tip } from './Tip'

/*
 * Wording note: this component must never render the literal strings
 * "Completed" or "No downloads yet." (any case), nor an aria-label of "Remove
 * from list", and no data-testid here may start with "download-". The e2e
 * drivers match those on the Downloads view and on quant buttons; a duplicate
 * here would make them match the wrong element.
 */

function DockJob({ job }: { job: DownloadJobSnapshot }) {
  const progress = useDownloadsStore((s) => s.progress[job.jobId])
  const paused = job.state === 'paused'
  const running = job.state === 'downloading'
  const now = useNow(running)
  const stalled = running && (!progress || now - progress.at > STALL_MS)
  const pct = Math.floor(jobFraction(job) * 100)

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3" data-testid={`dock-job-${job.jobId}`}>
      <ModelAvatar repoId={job.repoId} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{job.displayName}</div>
        <div className="flex items-center gap-1.5 truncate text-xs text-muted-foreground tabular-nums">
          <span>
            {formatBytes(job.bytesDone)} / {formatBytes(job.totalBytes)}
          </span>
          {paused ? (
            <span>· Paused</span>
          ) : job.state === 'queued' ? (
            <span>· Waiting for a slot</span>
          ) : job.state === 'verifying' ? (
            <span>· Verifying</span>
          ) : stalled ? (
            <span>· Waiting for data…</span>
          ) : progress?.verifying ? (
            <span>
              · Checking downloaded data ·{' '}
              {progress.verifying.total > 0
                ? Math.floor((progress.verifying.done / progress.verifying.total) * 100)
                : 0}
              %
            </span>
          ) : progress && progress.bytesPerSec > 0 ? (
            <span>
              · {formatSpeed(progress.bytesPerSec)} · {formatEta(progress.etaSec)} left
            </span>
          ) : null}
        </div>
      </div>
      <div className="hidden w-36 shrink-0 items-center gap-2 sm:flex">
        <Progress
          value={pct}
          indeterminate={job.state === 'verifying'}
          indicatorClassName={running && !stalled ? 'bg-brand' : 'bg-muted-foreground/50'}
          className="flex-1"
        />
        <span className="w-8 text-right text-xs text-muted-foreground tabular-nums">{pct}%</span>
      </div>
      <Tip content={paused ? 'Resume' : 'Pause'}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${paused ? 'Resume' : 'Pause'} ${job.displayName}`}
          data-testid={`dock-toggle-${job.jobId}`}
          disabled={job.state === 'verifying'}
          onClick={() => void (paused ? jobActions.resume(job.jobId) : jobActions.pause(job.jobId))}
        >
          {paused ? <Play /> : <Pause />}
        </Button>
      </Tip>
      <Tip content="Stop and delete the partial file">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Stop ${job.displayName}`}
          data-testid={`dock-stop-${job.jobId}`}
          disabled={job.state === 'verifying'}
          onClick={() => requestCancel(job)}
          className="hover:text-destructive"
        >
          <X />
        </Button>
      </Tip>
    </div>
  )
}

function DestinationBay({
  info,
  format,
  onChoose
}: {
  info: DestinationInfo
  format: ModelFormat
  onChoose(info: DestinationInfo): void
}) {
  const [over, setOver] = useState(false)
  // A custom folder that was never chosen is still a valid target: dropping
  // there asks for one (see useDropDownload).
  const rejection = destinationRejection(info.kind, format, info)

  return (
    <button
      type="button"
      data-testid={`drop-target-${info.kind}`}
      disabled={!!rejection}
      title={rejection ?? undefined}
      onClick={() => !rejection && onChoose(info)}
      onDragOver={(e) => {
        if (rejection) {
          e.dataTransfer.dropEffect = 'none'
          return
        }
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (!rejection) onChoose(info)
      }}
      className={cn(
        'flex h-14 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed px-3 transition-colors',
        over ? 'border-foreground bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
        rejection && 'cursor-not-allowed opacity-40'
      )}
    >
      <span className="text-sm font-medium">{info.label}</span>
      <span className="truncate text-xs">
        {rejection ?? (over ? 'Release to download' : info.path ? 'Drop here' : 'Drop to choose a folder')}
      </span>
    </button>
  )
}

/**
 * Live downloads at a glance from any page, and the landing pad for a dragged
 * model. The Downloads page keeps history, Finder access and exo registration —
 * this is transport, that is the record.
 */
export function DownloadsDock() {
  const jobs = useDownloadsStore((s) => s.jobs)
  const view = useUiStore((s) => s.view)
  const setView = useUiStore((s) => s.setView)
  const expanded = useUiStore((s) => s.dockExpanded)
  const setExpanded = useUiStore((s) => s.setDockExpanded)
  const dragModel = useDragStore((s) => s.model)
  const { data: destinations } = useDestinations()
  const dropDownload = useDropDownload()
  const element = useRef<HTMLElement>(null)

  // What matters now first: a running job leads, not merely the newest one.
  const running = Object.values(jobs)
    .filter((j) => isInProgress(j.state))
    .sort(compareJobs)
  const showBays = dragModel !== null && !!destinations
  // Hidden on the Downloads page: everything here is already on screen there.
  const visible = showBays || (running.length > 0 && view !== 'downloads')

  // Toasts sit above the dock by reading this off the root element.
  useLayoutEffect(() => {
    const root = document.documentElement
    if (!visible || !element.current) {
      root.style.setProperty('--dock-h', '0px')
      return
    }
    const node = element.current
    const observer = new ResizeObserver(() =>
      root.style.setProperty('--dock-h', `${node.offsetHeight}px`)
    )
    observer.observe(node)
    return () => {
      observer.disconnect()
      root.style.setProperty('--dock-h', '0px')
    }
  }, [visible])

  if (!visible) return null
  const extra = running.length - 1

  return (
    <section
      ref={element}
      aria-label="Active downloads"
      data-testid="downloads-dock"
      className="z-20 shrink-0 animate-in px-4 pb-4 duration-300 fade-in-0 slide-in-from-bottom-4"
    >
      <div className="flex flex-col gap-2 rounded-xl border bg-card p-2.5 shadow-lg">
        {showBays && dragModel && destinations ? (
          <div className="flex items-center gap-2">
            <span className="flex shrink-0 items-center gap-2 px-2 text-xs font-medium text-muted-foreground">
              <ArrowDownToLine className="size-4" />
              Save {dragModel.name} to
            </span>
            {destinations.map((info) => (
              <DestinationBay
                key={info.kind}
                info={info}
                format={dragModel.format}
                onChoose={(target) => void dropDownload(dragModel, target)}
              />
            ))}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 pl-1">
              <DockJob job={running[0]} />
              {extra > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExpanded(!expanded)}
                  aria-expanded={expanded}
                  data-testid="dock-toggle"
                  className="shrink-0"
                >
                  +{extra} more
                  <ChevronUp className={cn('transition-transform', !expanded && 'rotate-180')} />
                </Button>
              )}
            </div>
            {expanded && extra > 0 && (
              <div className="flex max-h-[34vh] flex-col gap-2 overflow-y-auto border-t pt-2 pl-1">
                {running.slice(1).map((job) => (
                  <DockJob key={job.jobId} job={job} />
                ))}
                <Button
                  variant="link"
                  size="sm"
                  className="self-center text-muted-foreground"
                  onClick={() => setView('downloads')}
                >
                  See all downloads
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
