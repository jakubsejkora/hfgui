import { Check, ChevronDown } from 'lucide-react'
import { Select as SelectPrimitive } from 'radix-ui'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps {
  value: string
  onValueChange(value: string): void
  options: SelectOption[]
  icon?: ReactNode
  className?: string
  ariaLabel?: string
}

export function Select({ value, onValueChange, options, icon, className, ariaLabel }: SelectProps) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={cn(
          'no-drag bg-surface-2 border-border text-text hover:bg-surface-3 hover:border-border-strong',
          'inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm transition-colors',
          'focus:ring-accent/40 focus:ring-2 focus:outline-none',
          className
        )}
      >
        {icon}
        <SelectPrimitive.Value />
        <ChevronDown className="text-faint ml-auto h-3.5 w-3.5" />
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="bg-surface-2 border-border animate-pop-in z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border shadow-2xl shadow-black/50"
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value}
                value={opt.value}
                className="text-muted data-[highlighted]:bg-surface-3 data-[highlighted]:text-text flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none select-none data-[state=checked]:text-text"
              >
                <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="ml-auto">
                  <Check className="text-accent h-3.5 w-3.5" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
