import { Gauge } from 'lucide-react'
import { Popover } from 'radix-ui'
import { useState } from 'react'
import { formatSpeed } from '@shared/format'
import { effectiveSpeedLimit, formatCap, formatSpeedInCapUnit } from '@shared/speedLimit'
import { selectBusyCount, selectRunningCount, totalSpeed, useDownloadsStore } from '@/lib/downloadsStore'
import { useSettings } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { Dot } from './badges'
import { SpeedLimitControl } from './SpeedLimitControl'

/**
 * Live download speed, and the way into the speed cap. Visible while anything
 * downloads or while a cap is on — a capped-but-idle app still says so, so
 * "why is this slow?" always has an answer on screen.
 */
export function SpeedChip() {
  const { data: settings } = useSettings()
  const busyCount = useDownloadsStore(selectBusyCount)
  const runningCount = useDownloadsStore(selectRunningCount)
  const speed = useDownloadsStore((s) => totalSpeed(s.jobs, s.progress))
  const [open, setOpen] = useState(false)
  const cap = settings ? effectiveSpeedLimit(settings) : null

  // Stay mounted while open, so a download finishing mid-adjustment
  // doesn't pull the popover out from under the pointer.
  if (!open && busyCount === 0 && cap === null) return null

  const label =
    cap !== null
      ? busyCount > 0
        ? `${formatSpeedInCapUnit(speed)} / ${formatCap(cap)}`
        : `Limit ${formatCap(cap)}`
      : speed > 0
        ? formatSpeed(speed)
        : runningCount > 0
          ? // Running with nothing arriving: connecting, or checking a resumed file.
            `${runningCount} active`
          : busyCount > 0
            ? `${busyCount} queued`
            : 'No limit'

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          data-testid="speed-chip"
          aria-label={`Download speed ${label}. Set a speed limit`}
          className={cn(
            'inline-flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-md border px-2.5 text-xs font-medium shadow-xs transition-colors',
            'hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
            open && 'bg-accent'
          )}
        >
          {cap !== null ? (
            <Gauge className="size-3.5 text-muted-foreground" />
          ) : (
            <Dot tone="success" pulse={speed > 0} />
          )}
          <span className="tabular-nums">{label}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 w-[23rem] rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <SpeedLimitControl />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
