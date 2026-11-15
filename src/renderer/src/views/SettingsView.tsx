import { ExternalLink, FolderOpen, KeyRound, Monitor, Moon, RotateCcw, Sun } from 'lucide-react'
import type { ReactNode } from 'react'
import type { DestinationKind, Settings, Theme } from '@shared/types'
import { openExternal } from '@/lib/actions'
import { useDestinations, useHfAccount, useSettings, useTokenStatus, useUpdateSettings } from '@/lib/queries'
import { useUiStore } from '@/lib/uiStore'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { StatusPill } from '@/components/app/badges'
import { Page, PageHeader } from '@/components/app/Page'
import { SpeedLimitControl } from '@/components/app/SpeedLimitControl'

/** Polaris-style annotated section: what it is on the left, the controls on the right. */
function SettingsSection({
  title,
  description,
  children
}: {
  title: string
  description: ReactNode
  children: ReactNode
}) {
  return (
    <section className="grid gap-4 border-t pt-8 first:border-t-0 first:pt-0 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-10">
      <div className="space-y-1">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <Card className="gap-0 py-0 shadow-xs">{children}</Card>
    </section>
  )
}

function Row({
  title,
  description,
  control,
  children,
  className
}: {
  title: ReactNode
  description?: ReactNode
  control?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-3 px-5 py-4', className)}>
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0 space-y-1">
          <div className="text-sm font-medium">{title}</div>
          {description && <div className="text-xs leading-relaxed text-muted-foreground">{description}</div>}
        </div>
        {control && <div className="shrink-0">{control}</div>}
      </div>
      {children}
    </div>
  )
}

const THEMES: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon }
]

function ThemePreview({ value }: { value: Theme }) {
  const half = 'flex flex-col gap-1 p-1.5'
  const light = 'bg-[oklch(0.97_0_0)]'
  const dark = 'bg-[oklch(0.17_0_0)]'
  const bar = (tone: 'light' | 'dark', w: string): ReactNode => (
    <span className={cn('h-1.5 rounded-full', w, tone === 'light' ? 'bg-black/15' : 'bg-white/20')} />
  )
  if (value === 'system') {
    return (
      <span className="grid h-16 grid-cols-2 overflow-hidden rounded-md border">
        <span className={cn(half, light)}>
          {bar('light', 'w-3/4')}
          {bar('light', 'w-1/2')}
        </span>
        <span className={cn(half, dark)}>
          {bar('dark', 'w-3/4')}
          {bar('dark', 'w-1/2')}
        </span>
      </span>
    )
  }
  const tone = value
  return (
    <span className={cn('flex h-16 flex-col gap-1 overflow-hidden rounded-md border p-1.5', tone === 'light' ? light : dark)}>
      {bar(tone, 'w-3/4')}
      {bar(tone, 'w-1/2')}
      {bar(tone, 'w-2/3')}
    </span>
  )
}

const DIR_SETTING: Record<DestinationKind, keyof Settings> = {
  lmstudio: 'lmstudioDir',
  exo: 'exoDir',
  custom: 'customDir'
}

const DIR_BLURB: Record<DestinationKind, string> = {
  lmstudio: 'GGUF and MLX models land in {publisher}/{model}/ — LM Studio finds them on relaunch.',
  exo: 'MLX models land in {org}--{model}/ — exo loads complete folders automatically.',
  custom: 'For downloads that aren’t for a specific app. Remembers the last folder you used.'
}

const INSTALL_URL: Partial<Record<DestinationKind, string>> = {
  lmstudio: 'https://lmstudio.ai',
  exo: 'https://github.com/exo-explore/exo'
}

