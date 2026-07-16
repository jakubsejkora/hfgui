import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'icon' | 'icon-sm'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-black hover:bg-accent-hover font-semibold',
  secondary: 'bg-surface-2 border border-border text-text hover:bg-surface-3 hover:border-border-strong',
  ghost: 'text-muted hover:text-text hover:bg-surface-2',
  danger: 'bg-danger/10 text-danger hover:bg-danger/20'
}

const sizes: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs rounded-lg gap-1',
  md: 'h-9 px-3.5 text-sm rounded-lg gap-1.5',
  icon: 'h-8 w-8 rounded-lg',
  'icon-sm': 'h-7 w-7 rounded-md'
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export function Button({ variant = 'secondary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'no-drag inline-flex shrink-0 cursor-pointer items-center justify-center transition-colors',
        'focus-visible:ring-accent/60 focus-visible:ring-2 focus-visible:outline-none',
        'disabled:pointer-events-none disabled:opacity-40',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  )
}
