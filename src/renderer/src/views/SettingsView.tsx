import { ExternalLink, FolderOpen, KeyRound, Monitor, Moon, RotateCcw, Sun } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import { availableDestinations } from '@shared/destinationRules'
import { formatBytes, timeAgo } from '@shared/format'
import { REPO_URL, bugReportUrl } from '@shared/project'
import type { AppUpdateStatus, DestinationInfo, DestinationKind, Settings, Theme } from '@shared/types'
import { jobActions, openExternal } from '@/lib/actions'
import { checkAppUpdateNow, openReleaseNotes, requestRestart, useAppUpdate } from '@/lib/appUpdate'
import { usePrefs } from '@/lib/prefsStore'
import {
  useDestinations,
  useHfAccount,
  useSettings,
  useStorageReport,
  useSystemInfo,
  useTokenStatus,
  useUpdateSettings
} from '@/lib/queries'
import { useNow } from '@/lib/useNow'
import { useUiStore } from '@/lib/uiStore'
import { cn, displayPath } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { Progress } from '@/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Dot, StatusPill } from '@/components/app/badges'
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
  lmstudio: 'Saved as {publisher}/{model}/ in LM Studio’s library — it finds them on relaunch.',
  exo: 'MLX models, saved as {org}--{model}/ — exo loads complete folders on its own.',
  custom: 'Your own folder, one subfolder per model. Any app that opens model files can use it.'
}

