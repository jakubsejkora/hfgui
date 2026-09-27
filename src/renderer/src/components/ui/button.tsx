import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'icon' | 'icon-sm'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover font-semibold shadow-lg shadow-accent/20',
  secondary: 'glass text-text hover:bg-surface-3',
  ghost: 'text-muted hover:text-text hover:bg-surface-3',
  danger: 'bg-danger/12 text-danger hover:bg-danger/20'
}

const sizes: Record<Size, string> = {
  sm: 'h-7 px-3 text-xs rounded-full gap-1.5',
  md: 'h-9 px-4 text-sm rounded-full gap-2',
  icon: 'h-8 w-8 rounded-full',
  'icon-sm': 'h-7 w-7 rounded-full'
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
