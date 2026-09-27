import { ChevronDown, Pause, Play, X } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { destinationRejection } from '@shared/destinationRules'
import { formatBytes, formatEta, formatSpeed } from '@shared/format'
import type { DestinationInfo, DownloadJobSnapshot, ModelFormat } from '@shared/types'
import { ACTIVE_JOB_STATES, sortedJobs, useDownloadsStore } from '@/lib/downloadsStore'
import { useDragStore } from '@/lib/dragStore'
import { useDropDownload } from '@/lib/useDropDownload'
import { useDestinations } from '@/lib/queries'
import { useUiStore } from '@/lib/uiStore'
import { cn } from '@/lib/utils'
import { Progress } from '@/components/ui/progress'
import { Artwork } from '@/components/ui/sleeve'
import { Tooltip } from '@/components/ui/tooltip'

/*
 * Wording note: this component must never render the literal strings
 * "Completed" or "No downloads yet.", nor an aria-label of "Remove from list",
 * and no data-testid here may start with "download-". The e2e drivers match
 * those on the Downloads view and on quant buttons; a duplicate here would make
 * them match the wrong element.
 */

function DockJob({ job }: { job: DownloadJobSnapshot }) {
  const progress = useDownloadsStore((s) => s.progress[job.jobId])
  const fraction = job.totalBytes > 0 ? job.bytesDone / job.totalBytes : 0
  const paused = job.state === 'paused'

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3" data-testid={`dock-job-${job.jobId}`}>
      <Artwork repoId={job.repoId} size="chip" className="h-9 w-9 rounded-[11px]" />
      <div className="min-w-0 flex-1">
        <div className="text-text truncate text-[13px] font-medium">{job.displayName}</div>
        <div className="text-faint tnum flex items-center gap-1.5 text-[11px]">
          <span>
            {formatBytes(job.bytesDone)} / {formatBytes(job.totalBytes)}
          </span>
          {paused ? (
            <span>· Paused</span>
          ) : progress && progress.bytesPerSec > 0 ? (
            <>
              <span>· {formatSpeed(progress.bytesPerSec)}</span>
              <span>· {formatEta(progress.etaSec)} left</span>
            </>
          ) : null}
        </div>
      </div>
      <Progress
        value={fraction}
        indeterminate={job.state === 'verifying'}
        className="hidden w-32 shrink-0 sm:block"
      />
      <Tooltip content={paused ? 'Resume' : 'Pause'}>
        <button
          aria-label={`${paused ? 'Resume' : 'Pause'} ${job.displayName}`}
          data-testid={`dock-toggle-${job.jobId}`}
          onClick={() =>
            void (paused
              ? window.hfgui.resumeDownload(job.jobId)
              : window.hfgui.pauseDownload(job.jobId))
          }
          className="text-muted hover:text-text hover:bg-surface-3 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors"
        >
          {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        </button>
      </Tooltip>
      <Tooltip content="Stop and delete the partial file">
        <button
          aria-label={`Stop ${job.displayName}`}
          data-testid={`dock-stop-${job.jobId}`}
          onClick={() => void window.hfgui.cancelDownload(job.jobId)}
          className="text-muted hover:text-danger hover:bg-surface-3 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </Tooltip>
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
  const rejection = destinationRejection(info.kind, format, info)

  return (
    <button
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
        'flex h-11 flex-1 cursor-pointer flex-col items-center justify-center rounded-bezel border border-dashed px-3 transition-colors',
        over
          ? 'border-accent bg-accent/12 text-text'
          : 'border-border-strong text-muted hover:text-text',
        rejection && 'cursor-not-allowed opacity-40'
      )}
    >
      <span className="text-[13px] font-medium">{info.label}</span>
      <span className="text-faint truncate text-[10px]">
        {rejection ?? (over ? 'Release to download' : 'Drop here')}
      </span>
    </button>
  )
}

/**
 * The persistent "receiver slot": live downloads at a glance from any view, and
 * the landing pad for a dragged model card. The Downloads view keeps history,
 * Finder access and exo registration — this is transport, that is the record.
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

  const running = sortedJobs(jobs).filter(
    (j) => ACTIVE_JOB_STATES.has(j.state) || j.state === 'paused'
  )
  const showBays = dragModel !== null && !!destinations
  // Hidden on the Downloads view: everything here is already on screen there.
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
      aria-label="Downloads"
      data-testid="downloads-dock"
      className="animate-dock-in z-20 shrink-0 px-6 pb-4"
    >
      <div className="slot flex flex-col gap-2 rounded-[28px] px-3 py-2.5">
        {showBays && dragModel && destinations ? (
          <div className="flex items-center gap-2">
            <span className="text-faint shrink-0 pl-2 text-[11px] font-medium tracking-wide uppercase">
              Download {dragModel.name} to
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
            <div className="flex items-center gap-3">
              <DockJob job={running[0]} />
              {extra > 0 && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  aria-expanded={expanded}
                  data-testid="dock-toggle"
                  className="text-muted hover:text-text hover:bg-surface-3 flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-full px-2.5 text-[11px] font-medium transition-colors"
                >
                  +{extra} more
                  <ChevronDown
                    className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')}
                  />
                </button>
              )}
            </div>
            {expanded && extra > 0 && (
              <div className="border-border flex max-h-[34vh] flex-col gap-2 overflow-y-auto border-t pt-2">
                {running.slice(1).map((job) => (
                  <DockJob key={job.jobId} job={job} />
                ))}
                <button
                  onClick={() => setView('downloads')}
                  className="text-muted hover:text-text cursor-pointer py-1 text-[11px] underline"
                >
                  See all downloads
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