function FolderRow({ kind, label }: { kind: DestinationKind; label: string }) {
  const { data: settings } = useSettings()
  const { data: destinations } = useDestinations()
  const update = useUpdateSettings()
  const info = destinations?.find((d) => d.kind === kind)
  const override = (settings?.[DIR_SETTING[kind]] as string | null) ?? null

  const browse = async (): Promise<void> => {
    const dir = await window.hfgui.pickDirectory({
      title: kind === 'custom' ? 'Choose your models folder' : `Choose the ${label} models folder`,
      defaultPath: info?.path ?? undefined
    })
    if (dir) update.mutate({ [DIR_SETTING[kind]]: dir })
  }

  // Apps say whether hfgui found them or was pointed at them; the models folder is simply yours.
  const status =
    kind === 'custom' ? null : info?.source === 'detected' ? (
      <StatusPill tone="success">Found on this Mac</StatusPill>
    ) : info?.source === 'override' ? (
      <StatusPill tone="neutral">Custom location</StatusPill>
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
          <span className="truncate">{info?.path ? displayPath(info.path) : 'No folder chosen yet'}</span>
        </div>
        {override && kind !== 'custom' && (
          <Button variant="ghost" size="sm" onClick={() => update.mutate({ [DIR_SETTING[kind]]: null })}>
            <RotateCcw /> Reset
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => void browse()}>
          {kind !== 'custom' ? 'Browse…' : info?.path ? 'Change…' : 'Choose…'}
        </Button>
      </div>
    </Row>
  )
}

const AUTOMATIC = 'automatic'

/** Only worth asking when there is more than one place to choose from. */
function DefaultDestinationRow({ available }: { available: DestinationInfo[] }) {
  const { data: settings } = useSettings()
  const update = useUpdateSettings()
  const preferred = settings?.preferredDestination
  const value = available.some((d) => d.kind === preferred) ? preferred! : AUTOMATIC
  const hasExo = available.some((d) => d.kind === 'exo')
  return (
    <Row
      title="Default for new downloads"
      description={
        <>
          Each download can still go somewhere else. Automatic uses an app that can open the model, otherwise
          your models folder.{hasExo && ' exo takes MLX models only.'}
        </>
      }
      control={
        <Select
          value={value}
          onValueChange={(v) => update.mutate({ preferredDestination: v === AUTOMATIC ? null : (v as DestinationKind) })}
        >
          <SelectTrigger size="sm" className="w-40" aria-label="Default for new downloads">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value={AUTOMATIC}>Automatic</SelectItem>
            {available.map((d) => (
              <SelectItem key={d.kind} value={d.kind}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    />
  )
}

/** "LM Studio and exo", "exo"… — whichever apps aren't on this Mac. */
function joinNames(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]
}

function WhereModelsGo() {
  const { data: destinations } = useDestinations()
  const openGuide = useUiStore((s) => s.openGuide)
  const available = destinations ? availableDestinations(destinations) : []
  const apps = available.filter((d) => d.kind !== 'custom')
  const missing = (destinations ?? []).filter((d) => d.kind !== 'custom' && !d.path).map((d) => d.label)

  return (
    <SettingsSection
      title="Where models go"
      description={
        apps.length > 0
          ? `Your models folder works with any app, and hfgui can save straight into ${apps.map((a) => a.label).join(' or ')} too.`
          : 'Downloads go to your models folder, which any app can use.'
      }
    >
      {apps.length > 0 && (
        <>
          <DefaultDestinationRow available={available} />
          <Separator />
        </>
      )}
      <FolderRow kind="custom" label="Models folder" />
      {apps.map((d) => (
        <Fragment key={d.kind}>
          <Separator />
          <FolderRow kind={d.kind} label={d.label} />
        </Fragment>
      ))}
      {missing.length > 0 && (
        <>
          <Separator />
          <p className="px-5 py-3 text-xs text-muted-foreground">
            {joinNames(missing)} {missing.length > 1 ? 'show' : 'shows'} up here if you install{' '}
            {missing.length > 1 ? 'them' : 'it'}.{' '}
            <Button variant="link" size="xs" className="h-auto px-0 text-xs" onClick={() => openGuide('running')}>
              Ways to run a model
            </Button>
          </p>
        </>
      )}
    </SettingsSection>
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

function StorageRows() {
  const { data: report } = useStorageReport()
  const setView = useUiStore((s) => s.setView)
  const setPrefs = usePrefs((s) => s.set)
  const leftovers = report?.leftovers ?? { files: 0, bytes: 0 }
  const held = Object.values(report?.held ?? {}).reduce((sum, b) => sum + b, 0)
  return (
    <>
      <Row
        title="Leftover data"
        description={
          leftovers.bytes > 0
            ? `${formatBytes(leftovers.bytes)} in ${leftovers.files} ${leftovers.files === 1 ? 'file' : 'files'} from downloads removed before they finished.`
            : 'Nothing to clean up.'
        }
        control={
          <Button
            variant="outline"
            size="sm"
            disabled={leftovers.bytes === 0}
            onClick={() => void jobActions.cleanLeftovers()}
          >
            Clean up
          </Button>
        }
      />
      <Separator />
      <Row
        title="Unfinished downloads"
        description={
          held > 0
            ? `${formatBytes(held)} held by paused, failed and stopped downloads, so they can pick up where they left off. Discard any you no longer want.`
            : 'No unfinished downloads are holding space.'
        }
        control={
          <Button
            variant="outline"
            size="sm"
            disabled={held === 0}
            onClick={() => {
              setPrefs({ downloadsTab: 'all' })
              setView('downloads')
            }}
          >
            Review
          </Button>
        }
      />
    </>
  )
}

/** Where hfgui's own update stands, in a sentence. */
function appUpdateLine(status: AppUpdateStatus | undefined, now: number): ReactNode {
  switch (status?.status) {
    case undefined:
      return ' '
    case 'unavailable':
      return status.reason
    case 'idle':
      return status.checkedAt
        ? `You’re up to date — checked ${timeAgo(status.checkedAt, now)}.`
        : 'hfgui looks for new versions on GitHub.'
    case 'checking':
      return 'Checking GitHub for a new version…'
    case 'downloading':
      return `Downloading hfgui ${status.version} — ${status.percent}%`
    case 'ready':
      return `hfgui ${status.version} is ready. It installs the next time you quit.`
    case 'error':
      return (
        <span className="inline-flex items-baseline gap-1.5">
          <Dot tone="warning" className="relative -top-px" />
          {status.message}
        </span>
      )
  }
}

function AppUpdateRows() {
  const { data: status } = useAppUpdate()
  const { data: settings } = useSettings()
  const update = useUpdateSettings()
  // Keeps "checked 5m ago" honest while Settings stays open.
  const now = useNow(status?.status === 'idle' && status.checkedAt != null, 30_000)
  const busy = status?.status === 'checking' || status?.status === 'downloading'
  const unavailable = !status || status.status === 'unavailable'

  return (
    <>
      <Row
        title="Updates"
        description={<span data-testid="app-update-status">{appUpdateLine(status, now)}</span>}
        control={
          status?.status === 'ready' ? (
            <Button size="sm" onClick={requestRestart} data-testid="app-update-settings-restart">
              Restart to update
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={busy || unavailable}
              onClick={() => void checkAppUpdateNow()}
              data-testid="app-update-check"
            >
              {busy && <Spinner />}
              {status?.status === 'checking' ? 'Checking…' : status?.status === 'downloading' ? 'Downloading…' : 'Check now'}
            </Button>
          )
        }
      >
        {status?.status === 'downloading' && (
          <Progress value={status.percent} aria-label="Update download" indicatorClassName="bg-success" />
        )}
      </Row>
      <Separator />
      <Row
        title="Check automatically"
        description="Look for a new version at launch and every few hours, and download it in the background. Only the version check goes to GitHub — no account, nothing about you."
        control={
          <Switch
            checked={settings?.autoUpdate ?? true}
            disabled={unavailable}
            onCheckedChange={(v) => update.mutate({ autoUpdate: v })}
            aria-label="Check for updates automatically"
          />
        }
      />
      <Separator />
      <Row
        title="What’s new"
        description="Release notes for every version, on GitHub."
        control={
          <Button variant="outline" size="sm" onClick={() => openReleaseNotes()}>
            Release notes <ExternalLink />
          </Button>
        }
      />
    </>
  )
}

/** Source and bug reports. The report opens a filled-in form in the browser; nothing is sent from here. */
function ProjectRow() {
  const { data: system } = useSystemInfo()
  const report = (): void =>
    openExternal(
      bugReportUrl({
        version: __APP_VERSION__,
        osVersion: system?.osVersion ?? '',
        cpuModel: system?.cpuModel ?? '',
        totalMemoryBytes: system?.totalMemoryBytes ?? 0
      })
    )
  return (
    <Row
      title="Open source"
      description="hfgui is free and MIT-licensed. Found a bug? The report opens on GitHub with your version, macOS and Mac filled in — you see everything before it’s sent."
      control={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => openExternal(REPO_URL)}>
            Source <ExternalLink />
          </Button>
          <Button variant="outline" size="sm" onClick={report} data-testid="report-bug">
            Report a bug <ExternalLink />
          </Button>
        </div>
      }
    />
  )
}

const SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ['⌘', 'K'], label: 'Search models (or press /)' },
  { keys: ['⌘', '1–7'], label: 'Overview, Discover, Browse, Downloads, Private inference, Guide, Settings' },
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
      <PageHeader title="Settings" description="Where models go, how downloads behave, and how hfgui looks." />

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

        <WhereModelsGo />

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

        <SettingsSection
          title="Storage"
          description="Downloads that never finish shouldn’t keep using your disk. hfgui only ever deletes files it downloaded itself — never another app’s, even in shared folders."
        >
          <StorageRows />
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

        <SettingsSection
          title="About"
          description="hfgui downloads models from Hugging Face to this Mac: into your models folder, or straight into LM Studio and exo if you use them."
        >
          <Row title="Version" control={<span className="font-mono text-sm text-muted-foreground">{__APP_VERSION__}</span>} />
          <Separator />
          <AppUpdateRows />
          <Separator />
          <ProjectRow />
          <Separator />
          <Row
            title="Welcome screen"
            description="Choose where models go and add a Hugging Face token, step by step."
            control={
              <Button variant="outline" size="sm" onClick={() => patch({ onboarded: false })}>
                Show again
              </Button>
            }
          />
        </SettingsSection>
      </div>
    </Page>
  )
}
