import type { ReactNode } from 'react'
import { modelArtwork } from '@shared/artwork'
import { cn } from '@/lib/utils'

export type ArtworkSize = 'chip' | 'row' | 'hero'

const SIZE_CLASS: Record<ArtworkSize, string> = {
  chip: 'h-12 w-12 rounded-[14px]',
  row: 'h-14 w-14 rounded-[16px]',
  hero: 'h-44 w-full rounded-bezel'
}

/**
 * A model's generated cover art inside a recessed bezel.
 *
 * Grain and drift are deliberately limited to the larger sizes: at chip scale
 * the texture is invisible, and a blended overlay per card costs a compositing
 * pass on every frame of a scrolling grid.
 */
export function Artwork({
  repoId,
  size = 'chip',
  className,
  children
}: {
  repoId: string
  size?: ArtworkSize
  className?: string
  children?: ReactNode
}) {
  const { background } = modelArtwork(repoId)
  return (
    <div className={cn('bezel shrink-0', size !== 'chip' && 'grain', SIZE_CLASS[size], className)}>
      <div
        className={cn('absolute inset-0', size === 'hero' && 'animate-glow-drift')}
        style={{ background }}
      />
      {children}
    </div>
  )
}

/** Two overlapping glass circles — the motif that recurs across the app. */
export function NodesEmblem({ className, size = 26 }: { className?: string; size?: number }) {
  return (
    <div className={cn('flex items-center', className)} aria-hidden>
      <span className="glass-on-art rounded-full" style={{ width: size, height: size }} />
      <span
        className="glass-on-art-strong rounded-full"
        style={{ width: size, height: size, marginLeft: -size * 0.42 }}
      />
    </div>
  )
}
