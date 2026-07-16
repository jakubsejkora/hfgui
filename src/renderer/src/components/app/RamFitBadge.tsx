import { formatBytes } from '@shared/format'
import { useSystemInfo } from '@/lib/queries'
import { Badge } from '@/components/ui/badge'
import { Tooltip } from '@/components/ui/tooltip'

/**
 * Rough "will it fit" hint: model weights need to fit in unified memory with
 * headroom for the OS, context, and the runtime.
 */
export function RamFitBadge({ sizeBytes }: { sizeBytes: number }) {
  const { data: sys } = useSystemInfo()
  if (!sys) return null
  const ratio = sizeBytes / sys.totalMemoryBytes
  const [variant, label] =
    ratio <= 0.7
      ? (['success', 'Fits RAM'] as const)
      : ratio <= 0.9
        ? (['warning', 'Tight fit'] as const)
        : (['danger', 'Too big'] as const)
  return (
    <Tooltip
      content={`${formatBytes(sizeBytes)} model vs ${formatBytes(sys.totalMemoryBytes)} RAM`}
    >
      <span>
        <Badge variant={variant}>{label}</Badge>
      </span>
    </Tooltip>
  )
}
