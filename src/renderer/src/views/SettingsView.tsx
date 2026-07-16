import { FolderSearch, KeyRound, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import type { DestinationKind, Settings } from '@shared/types'
import { useDestinations, useInvalidate, useSettings, useTokenStatus } from '@/lib/queries'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tooltip } from '@/components/ui/tooltip'
import { TokenDialog } from '@/components/app/TokenDialog'

const DIR_SETTING: Record<DestinationKind, keyof Settings> = {
  lmstudio: 'lmstudioDir',
  exo: 'exoDir',
  custom: 'customDir'
}

const DIR_BLURB: Record<DestinationKind, string> = {
  lmstudio: 'GGUF and MLX models land here as {publisher}/{model}/ — LM Studio finds them on relaunch.',
  exo: 'MLX models land here as {org}--{model}/ — exo loads complete folders automatically.',
  custom: 'Fallback folder for downloads that aren’t for a specific app.'
}

function DirectoryRow({ kind, label }: { kind: DestinationKind; label: string }) {
  const { data: settings } = useSettings()
  const { data: destinations } = useDestinations()
  const invalidate = useInvalidate()
  const info = destinations?.find((d) => d.kind === kind)
  const override = (settings?.[DIR_SETTING[kind]] as string | null) ?? null

  const update = async (value: string | null): Promise<void> => {
    await window.hfgui.setSettings({ [DIR_SETTING[kind]]: value })
    invalidate(['settings', 'destinations'])
  }

  const browse = async (): Promise<void> => {
    const dir = await window.hfgui.pickDirectory({
      title: `Choose the ${label} models folder`,
      defaultPath: info?.path ?? undefined
    })
    if (dir) await update(dir)
  }

  return (
    <div className="border-border bg-surface flex items-center gap-3 rounded-xl border p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold">{label}</span>
          {info?.source === 'detected' && <Badge variant="success">auto-detected</Badge>}
          {info?.source === 'override' && <Badge variant="accent">custom</Badge>}
          {info?.source === 'none' && kind !== 'custom' && (
            <Badge variant="outline">not found</Badge>
          )}
        </div>
        <div className="text-faint selectable truncate font-mono text-[11px]" title={info?.path ?? undefined}>
          {info?.path ?? 'No folder set'}
        </div>
        <div className="text-faint mt-1 text-[11px]">{DIR_BLURB[kind]}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {override && kind !== 'custom' && (
          <Tooltip content="Reset to auto-detected location">
            <Button variant="ghost" size="icon" onClick={() => void update(null)}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          </Tooltip>
        )}
        <Button size="sm" onClick={() => void browse()}>
          <FolderSearch className="h-3.5 w-3.5" />
          Browse
        </Button>
      </div>
    </div>
  )
}

export function SettingsView() {
  const { data: settings } = useSettings()
  const { data: tokenStatus } = useTokenStatus()
  const invalidate = useInvalidate()
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false)

  const patch = async (p: Partial<Settings>): Promise<void> => {
    await window.hfgui.setSettings(p)
    invalidate(['settings'])
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-border border-b px-6 pt-6 pb-4">
        <h1 className="text-[15px] font-semibold">Settings</h1>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="flex max-w-2xl flex-col gap-8">
          <section className="flex flex-col gap-2.5">
            <h2 className="text-faint text-[11px] font-semibold tracking-wider uppercase">
              Model folders
            </h2>
            <DirectoryRow kind="lmstudio" label="LM Studio" />
            <DirectoryRow kind="exo" label="exo" />
            <DirectoryRow kind="custom" label="Custom folder" />
          </section>

          <section className="flex flex-col gap-2.5">
            <h2 className="text-faint text-[11px] font-semibold tracking-wider uppercase">
              Hugging Face
            </h2>
            <div className="border-border bg-surface flex items-center gap-3 rounded-xl border p-4">
              <KeyRound className="text-accent h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold">Access token</div>
                <div className="text-faint text-[11px]">
                  {tokenStatus?.isSet
                    ? `${tokenStatus.masked} ${tokenStatus.source === 'huggingface-cli' ? '(from huggingface-cli)' : '(stored encrypted)'}`
                    : 'Not set — only needed for gated models like Llama or Gemma.'}
                </div>
              </div>
              <Button size="sm" onClick={() => setTokenDialogOpen(true)}>
                {tokenStatus?.source === 'app' ? 'Change' : 'Set token'}
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-2.5">
            <h2 className="text-faint text-[11px] font-semibold tracking-wider uppercase">
              Downloads
            </h2>
            <div className="border-border bg-surface flex flex-col gap-4 rounded-xl border p-4">
              <div className="flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold">Parallel downloads</div>
                  <div className="text-faint text-[11px]">
                    How many models download at the same time.
                  </div>
                </div>
                <Slider
                  value={settings?.maxConcurrentJobs ?? 2}
                  min={1}
                  max={5}
                  onValueChange={(v) => void patch({ maxConcurrentJobs: v })}
                  ariaLabel="Parallel downloads"
                />
                <span className="text-text w-4 text-center text-sm font-semibold">
                  {settings?.maxConcurrentJobs ?? 2}
                </span>
              </div>
              <div className="border-border flex items-center gap-4 border-t pt-4">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold">Resume on launch</div>
                  <div className="text-faint text-[11px]">
                    Automatically continue unfinished downloads when the app starts.
                  </div>
                </div>
                <Switch
                  checked={settings?.autoResume ?? false}
                  onCheckedChange={(v) => void patch({ autoResume: v })}
                  ariaLabel="Resume on launch"
                />
              </div>
            </div>
          </section>
        </div>
      </div>
      <TokenDialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen} />
    </div>
  )
}
