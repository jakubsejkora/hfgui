import { modelArtwork } from '@shared/artwork'
import { cn } from '@/lib/utils'

const SIZE = {
  xs: 'size-5 rounded-[5px]',
  sm: 'size-7 rounded-md',
  md: 'size-9 rounded-lg',
  lg: 'size-12 rounded-xl'
} as const

/**
 * A model's deterministic gradient (same repo → same colours; one author's
 * models share a hue family), as a flat avatar. Decorative: the name next to it
 * carries the meaning.
 */
export function ModelAvatar({
  repoId,
  size = 'md',
  className
}: {
  repoId: string
  size?: keyof typeof SIZE
  className?: string
}) {
  return (
    <div
      aria-hidden
      className={cn(
        'shrink-0 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.06)] dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]',
        SIZE[size],
        className
      )}
      style={{ background: modelArtwork(repoId).background }}
    />
  )
}
