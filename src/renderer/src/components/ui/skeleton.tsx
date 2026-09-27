import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('bg-surface-2 animate-shimmer rounded-bezel', className)} />
}