function FolderRow({ kind, label }: { kind: DestinationKind; label: string }) {
  const { data: settings } = useSettings()
  const { data: destinations } = useDestinations()
  const update = useUpdateSettings()
  const info = destinations?.find((d) => d.kind === kind)
  const override = (settings?.[DIR_SETTING[kind]] as string | null) ?? null

  const browse = async (): Promise<void> => {
    const dir = await window.hfgui.pickDirectory({
      title: `Choose the ${label} models folder`,
      defaultPath: info?.path ?? undefined
    })
    if (dir) update.mutate({ [DIR_SETTING[kind]]: dir })
  }

  const status =
    info?.source === 'detected' ? (
      <StatusPill tone="success">Detected</StatusPill>
    ) : info?.source === 'override' ? (
      <StatusPill tone="neutral">{kind === 'custom' ? 'Chosen' : 'Custom location'}</StatusPill>
    ) : kind !== 'custom' ? (
      <StatusPill tone="warning">Not found</StatusPill>
    ) : null

  return (
    <Row
      title={
        <span className="flex items-center gap-2">
          {label} {status}
        </span>
      }
      description={DIR_BLURB[kind]}
    >
      <div className="flex items-center gap-2">
        <div
          className="selectable flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border bg-muted/40 px-2.5 font-mono text-xs text-muted-foreground"
          title={info?.path ?? undefined}
        >
          <FolderOpen className="size-3.5 shrink-0" />
          <span className="truncate">{info?.path ?? 'No folder set'}</span>
        </div>
        {override && kind !== 'custom' && (
          <Button variant="ghost" size="sm" onClick={() => update.mutate({ [DIR_SETTING[kind]]: null })}>
            <RotateCcw /> Reset
          </Button>
        )}
        {info?.source === 'none' && INSTALL_URL[kind] && (
          <Button variant="ghost" size="sm" onClick={() => openExternal(INSTALL_URL[kind]!)}>
            Get {label} <ExternalLink />
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => void browse()}>
          Browse…
        </Button>
      </div>
    </Row>
  )
}

function AccountRow() {
  const { data: tokenStatus } = useTokenStatus()
  const { data: account, isLoading } = useHfAccount()
  const openTokenDialog = useUiStore((s) => s.setTokenDialogOpen)

  return (
    <Row
      title="Access token"
      description={
        tokenStatus?.isSet ? (
          <>
            {tokenStatus.masked}{' '}
            {tokenStatus.source === 'huggingface-cli' ? '· read from huggingface-cli' : '· stored encrypted on this Mac'}
          </>
        ) : (
          'Only needed for gated models like Llama or Gemma.'
        )
      }
      control={
        <Button variant="outline" size="sm" onClick={() => openTokenDialog(true)}>
          <KeyRound /> {tokenStatus?.source === 'app' ? 'Change' : 'Add token'}
        </Button>
      }
    >
      {tokenStatus?.isSet && !isLoading && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
          {account ? (
            <>
              {account.avatarUrl ? (
                <img src={account.avatarUrl} alt="" className="size-8 rounded-full bg-muted" />
              ) : (
                <span className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase">
                  {account.name.slice(0, 1)}
                </span>
              )}
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-sm font-medium">{account.fullname || account.name}</div>
                <div className="truncate text-xs text-muted-foreground">Signed in as @{account.name}</div>
              </div>
              <StatusPill tone="success">Valid</StatusPill>
            </>
          ) : (
            <>
              <div className="min-w-0 flex-1 text-xs text-muted-foreground">
                Hugging Face doesn’t accept this token. Add a new one to download gated models.
              </div>
              <StatusPill tone="danger">Rejected</StatusPill>
            </>
          )}
        </div>
      )}
    </Row>
  )
}

const SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ['⌘', 'K'], label: 'Search models (or press /)' },
  { keys: ['⌘', '1–5'], label: 'Overview, Browse, Downloads, Private inference, Settings' },
  { keys: ['⌘', 'B'], label: 'Show or hide the sidebar' },
  { keys: ['⌘', ','], label: 'Settings' },
  { keys: ['Esc'], label: 'Close the model panel or dialog' }
]

