import { FolderOpen, HardDrive } from 'lucide-react'
import { useId } from 'react'
import { availableDestinations, destinationRejection } from '@shared/destinationRules'
import { formatBytes } from '@shared/format'
import type { DestinationInfo, DownloadDestination, ModelFormat } from '@shared/types'
import { useDestinations, useDiskSpace } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

const COLUMNS = ['grid-cols-1', 'grid-cols-2', 'grid-cols-3'] as const

/** Last two path segments: enough to recognise, never an absolute path. */
function shortPath(p: string): string {
  const parts = p.split('/')
  return parts.length > 3 ? `…/${parts.slice(-2).join('/')}` : p
}

interface DestinationPickerProps {
  format: ModelFormat
  value: DownloadDestination | null
  onChange(value: DownloadDestination): void
}

/**
 * Where a download lands, as radio "choice cards": the models folder, plus LM
 * Studio and exo when they're on this Mac. Selecting never opens a dialog by
 * itself (arrow keys select too); choosing a folder is its own button.
 */
export function DestinationPicker({ format, value, onChange }: DestinationPickerProps) {
  const { data: destinations } = useDestinations()
  const { data: disk } = useDiskSpace(value?.baseDir)
  const idBase = useId()

  if (!destinations) return null
  const shown = availableDestinations(destinations)

  const pathFor = (info: DestinationInfo): string | null =>
    info.kind === 'custom' && value?.kind === 'custom' ? value.baseDir : info.path

  const pickCustom = async (): Promise<void> => {
    const current = destinations.find((d) => d.kind === 'custom')
    const dir = await window.hfgui.pickDirectory({
      title: 'Choose a download folder',
      defaultPath: (value?.kind === 'custom' ? value.baseDir : current?.path) ?? undefined
    })
    if (dir) onChange({ kind: 'custom', baseDir: dir })
  }

  return (
    <div className="flex flex-col gap-3">
      <RadioGroup
        value={value?.kind ?? ''}
        onValueChange={(kind) => {
          const info = destinations.find((d) => d.kind === kind)
          const path = info && pathFor(info)
          if (info && path) onChange({ kind: info.kind, baseDir: path })
        }}
        className={cn('grid gap-2', COLUMNS[Math.min(shown.length, 3) - 1])}
        aria-label="Download destination"
      >
        {shown.map((info) => {
          const path = pathFor(info)
          const rejection =
            info.kind === 'custom' ? null : destinationRejection(info.kind, format, info)
          const disabled = !!rejection || !path
          const selected = value?.kind === info.kind
          const id = `${idBase}-${info.kind}`
          return (
            <div
              key={info.kind}
              className={cn(
                'flex flex-col gap-2 rounded-lg border p-3 transition-colors',
                selected && 'border-foreground/60 bg-muted/40 ring-1 ring-foreground/60',
                disabled && 'bg-muted/30'
              )}
            >
              <label
                htmlFor={id}
                className={cn('flex cursor-pointer items-start gap-2.5', disabled && 'cursor-default')}
              >
                <RadioGroupItem
                  id={id}
                  value={info.kind}
                  disabled={disabled}
                  data-testid={`destination-${info.kind}`}
                  className="mt-0.5"
                />
                <span className="grid min-w-0 gap-0.5">
                  <span className={cn('text-sm font-medium', disabled && 'text-muted-foreground')}>
                    {info.label}
                  </span>
                  <span className="truncate text-xs text-muted-foreground" title={path ?? undefined}>
                    {info.kind === 'exo' && format !== 'mlx'
                      ? 'Runs MLX models only'
                      : path
                        ? shortPath(path)
                        : 'No folder chosen yet'}
                  </span>
                </span>
              </label>
              {info.kind === 'custom' && !path && (
                <Button variant="outline" size="xs" className="self-start" onClick={() => void pickCustom()}>
                  <FolderOpen /> Choose folder…
                </Button>
              )}
            </div>
          )
        })}
      </RadioGroup>

      {value && (
        <div className="flex items-center gap-3 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <FolderOpen className="size-3.5 shrink-0" />
          {/* The only absolute path rendered as text — scripts/e2e-mlx.mjs reads it. */}
          <span className="selectable min-w-0 flex-1 truncate font-mono" title={value.baseDir}>
            {value.baseDir}
          </span>
          {value.kind === 'custom' && (
            <Button variant="ghost" size="xs" className="-my-1 shrink-0" onClick={() => void pickCustom()}>
              Change…
            </Button>
          )}
          {disk && (
            <span className="flex shrink-0 items-center gap-1 tabular-nums">
              <HardDrive className="size-3.5" />
              {formatBytes(disk.freeBytes)} free
            </span>
          )}
        </div>
      )}
    </div>
  )
}
