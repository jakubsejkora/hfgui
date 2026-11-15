import type { Pick } from '@shared/picks'
import { cn } from '@/lib/utils'

/**
 * Discover's one bold element: Mac memory sizes as stops on a line, each with
 * the model it would get. The line is solid as far as this Mac reaches and
 * dashed beyond, so "what fits" reads at a glance; a stop shows its pick.
 *
 * Stops are evenly spaced, not to scale — 8 to 96 GB on a true scale would
 * crush the small Macs most people have into one corner.
 */
export function MemoryLadder({
  stops,
  macTier,
  macMemoryGB,
  selected,
  onSelect
}: {
  stops: Array<{ tier: number; pick: Pick }>
  /** The biggest tier this Mac reaches. */
  macTier: number
  macMemoryGB: number
  selected: number
  onSelect(tier: number): void
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Mac memory"
      data-testid="memory-ladder"
      className="grid"
      style={{ gridTemplateColumns: `repeat(${stops.length}, minmax(0, 1fr))` }}
    >
      {stops.map(({ tier, pick }, i) => {
        const reached = tier <= macTier
        const isMac = tier === macTier
        const isSelected = tier === selected
        // The segment into this stop is solid when both ends are within reach.
        const inSolid = i > 0 && reached
        const outSolid = i < stops.length - 1 && stops[i + 1].tier <= macTier
        return (
          <button
            key={tier}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={`${tier} GB: ${pick.name}${isMac ? ', this Mac' : reached ? '' : ', needs more memory than this Mac'}`}
            onClick={() => onSelect(tier)}
            data-testid={`ladder-${tier}`}
            className={cn(
              'group relative flex cursor-pointer flex-col items-center gap-2 rounded-lg px-1 pt-1 pb-2 text-center transition-colors',
              'focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
              isSelected ? 'bg-muted/70' : 'hover:bg-muted/40'
            )}
          >
            {/* The line, drawn as two halves per stop so each segment can be solid or dashed. */}
            <span aria-hidden className="relative flex h-5 w-full items-center justify-center">
              {i > 0 && (
                <span
                  className={cn(
                    'absolute top-1/2 left-0 right-1/2 -translate-y-1/2 border-t-2',
                    inSolid ? 'border-foreground/80' : 'border-dashed border-muted-foreground/35'
                  )}
                />
              )}
              {i < stops.length - 1 && (
                <span
                  className={cn(
                    'absolute top-1/2 left-1/2 right-0 -translate-y-1/2 border-t-2',
                    outSolid ? 'border-foreground/80' : 'border-dashed border-muted-foreground/35'
                  )}
                />
              )}
              <span
                className={cn(
                  'relative z-10 rounded-full transition-transform',
                  isMac
                    ? 'size-4 bg-foreground ring-4 ring-foreground/15'
                    : reached
                      ? 'size-2.5 bg-foreground'
                      : 'size-2.5 border-2 border-muted-foreground/45 bg-background',
                  isSelected && !isMac && 'scale-125'
                )}
              />
            </span>
            <span className={cn('text-xs font-semibold tabular-nums', !reached && 'text-muted-foreground')}>
              {tier} GB
            </span>
            <span
              className={cn(
                'line-clamp-2 text-xs leading-snug',
                reached ? 'text-foreground/85' : 'text-muted-foreground/80'
              )}
            >
              {pick.name}
            </span>
            {isMac && (
              <span className="rounded-full bg-foreground px-2 py-0.5 text-[10.5px] font-medium text-background tabular-nums">
                This Mac · {macMemoryGB} GB
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
