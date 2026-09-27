import { ExternalLink, FolderOpen, HardDrive } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { destinationRejection } from '@shared/destinationRules'
import { formatBytes } from '@shared/format'
import type { DestinationInfo, DownloadDestination, ModelFormat } from '@shared/types'
import { useDestinations } from '@/lib/queries'
import { toast } from '@/lib/toastStore'
import { cn } from '@/lib/utils'

const INSTALL_URL: Partial<Record<DestinationInfo['kind'], string>> = {
  lmstudio: 'https://lmstudio.ai',
  exo: 'https://github.com/exo-explore/exo'
}

interface DestinationPickerProps {
  format: ModelFormat
  value: DownloadDestination | null
  onChange(value: DownloadDestination | null): void
}

function shortPath(p: string): string {
  const parts = p.split('/')
  return parts.length > 3 ? `…/${parts.slice(-2).join('/')}` : p
}

function optionState(
  info: DestinationInfo,
  format: ModelFormat
): { disabled: boolean; hint: string; installUrl?: string } {
  // exo is the only hard rejection; a missing app is an invitation to install it.
  if (info.kind === 'exo' && format !== 'mlx') {
    return { disabled: true, hint: destinationRejection('exo', format, info)! }
  }
  if (info.kind === 'custom') {
    return { disabled: false, hint: info.path ? shortPath(info.path) : 'Choose a folder…' }
  }
  if (!info.path) {
    return {
      disabled: false,
      hint: info.kind === 'lmstudio' ? 'Not installed — get it free' : 'Not installed — get it',
      installUrl: INSTALL_URL[info.kind]
    }
  }
  return { disabled: false, hint: shortPath(info.path) }
}

export function DestinationPicker({ format, value, onChange }: DestinationPickerProps) {
  const { data: destinations } = useDestinations()

  const { data: disk } = useQuery({
    queryKey: ['disk-space', value?.baseDir],
    queryFn: () => window.hfgui.checkDiskSpace(value!.baseDir),
    enabled: !!value?.baseDir,
    staleTime: 15_000
  })

  const pickCustom = async (): Promise<void> => {
    const current = destinations?.find((d) => d.kind === 'custom')
    const dir = await window.hfgui.pickDirectory({
      title: 'Choose a download folder',
      defaultPath: current?.path ?? undefined
    })
    if (dir) onChange({ kind: 'custom', baseDir: dir })
  }

  if (!destinations) return null

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        {destinations.map((info) => {
          const { disabled, hint, installUrl } = optionState(info, format)
          const selected = value?.kind === info.kind
          const onClick = (): void => {
            if (disabled) return
            if (installUrl) {
              void window.hfgui.openExternal(installUrl)
              toast(
                'info',
                `Once ${info.label} is installed, hfgui detects it automatically — come back and pick it.`
              )
              return
            }
            if (info.kind === 'custom' && !info.path) {
              void pickCustom()
              return
            }
            onChange({ kind: info.kind, baseDir: info.path! })
          }
          return (
            <button
              key={info.kind}
              onClick={onClick}
              disabled={disabled}
              data-testid={`destination-${info.kind}`}
              title={disabled ? hint : undefined}
              className={cn(
                'rounded-bezel flex cursor-pointer flex-col gap-0.5 p-3 text-left transition-all',
                selected
                  ? 'bg-accent/10 ring-accent/60 shadow-accent/10 shadow-lg ring-1'
                  : 'slot hover:bg-surface-2',
                disabled && 'cursor-not-allowed opacity-40',
                installUrl && 'opacity-70 hover:opacity-100'
              )}
            >
              <span className="text-text flex items-center gap-1 text-[13px] font-semibold">
                {info.label}
                {installUrl && <ExternalLink className="h-3 w-3" />}
              </span>
              <span className="text-faint truncate text-[11px]">{hint}</span>
            </button>
          )
        })}
      </div>
      {value && (
        <div className="text-faint flex items-center gap-3 px-1 text-[11px]">
          <span className="selectable min-w-0 flex-1 truncate" title={value.baseDir}>
            <FolderOpen className="mr-1 inline h-3 w-3 align-[-2px]" />
            {value.baseDir}
          </span>
          {value.kind === 'custom' && (
            <button
              onClick={() => void pickCustom()}
              className="text-muted hover:text-text shrink-0 cursor-pointer underline"
            >
              Change
            </button>
          )}
          {disk && (
            <span className="tnum shrink-0">
              <HardDrive className="mr-1 inline h-3 w-3 align-[-2px]" />
              {formatBytes(disk.freeBytes)} free
            </span>
          )}
        </div>
      )}
    </div>
  )
}
