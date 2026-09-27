import type { DestinationInfo, DestinationKind, ModelFormat } from './types'

/**
 * Which destinations can accept which models. Shared so the detail sheet's
 * picker, its auto-selection, and the drag-and-drop bays cannot drift apart.
 */
export function destinationRejection(
  kind: DestinationKind,
  format: ModelFormat,
  info: DestinationInfo | undefined
): string | null {
  if (kind === 'exo' && format !== 'mlx') return 'exo runs MLX models only'
  if (kind !== 'custom' && !info?.path) return 'Not installed on this Mac'
  return null
}

export function canDownloadTo(
  kind: DestinationKind,
  format: ModelFormat,
  info: DestinationInfo | undefined
): boolean {
  return destinationRejection(kind, format, info) === null
}

/** Preference order per format; exo first for MLX because it loads whole folders. */
const PREFERENCE: Record<ModelFormat, DestinationKind[]> = {
  mlx: ['exo', 'lmstudio', 'custom'],
  gguf: ['lmstudio', 'custom'],
  other: ['lmstudio', 'custom']
}

/** The destination a download should land in when the user hasn't picked one. */
export function defaultDestination(
  format: ModelFormat,
  destinations: DestinationInfo[]
): DestinationInfo | null {
  for (const kind of PREFERENCE[format]) {
    const info = destinations.find((d) => d.kind === kind)
    if (info?.path && canDownloadTo(kind, format, info)) return info
  }
  return null
}
