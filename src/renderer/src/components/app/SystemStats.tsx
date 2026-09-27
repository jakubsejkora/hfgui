import { useQuery } from '@tanstack/react-query'
import { Gauge } from 'lucide-react'
import { Popover } from 'radix-ui'
import { useState } from 'react'
import { defaultDestination } from '@shared/destinationRules'
import { formatBytes, formatSpeed } from '@shared/format'
import { effectiveSpeedLimit, formatCap, formatSpeedInCapUnit } from '@shared/speedLimit'
import { ACTIVE_JOB_STATES, totalSpeed, useDownloadsStore } from '@/lib/downloadsStore'
import { useDestinations, useSettings, useSystemInfo } from '@/lib/queries'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { SpeedLimitControl } from './SpeedLimitControl'

function Stat({
  label,
  tone,
  pulse,
  tip
}: {
  label: string
  tone: string
  pulse?: boolean
  tip: string
}) {
  return (
    <Tooltip content={tip} side="bottom">
      <span className="text-muted flex cursor-default items-center gap-2 text-[11px] font-medium tracking-wide uppercase">
        <span
          className={cn('h-1.5 w-1.5 rounded-full', tone, pulse && 'pulse-dot')}
          style={{ boxShadow: '0 0 8px currentColor' }}
        />
        {label}
      </span>
    </Tooltip>
  )
}

/**
 * Live download speed, and the way into the speed cap. Visible while anything
 * downloads or while a cap is on — a capped-but-idle app still says so, so
 * "why is this slow?" always has an answer on screen.
 */
function SpeedChip({ activeCount, speed }: { activeCount: number; speed: number }) {
  const { data: settings } = useSettings()
  const [open, setOpen] = useState(false)
  const cap = settings ? effectiveSpeedLimit(settings) : null

  // Stay mounted while open, so a download finishing mid-adjustment
  // doesn't pull the popover out from under the pointer.
  if (!open && activeCount === 0 && cap === null) return null

  const label =
    cap !== null
      ? activeCount > 0
        ? `${formatSpeedInCapUnit(speed)} / ${formatCap(cap)}`
        : `Limit ${formatCap(cap)}`
      : speed > 0
        ? formatSpeed(speed)
        : activeCount > 0
          ? `${activeCount} queued`
          : 'No limit'

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        {/* no-drag: the top bar is the window's drag handle. */}
        <button
          type="button"
          data-testid="speed-chip"
          aria-label={`Download speed ${label}. Set a speed limit`}
          className={cn(
            'no-drag -mx-2 flex cursor-pointer items-center gap-2 rounded-full px-2 py-1 text-[11px] font-medium tracking-wide uppercase transition-colors',
            open ? 'bg-surface-2 text-text' : 'text-muted hover:bg-surface-2 hover:text-text'
          )}
        >
          {cap !== null ? (
            <Gauge className="text-accent h-3 w-3" />
          ) : (
            <span
              className="text-success bg-success pulse-dot h-1.5 w-1.5 rounded-full"
              style={{ boxShadow: '0 0 8px currentColor' }}
            />
          )}
          <span className="tnum">{label}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={14}
          collisionPadding={12}
          // no-drag here too: the top of the popover can overlap the top bar's drag area.
          className="sleeve no-drag animate-pop-in z-[60] w-[23rem] p-4 shadow-[var(--shadow-float)] focus:outline-none"
        >
          <SpeedLimitControl />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/**
 * The concepts show a CPU/RAM readout. We show only what we actually measure:
 * installed memory (the number every "fits RAM" hint is computed against),
 * free space where downloads land, and live throughput.
 *
 * Deliberately no CPU%: os.loadavg() is not a percentage and getCPUUsage()
 * measures hfgui itself — either one under a "CPU" label would be a lie. And no
 * free-RAM figure: os.freemem() excludes cached pages on macOS, so it reads as
 * near-zero on a perfectly healthy Mac.
 *
 * The disk chip renders a size only, never a path — scripts/e2e-mlx.mjs asserts
 * on the first `/Users/…` text node on the page, which must remain the
 * destination line inside the model sheet. The tooltip is unmounted until hover.
 */
export function SystemStats() {
  const { data: system } = useSystemInfo()
  const { data: destinations } = useDestinations()
  const jobs = useDownloadsStore((s) => s.jobs)
  const progress = useDownloadsStore((s) => s.progress)

  const target = destinations ? defaultDestination('gguf', destinations) : null
  const { data: disk } = useQuery({
    queryKey: ['disk-space', target?.path],
    queryFn: () => window.hfgui.checkDiskSpace(target!.path!),
    enabled: !!target?.path,
    staleTime: 30_000,
    retry: false
  })

  const activeCount = Object.values(jobs).filter((j) => ACTIVE_JOB_STATES.has(j.state)).length
  const speed = totalSpeed(jobs, progress)
  const freeRatio = disk && disk.totalBytes > 0 ? disk.freeBytes / disk.totalBytes : 1

  return (
    <div className="flex shrink-0 items-center gap-5" data-testid="system-stats">
      {system && (
        <Stat
          label={`RAM ${formatBytes(system.totalMemoryBytes)}`}
          tone="text-accent bg-accent"
          tip="Installed memory. Models need to fit here with headroom — this is the number the “fits RAM” hints use."
        />
      )}
      {disk && target && (
        <Stat
          label={`${formatBytes(disk.freeBytes)} free`}
          tone={
            freeRatio < 0.02
              ? 'text-danger bg-danger'
              : freeRatio < 0.1
                ? 'text-warning bg-warning'
                : 'text-success bg-success'
          }
          tip={`Free space where ${target.label} downloads land`}
        />
      )}
      <SpeedChip activeCount={activeCount} speed={speed} />
    </div>
  )
}
