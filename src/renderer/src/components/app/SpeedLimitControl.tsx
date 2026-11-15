import { useEffect, useId, useState } from 'react'
import { formatSpeed } from '@shared/format'
import {
  DEFAULT_SPEED_LIMIT,
  SPEED_STEPS,
  capOnEnable,
  formatCap,
  formatMbit,
  nearestStep
} from '@shared/speedLimit'
import { totalSpeed, useDownloadsStore } from '@/lib/downloadsStore'
import { useSettings, useUpdateSettings } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'

/**
 * The on/off switch and stepped slider for the download speed cap. The same
 * component sits in Settings and in the header's speed popover, so the two
 * places can never disagree about what the cap is.
 */
export function SpeedLimitControl({ className }: { className?: string }) {
  const { data: settings } = useSettings()
  const update = useUpdateSettings()
  const speed = useDownloadsStore((s) => totalSpeed(s.jobs, s.progress))

  const switchId = useId()
  const enabled = settings?.speedLimitEnabled ?? false
  const cap = settings?.speedLimitBytesPerSec ?? DEFAULT_SPEED_LIMIT

  // The slider moves freely while dragging; the cap is only saved on release.
  const [draft, setDraft] = useState(() => nearestStep(cap))
  useEffect(() => setDraft(nearestStep(cap)), [cap])
  const [note, setNote] = useState<string | null>(null)

  const toggle = (on: boolean): void => {
    if (!on) {
      setNote(null)
      update.mutate({ speedLimitEnabled: false })
      return
    }
    const next = capOnEnable(cap, speed)
    setNote(
      next !== cap
        ? `Capped below half of the current ${formatSpeed(speed)}, so the rest of your connection stays free. Adjust as you like.`
        : null
    )
    update.mutate({ speedLimitEnabled: true, speedLimitBytesPerSec: next })
  }

  const shown = SPEED_STEPS[draft]

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <Label htmlFor={switchId} className="text-sm font-medium">
            Limit download speed
          </Label>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Leaves room on your connection for calls and browsing. Shared across all downloads,
            and applies immediately — including to downloads already running.
          </p>
        </div>
        <Switch
          id={switchId}
          checked={enabled}
          onCheckedChange={toggle}
          aria-label="Limit download speed"
        />
      </div>

      <div className={cn('flex items-center gap-4', !enabled && 'opacity-50')}>
        <Slider
          value={[draft]}
          min={0}
          max={SPEED_STEPS.length - 1}
          step={1}
          onValueChange={([i]) => setDraft(i)}
          onValueCommit={([i]) => {
            setNote(null)
            update.mutate({ speedLimitBytesPerSec: SPEED_STEPS[i] })
          }}
          disabled={!enabled}
          aria-label="Download speed limit"
          className="flex-1"
        />
        <div className="w-20 shrink-0 text-right">
          <div className="text-sm font-semibold tabular-nums" data-testid="speed-limit-label">
            {formatCap(shown)}
          </div>
          <div className="text-[11px] text-muted-foreground tabular-nums">{formatMbit(shown)}</div>
        </div>
      </div>

      {note && enabled && <p className="text-xs leading-relaxed text-muted-foreground">{note}</p>}
    </div>
  )
}
