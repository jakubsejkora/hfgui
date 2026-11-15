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

/**
 * The destination a download lands in when the user hasn't picked one for it:
 * their default (Settings, or the welcome screen) if it can take this format,
 * then hfgui's own order.
 */
export function defaultDestination(
  format: ModelFormat,
  destinations: DestinationInfo[],
  preferred: DestinationKind | null = null
): DestinationInfo | null {
  const order = preferred
    ? [preferred, ...PREFERENCE[format].filter((kind) => kind !== preferred)]
    : PREFERENCE[format]
  for (const kind of order) {
    const info = destinations.find((d) => d.kind === kind)
    if (info?.path && canDownloadTo(kind, format, info)) return info
  }
  return null
}

/**
 * What to offer as a place to download: the models folder always, an app only
 * when it's on this Mac (or the user pointed hfgui at its folder). People who
 * don't use LM Studio or exo never see them as greyed-out options.
 */
export function availableDestinations(destinations: DestinationInfo[]): DestinationInfo[] {
  return destinations.filter((d) => d.kind === 'custom' || d.path !== null)
}
