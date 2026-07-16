import { cn } from '@/lib/utils'

export interface ProgressProps {
  /** 0..1 */
  value: number
  indeterminate?: boolean
  className?: string
}

export function Progress({ value, indeterminate, className }: ProgressProps) {
  return (
    <div className={cn('bg-surface-3 h-1.5 w-full overflow-hidden rounded-full', className)}>
      <div
        className={cn(
          'from-accent to-accent-hover h-full rounded-full bg-gradient-to-r transition-[width] duration-300',
          indeterminate && 'animate-pulse'
        )}
        style={{ width: indeterminate ? '100%' : `${Math.min(100, Math.max(0, value * 100))}%` }}
      />
    </div>
  )
}
