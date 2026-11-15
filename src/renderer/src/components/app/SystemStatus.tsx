import { comfortableModelBytes } from '@shared/fit'
import { formatBytes } from '@shared/format'
import { useDefaultDestination, useDiskSpace, useSystemInfo } from '@/lib/queries'
import { cn, destinationHolding } from '@/lib/utils'
import { Tip } from './Tip'

/**
 * Only what we actually measure: installed memory (the number every "fits RAM"
 * hint is computed against) and free space where downloads land.
 *
 * Deliberately no CPU% and no free-RAM figure: os.loadavg() is not a percentage,
 * getCPUUsage() measures hfgui itself, and os.freemem() excludes cached pages on
 * macOS, so it reads near zero on a healthy Mac.
 *
 * Sizes only, never paths — scripts/e2e-mlx.mjs asserts on the first `/Users/…`
 * text on the page, which must stay the destination line in the model sheet.
 */
export function SystemStatus() {
  const { data: system } = useSystemInfo()
  const target = useDefaultDestination('gguf')
  const { data: disk } = useDiskSpace(target?.path)

  const used = disk && disk.totalBytes > 0 ? 1 - disk.freeBytes / disk.totalBytes : null
  const free = disk && disk.totalBytes > 0 ? disk.freeBytes / disk.totalBytes : 1
  const tone = free < 0.02 ? 'bg-destructive' : free < 0.1 ? 'bg-warning' : 'bg-sidebar-foreground/70'

  if (!system && !disk) return null
  return (
    <div
      data-testid="system-stats"
      className="mx-2 flex flex-col gap-2.5 rounded-lg border border-sidebar-border bg-background/60 p-3 text-xs dark:bg-sidebar-accent/40"
    >
      {disk && target && used !== null && (
        <Tip content={`Free space on the drive with ${destinationHolding(target)}`} side="right">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium">Storage</span>
              <span className="text-muted-foreground tabular-nums">{formatBytes(disk.freeBytes)} free</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-sidebar-foreground/10">
              <div className={cn('h-full rounded-full', tone)} style={{ width: `${Math.max(2, used * 100)}%` }} />
            </div>
          </div>
        </Tip>
      )}
      {system && (
        <Tip
          content={`Installed memory — what every “fits RAM” hint is measured against. Models up to ~${formatBytes(comfortableModelBytes(system.totalMemoryBytes))} fit comfortably.`}
          side="right"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium">Memory</span>
            <span className="text-muted-foreground tabular-nums">{formatBytes(system.totalMemoryBytes)}</span>
          </div>
        </Tip>
      )}
    </div>
  )
}