export function SettingsView() {
  const { data: settings } = useSettings()
  const update = useUpdateSettings()
  const patch = (p: Partial<Settings>): void => update.mutate(p)

  return (
    <Page className="max-w-5xl">
      <PageHeader title="Settings" description="Where models land, how downloads behave, and how hfgui looks." />

      <div className="flex flex-col gap-8">
        <SettingsSection title="Appearance" description="Follow the system appearance, or pick light or dark.">
          <Row title="Theme">
            <RadioGroup
              value={settings?.theme ?? 'system'}
              onValueChange={(v) => patch({ theme: v as Theme })}
              className="grid grid-cols-3 gap-3"
              aria-label="Theme"
            >
              {THEMES.map(({ value, label, icon: Icon }) => (
                <label
                  key={value}
                  className="group flex cursor-pointer flex-col gap-2 rounded-lg border p-2 transition-colors has-data-[state=checked]:border-foreground/60 has-data-[state=checked]:ring-1 has-data-[state=checked]:ring-foreground/60"
                >
                  <ThemePreview value={value} />
                  <span className="flex items-center gap-2 px-0.5 text-sm">
                    <RadioGroupItem value={value} aria-label={label} />
                    <Icon className="size-3.5 text-muted-foreground" />
                    {label}
                  </span>
                </label>
              ))}
            </RadioGroup>
          </Row>
        </SettingsSection>

        <SettingsSection
          title="Model folders"
          description="Where each app looks for models. hfgui finds LM Studio and exo on its own; override them here."
        >
          <FolderRow kind="lmstudio" label="LM Studio" />
          <Separator />
          <FolderRow kind="exo" label="exo" />
          <Separator />
          <FolderRow kind="custom" label="Custom folder" />
        </SettingsSection>

        <SettingsSection
          title="Hugging Face"
          description="A read token unlocks gated models. It never leaves this Mac except to authenticate with huggingface.co."
        >
          <AccountRow />
        </SettingsSection>

        <SettingsSection title="Downloads" description="How many run at once, how fast, and what happens around them.">
          <Row
            title="Parallel downloads"
            description="How many models download at the same time."
            control={
              <Select
                value={String(settings?.maxConcurrentJobs ?? 2)}
                onValueChange={(v) => patch({ maxConcurrentJobs: Number(v) })}
              >
                <SelectTrigger size="sm" className="w-24" aria-label="Parallel downloads">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
          <Separator />
          <div className="px-5 py-4">
            <SpeedLimitControl />
          </div>
          <Separator />
          <Row
            title="Notifications"
            description="A macOS notification when a download finishes or fails while hfgui is in the background."
            control={
              <Switch
                checked={settings?.notifications ?? true}
                onCheckedChange={(v) => patch({ notifications: v })}
                aria-label="Notifications"
              />
            }
          />
          <Separator />
          <Row
            title="Resume on launch"
            description="Continue unfinished downloads automatically when hfgui starts."
            control={
              <Switch
                checked={settings?.autoResume ?? false}
                onCheckedChange={(v) => patch({ autoResume: v })}
                aria-label="Resume on launch"
              />
            }
          />
          <Separator />
          <Row
            title="Offer copied links"
            description="When hfgui regains focus with a Hugging Face link on the clipboard, offer to open it. The clipboard is read in the background process and only ever yields a model name."
            control={
              <Switch
                checked={settings?.clipboardWatch ?? true}
                onCheckedChange={(v) => patch({ clipboardWatch: v })}
                aria-label="Offer copied links"
              />
            }
          />
        </SettingsSection>

        <SettingsSection title="Keyboard" description="Get around without the pointer.">
          <ul className="divide-y">
            {SHORTCUTS.map((s) => (
              <li key={s.label} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <span>{s.label}</span>
                <KbdGroup>
                  {s.keys.map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </KbdGroup>
              </li>
            ))}
          </ul>
        </SettingsSection>

        <SettingsSection title="About" description="hfgui downloads Hugging Face models straight into LM Studio and exo.">
          <Row title="Version" control={<span className="font-mono text-sm text-muted-foreground">{__APP_VERSION__}</span>} />
        </SettingsSection>
      </div>
    </Page>
  )
}
