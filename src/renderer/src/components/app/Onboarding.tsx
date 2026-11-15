import { Cpu, FolderOpen, KeyRound } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react'
import { availableDestinations } from '@shared/destinationRules'
import { comfortableModelBytes } from '@shared/fit'
import { formatBytes } from '@shared/format'
import type { DestinationInfo, DestinationKind } from '@shared/types'
import {
  useDestinations,
  useHfAccount,
  useSettings,
  useSystemInfo,
  useTokenStatus,
  useUpdateSettings
} from '@/lib/queries'
import { useUiStore } from '@/lib/uiStore'
import { cn, displayPath } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { StatusPill } from './badges'
// The app icon itself: the quantized sphere is the one bold thing on this screen.
import appIcon from '../../../../../build/icon.svg?url'

const STEPS = 3

const APP_BLURB: Partial<Record<DestinationKind, string>> = {
  lmstudio: 'Models appear in LM Studio’s library.',
  exo: 'MLX models, run across your devices. Other formats go to your models folder.'
}

function names(apps: DestinationInfo[]): string {
  return apps.map((a) => a.label).join(' and ')
}

/**
 * First run: where models go, and an optional Hugging Face token. LM Studio and
 * exo are offered only when they're on this Mac; without them the models folder
 * is simply where things go, and nothing suggests installing anything.
 */
export function Onboarding() {
  const { data: settings } = useSettings()
  const { data: destinations } = useDestinations()
  const { data: system } = useSystemInfo()
  const update = useUpdateSettings()
  const setView = useUiStore((s) => s.setView)
  const [step, setStep] = useState(0)
  const [folder, setFolder] = useState<string | null>(null)
  const [choice, setChoice] = useState<DestinationKind | null>(null)
  const headingId = useId()
  const heading = useRef<HTMLHeadingElement>(null)

  const apps = destinations ? availableDestinations(destinations).filter((d) => d.kind !== 'custom') : []
  const folderPath = folder ?? settings?.customDir ?? system?.defaultModelsDir ?? null
  // Shown again from Settings: start from the current default. First time:
  // someone with LM Studio installed most likely wants models there.
  const current = settings?.preferredDestination ?? null
  const keepCurrent = current === 'custom' || apps.some((a) => a.kind === current)
  const selected: DestinationKind = choice ?? (keepCurrent ? current! : (apps[0]?.kind ?? 'custom'))

  // Each step announces itself: focus moves to its heading.
  useEffect(() => {
    heading.current?.focus()
  }, [step])

  const pickFolder = async (): Promise<void> => {
    const dir = await window.hfgui.pickDirectory({
      title: 'Choose your models folder',
      defaultPath: folderPath ?? undefined
    })
    if (dir) {
      setFolder(dir)
      setChoice('custom')
    }
  }

  const finish = (skipped: boolean): void => {
    update.mutate({
      onboarded: true,
      // The folder always gets a home, so a download never stops to ask for one.
      customDir: folderPath,
      preferredDestination: skipped ? (settings?.preferredDestination ?? null) : selected
    })
    if (!skipped) setView('browse')
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      className="fixed inset-0 z-40 flex flex-col bg-background"
      data-testid="onboarding"
    >
      {/* The traffic lights sit in this strip; it moves the window like a title bar. */}
      <div className="drag-region flex h-14 shrink-0 items-center justify-end px-4">
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => finish(true)}>
          Skip
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 overflow-y-auto px-6">
        <div className="m-auto w-full max-w-lg pb-14">
          <div className="mb-10 flex gap-1.5" aria-hidden>
            {Array.from({ length: STEPS }, (_, i) => (
              <span key={i} className={cn('h-1 w-8 rounded-full', i <= step ? 'bg-foreground' : 'bg-muted')} />
            ))}
          </div>
          <span className="sr-only">
            Step {step + 1} of {STEPS}
          </span>

          {step === 0 && (
            <div className="flex flex-col items-start gap-7">
              <img src={appIcon} alt="" draggable={false} className="-m-3 size-28" />
              <div className="space-y-3">
                <h1
                  id={headingId}
                  ref={heading}
                  tabIndex={-1}
                  className="text-3xl font-semibold tracking-tight text-balance outline-none"
                >
                  Download open models to this Mac
                </h1>
                <p className="text-base leading-relaxed text-muted-foreground">
                  Search the Hugging Face Hub, get the size that fits your memory, and let big downloads run until
                  they’re done.
                </p>
              </div>
              {system && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Cpu className="size-4 shrink-0" />
                  This Mac has {formatBytes(system.totalMemoryBytes)} of memory: models up to about{' '}
                  {formatBytes(comfortableModelBytes(system.totalMemoryBytes))} fit comfortably.
                </p>
              )}
              <Button size="lg" onClick={() => setStep(1)}>
                Get started
              </Button>
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-6">
              <StepHeading id={headingId} ref={heading} title="Where should models go?">
                {apps.length > 0
                  ? `hfgui found ${names(apps)} on this Mac. Downloads can go straight into ${
                      apps.length > 1 ? 'their libraries' : 'its library'
                    }, or into a plain folder.`
                  : 'Into a plain folder, one subfolder per model. Any app that opens model files can use it.'}
              </StepHeading>

              {apps.length > 0 ? (
                <RadioGroup
                  value={selected}
                  onValueChange={(v) => setChoice(v as DestinationKind)}
                  aria-label="Where models go"
                  className="gap-2"
                >
                  {apps.map((app) => (
                    <Choice key={app.kind} value={app.kind} selected={selected === app.kind} title={app.label}>
                      <StatusPill tone="success">Found on this Mac</StatusPill>
                      <p className="basis-full text-sm text-muted-foreground">{APP_BLURB[app.kind]}</p>
                    </Choice>
                  ))}
                  <Choice value="custom" selected={selected === 'custom'} title="Models folder">
                    <FolderLine path={folderPath} onChange={() => void pickFolder()} />
                  </Choice>
                </RadioGroup>
              ) : (
                <div className="rounded-lg border p-4">
                  <div className="text-sm font-medium">Models folder</div>
                  <FolderLine path={folderPath} onChange={() => void pickFolder()} />
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Each download can still go somewhere else, and you can change this in Settings.
              </p>
              <StepButtons onBack={() => setStep(0)} onNext={() => setStep(2)} next="Continue" />
            </div>
          )}

          {step === 2 && <AccountStep headingId={headingId} heading={heading} onBack={() => setStep(1)} onDone={() => finish(false)} />}
        </div>
      </div>
    </div>
  )
}

