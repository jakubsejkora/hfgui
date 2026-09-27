import { Slider as SliderPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

export interface SliderProps {
  value: number
  min: number
  max: number
  step?: number
  onValueChange(value: number): void
  /** Fires once when a drag ends (or per key press) — for values worth saving only when settled. */
  onValueCommit?(value: number): void
  disabled?: boolean
  className?: string
  ariaLabel?: string
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onValueChange,
  onValueCommit,
  disabled,
  className,
  ariaLabel
}: SliderProps) {
  return (
    <SliderPrimitive.Root
      value={[value]}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onValueChange={([v]) => onValueChange(v)}
      onValueCommit={onValueCommit ? ([v]) => onValueCommit(v) : undefined}
      className={cn(
        'no-drag relative flex h-5 w-44 cursor-pointer touch-none items-center select-none',
        'data-[disabled]:cursor-not-allowed',
        className
      )}
    >
      <SliderPrimitive.Track className="slot relative h-1.5 grow rounded-full">
        <SliderPrimitive.Range className="from-accent to-accent-hover absolute h-full rounded-full bg-gradient-to-r" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={ariaLabel}
        className="focus-visible:ring-accent/60 bg-text block h-4 w-4 rounded-full shadow-[var(--shadow-sleeve)] outline-none focus-visible:ring-2"
      />
    </SliderPrimitive.Root>
  )
}
