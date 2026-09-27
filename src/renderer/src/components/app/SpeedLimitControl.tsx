import { Gauge } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatSpeed } from '@shared/format'
import {
  DEFAULT_SPEED_LIMIT,
  SPEED_STEPS,
  capOnEnable,
  formatCap,
  formatMbit,
  nearestStep
} from '@shared/speedLimit'
import type { Settings } from '@shared/types'
import { totalSpeed, useDownloadsStore } from '@/lib/downloadsStore'
import { useInvalidate, useSettings } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'

/**
 * The on/off switch and stepped slider for the download speed cap. The same
 * component sits in Settings and in the top bar's speed popover, so the two
 * places can never disagree about what the cap is.
 */
export function SpeedLimitControl({ className }: { className?: string }) {
  const { data: settings } = useSettings()
  const invalidate = useInvalidate()
  const jobs = useDownloadsStore((s) => s.jobs)
  const progress = useDownloadsStore((s) => s.progress)

  const enabled = settings?.speedLimitEnabled ?? false
  const cap = settings?.speedLimitBytesPerSec ?? DEFAULT_SPEED_LIMIT

  // The slider moves freely while dragging; the cap is only saved on release.
  const [draft, setDraft] = useState(() => nearestStep(cap))
  useEffect(() => setDraft(nearestStep(cap)), [cap])
  const [note, setNote] = useState<string | null>(null)

  const save = async (patch: Partial<Settings>): Promise<void> => {
    await window.hfgui.setSettings(patch)
    invalidate(['settings'])
  }

  const toggle = (on: boolean): void => {
    if (!on) {
      setNote(null)
      void save({ speedLimitEnabled: false })
      return
    }
    const current = totalSpeed(jobs, progress)
    const next = capOnEnable(cap, current)
    setNote(
      next !== cap
        ? `Capped below half of the current ${formatSpeed(current)}, so the rest of your connection stays free. Adjust as you like.`
        : null
    )
    void save({ speedLimitEnabled: true, speedLimitBytesPerSec: next })
  }

  const shown = SPEED_STEPS[draft]

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-start gap-3">
        <Gauge className="text-accent mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold">Limit download speed</div>
          <div className="text-faint text-[11px] leading-relaxed">
            Leaves room on your connection for calls and browsing. Shared across all
            downloads, and applies immediately — including to downloads already running.
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={toggle} ariaLabel="Limit download speed" />
      </div>

      <div className={cn('flex items-center gap-4 pl-7', !enabled && 'opacity-45')}>
        <Slider
          value={draft}
          min={0}
          max={SPEED_STEPS.length - 1}
          onValueChange={setDraft}
          onValueCommit={(i) => {
            setNote(null)
            void save({ speedLimitBytesPerSec: SPEED_STEPS[i] })
          }}
          disabled={!enabled}
          ariaLabel="Download speed limit"
          className="w-auto flex-1"
        />
        <div className="w-24 shrink-0 text-right">
          <div className="tnum text-sm font-semibold" data-testid="speed-limit-label">
            {formatCap(shown)}
          </div>
          <div className="text-faint tnum text-[10px]">{formatMbit(shown)}</div>
        </div>
      </div>

      {note && enabled && <p className="text-accent pl-7 text-[11px] leading-relaxed">{note}</p>}
    </div>
  )
}