function StepHeading({
  id,
  ref,
  title,
  children
}: {
  id: string
  ref: Ref<HTMLHeadingElement>
  title: string
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      <h1 id={id} ref={ref} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
        {title}
      </h1>
      <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  )
}

function StepButtons({ onBack, onNext, next }: { onBack(): void; onNext(): void; next: string }) {
  return (
    <div className="flex items-center gap-2">
      <Button onClick={onNext}>{next}</Button>
      <Button variant="ghost" onClick={onBack}>
        Back
      </Button>
    </div>
  )
}

function Choice({
  value,
  selected,
  title,
  children
}: {
  value: DestinationKind
  selected: boolean
  title: string
  children: ReactNode
}) {
  const id = useId()
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors',
        selected ? 'border-foreground/60 bg-muted/40 ring-1 ring-foreground/60' : 'hover:bg-muted/30'
      )}
    >
      <RadioGroupItem id={id} value={value} className="mt-0.5" data-testid={`onboarding-${value}`} />
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-medium">{title}</span>
        {children}
      </span>
    </label>
  )
}

function FolderLine({ path, onChange }: { path: string | null; onChange(): void }) {
  return (
    <span className="flex basis-full items-center gap-2 pt-1 text-sm text-muted-foreground">
      <FolderOpen className="size-4 shrink-0" />
      <span className="min-w-0 truncate font-mono text-xs" title={path ?? undefined}>
        {path ? displayPath(path) : 'No folder chosen yet'}
      </span>
      <Button
        variant="ghost"
        size="xs"
        className="-my-1 shrink-0"
        onClick={(e) => {
          // Inside the choice's label: change the folder without re-selecting through the click.
          e.preventDefault()
          onChange()
        }}
      >
        Change…
      </Button>
    </span>
  )
}

function AccountStep({
  headingId,
  heading,
  onBack,
  onDone
}: {
  headingId: string
  heading: Ref<HTMLHeadingElement>
  onBack(): void
  onDone(): void
}) {
  const { data: tokenStatus } = useTokenStatus()
  const { data: account } = useHfAccount()
  const openTokenDialog = useUiStore((s) => s.setTokenDialogOpen)

  return (
    <div className="flex flex-col gap-6">
      <StepHeading id={headingId} ref={heading} title="Some models need a Hugging Face account">
        Publishers like Meta and Google ask you to accept their license on huggingface.co first. A free read token
        lets hfgui download those for you. Everything else works without one.
      </StepHeading>

      {tokenStatus?.isSet ? (
        <div className="flex items-center gap-3 rounded-lg border p-4 text-sm">
          {account?.avatarUrl ? (
            <img src={account.avatarUrl} alt="" className="size-8 rounded-full bg-muted" />
          ) : (
            <KeyRound className="size-4 text-muted-foreground" />
          )}
          <span>
            {account ? (
              <>
                Signed in as <span className="font-medium">{account.name}</span>
              </>
            ) : (
              'Token added'
            )}
          </span>
        </div>
      ) : (
        <div>
          <Button variant="outline" onClick={() => openTokenDialog(true)}>
            <KeyRound /> Add a token
          </Button>
        </div>
      )}

      <StepButtons onBack={onBack} onNext={onDone} next="Start browsing" />
    </div>
  )
}
