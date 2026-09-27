import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'default' | 'accent' | 'mlx' | 'success' | 'warning' | 'danger' | 'outline' | 'glass'

const variants: Record<Variant, string> = {
  default: 'bg-surface-3 text-muted',
  accent: 'bg-accent/15 text-accent',
  mlx: 'bg-mlx/15 text-mlx',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger',
  outline: 'border border-border text-faint',
  /** For badges sitting on artwork, which looks the same in both themes. */
  glass: 'glass-on-art'
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant
}

export function Badge({ variant = 'default', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
        variants[variant],
        className
      )}
      {...props}
    />
  )
}
