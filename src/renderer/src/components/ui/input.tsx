import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'no-drag bg-surface-2 border-border text-text placeholder:text-faint h-9 w-full rounded-lg border px-3 text-sm',
        'focus:border-border-strong focus:ring-accent/40 transition-colors focus:ring-2 focus:outline-none',
        className
      )}
      {...props}
    />
  )
}
