import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'no-drag slot text-text placeholder:text-faint h-9 w-full px-3.5 text-sm',
        'focus:ring-accent/40 transition-shadow focus:ring-2 focus:outline-none',
        className
      )}
      {...props}
    />
  )
}
