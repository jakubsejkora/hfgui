import { cn } from '@/lib/utils'

export interface ProgressProps {
  /** 0..1 */
  value: number
  indeterminate?: boolean
  className?: string
}

export function Progress({ value, indeterminate, className }: ProgressProps) {
  return (
    <div className={cn('slot h-1.5 w-full overflow-hidden rounded-full', className)}>
      <div
        className={cn(
          'from-accent to-accent-hover shadow-accent/40 h-full rounded-full bg-gradient-to-r shadow-[0_0_10px] transition-[width] duration-300',
          indeterminate && 'animate-shimmer'
        )}
        style={{ width: indeterminate ? '100%' : `${Math.min(100, Math.max(0, value * 100))}%` }}
      />
    </div>
  )
}
