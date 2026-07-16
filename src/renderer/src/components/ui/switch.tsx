import { Switch as SwitchPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

export interface SwitchProps {
  checked: boolean
  onCheckedChange(checked: boolean): void
  className?: string
  ariaLabel?: string
}

export function Switch({ checked, onCheckedChange, className, ariaLabel }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={ariaLabel}
      className={cn(
        'no-drag bg-surface-3 data-[state=checked]:bg-accent relative h-6 w-10 cursor-pointer rounded-full transition-colors outline-none',
        'focus-visible:ring-accent/60 focus-visible:ring-2',
        className
      )}
    >
      <SwitchPrimitive.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
    </SwitchPrimitive.Root>
  )
}
