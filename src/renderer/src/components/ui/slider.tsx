import { Slider as SliderPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

export interface SliderProps {
  value: number
  min: number
  max: number
  step?: number
  onValueChange(value: number): void
  className?: string
  ariaLabel?: string
}

export function Slider({ value, min, max, step = 1, onValueChange, className, ariaLabel }: SliderProps) {
  return (
    <SliderPrimitive.Root
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={([v]) => onValueChange(v)}
      className={cn('no-drag relative flex h-5 w-44 cursor-pointer touch-none items-center select-none', className)}
    >
      <SliderPrimitive.Track className="bg-surface-3 relative h-1.5 grow rounded-full">
        <SliderPrimitive.Range className="bg-accent absolute h-full rounded-full" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={ariaLabel}
        className="focus-visible:ring-accent/60 block h-4 w-4 rounded-full bg-white shadow outline-none focus-visible:ring-2"
      />
    </SliderPrimitive.Root>
  )
}
