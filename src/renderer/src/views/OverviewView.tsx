import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  Compass,
  Cpu,
  ExternalLink,
  HardDrive,
  KeyRound,
  X
} from 'lucide-react'
import type { ReactNode } from 'react'
import { defaultDestination } from '@shared/destinationRules'
import { comfortableModelBytes, ramFit } from '@shared/fit'
import { formatBytes, formatSpeed, timeAgo } from '@shared/format'
import { compareJobs, isInProgress, isRunning } from '@shared/jobStates'
import type { DownloadJobSnapshot } from '@shared/types'
import { jobActions, openExternal } from '@/lib/actions'
import { jobFraction, totalSpeed, useDownloadsStore } from '@/lib/downloadsStore'
import { usePrefs } from '@/lib/prefsStore'
import {
  useDestinations,
  useDiskSpace,
  useModelSearch,
  useStorageReport,
  useSystemInfo,
  useTokenStatus
} from '@/lib/queries'
import { useUiStore } from '@/lib/uiStore'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Dot, JobStatusBadge } from '@/components/app/badges'
import { ModelAvatar } from '@/components/app/ModelAvatar'
import { ModelCard, ModelCardSkeleton } from '@/components/app/ModelCard'
import { Page, PageHeader, Section } from '@/components/app/Page'

/*
 * Copy note: this page can sit under the model sheet while the e2e drivers
 * read the page. It must render no absolute path (or the word "Users"), no
 * speed-limit switch or speed chip, and no testid starting with "download-".
 */

function Kpi({
  label,
  value,
  footer,
  action,
  children
}: {
  label: string
  value: ReactNode
  footer: ReactNode
  action?: ReactNode
  children?: ReactNode
}) {
  return (
    <Card className="gap-3 py-5 shadow-xs">
      <CardHeader className="px-5">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tracking-tight tabular-nums">{value}</CardTitle>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      {children && <CardContent className="px-5">{children}</CardContent>}
      <CardFooter className="px-5 text-xs text-muted-foreground">{footer}</CardFooter>
    </Card>
  )
}

function IconTile({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-8 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground [&_svg]:size-4">
      {children}
    </span>
  )
}

function Kpis() {
  const jobs = useDownloadsStore((s) => s.jobs)
  const speed = useDownloadsStore((s) => totalSpeed(s.jobs, s.progress))
  const { data: system } = useSystemInfo()
  const { data: destinations } = useDestinations()
  const target = destinations ? defaultDestination('gguf', destinations) : null
  const { data: disk } = useDiskSpace(target?.path)
  const { data: report } = useStorageReport()
  const reclaimable = report?.leftovers.bytes ?? 0

  const list = Object.values(jobs)
  const inProgress = list.filter((j) => isInProgress(j.state))
  const running = list.some((j) => isRunning(j.state))
  const finished = list.filter((j) => j.state === 'completed')
  const finishedBytes = finished.reduce((sum, j) => sum + j.totalBytes, 0)
  const used = disk && disk.totalBytes > 0 ? 1 - disk.freeBytes / disk.totalBytes : null
  const lowSpace = disk && disk.totalBytes > 0 && disk.freeBytes / disk.totalBytes < 0.1

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi
        label="In progress"
        value={inProgress.length}
        action={
          <IconTile>
            {running ? <Dot tone="live" pulse className="size-2" /> : <ArrowDownToLine />}
          </IconTile>
        }
        footer={speed > 0 ? `${formatSpeed(speed)} combined` : inProgress.length > 0 ? 'Paused or waiting' : 'Idle'}
      />
      <Kpi
        label="Downloaded"
        value={finished.length}
        action={
          <IconTile>
            <Check />
          </IconTile>
        }
        footer={finished.length > 0 ? `${formatBytes(finishedBytes)} of models` : 'Nothing yet'}
      />
      <Kpi
        label="Free space"
        value={disk ? formatBytes(disk.freeBytes) : '—'}
        action={
          <IconTile>
            <HardDrive />
          </IconTile>
        }
        footer={
          reclaimable > 0 ? (
            <span className="flex flex-wrap items-center gap-x-1">
              {formatBytes(reclaimable)} reclaimable ·
              <Button
                variant="link"
                size="xs"
                className="h-auto px-0 text-xs"
                onClick={() => void jobActions.cleanLeftovers()}
              >
                Clean up
              </Button>
            </span>
          ) : target ? (
            `Where ${target.label} downloads land`
          ) : (
            'Choose a folder in Settings'
          )
        }
      >
        {used !== null && (
          <Progress
            value={used * 100}
            aria-label="Disk used"
            indicatorClassName={cn(lowSpace ? 'bg-warning' : 'bg-foreground/70')}
          />
        )}
      </Kpi>
      <Kpi
        label="Memory"
        value={system ? formatBytes(system.totalMemoryBytes) : '—'}
        action={
          <IconTile>
            <Cpu />
          </IconTile>
        }
        footer={
          system
            ? `Models up to ~${formatBytes(comfortableModelBytes(system.totalMemoryBytes))} fit comfortably`
            : ' '
        }
      />
    </div>
  )
}

function RecentRow({ job }: { job: DownloadJobSnapshot }) {
  const setView = useUiStore((s) => s.setView)
  const pct = Math.floor(jobFraction(job) * 100)
  return (
    <li>
      <button
        type="button"
        onClick={() => setView('downloads')}
        className="flex w-full cursor-pointer items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
      >
        <ModelAvatar repoId={job.repoId} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{job.displayName}</div>
          <div className="truncate text-xs text-muted-foreground tabular-nums">
            {isInProgress(job.state)
              ? `${formatBytes(job.bytesDone)} of ${formatBytes(job.totalBytes)}`
              : job.state === 'completed'
                ? `${formatBytes(job.totalBytes)} · ${timeAgo(job.completedAt ?? job.createdAt)}`
                : timeAgo(job.createdAt)}
          </div>
        </div>
        {isInProgress(job.state) && (
          <Progress
            value={pct}
            className="hidden w-24 @md:block"
            indicatorClassName={job.state === 'downloading' ? 'bg-brand' : 'bg-muted-foreground/50'}
          />
        )}
        <JobStatusBadge state={job.state} />
      </button>
    </li>
  )
}

function RecentDownloads({ className }: { className?: string }) {
  const jobs = useDownloadsStore((s) => s.jobs)
  const hydrated = useDownloadsStore((s) => s.hydrated)
  const setView = useUiStore((s) => s.setView)
  const recent = Object.values(jobs).sort(compareJobs).slice(0, 5)

  return (
    <Card className={cn('@container gap-0 py-0 shadow-xs', className)}>
      <CardHeader className="border-b py-4 [.border-b]:pb-4">
        <CardTitle>Recent downloads</CardTitle>
        <CardDescription>What’s moving now, then what landed last.</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" onClick={() => setView('downloads')}>
            View all <ArrowRight />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex-1 px-0">
        {!hydrated ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : recent.length === 0 ? (
          <div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 px-5 py-8 text-center">
            <p className="text-sm text-muted-foreground">Nothing downloaded yet — find a model to start.</p>
            <Button size="sm" variant="outline" onClick={() => setView('browse')}>
              <Compass /> Browse models
            </Button>
          </div>
        ) : (
          <ul className="divide-y">
            {recent.map((job) => (
              <RecentRow key={job.jobId} job={job} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

interface Step {
  title: string
  description: string
  done: boolean
  optional?: boolean
  action?: ReactNode
}

function SetupGuide() {
  const { data: destinations } = useDestinations()
  const { data: tokenStatus } = useTokenStatus()
  const hasFinished = useDownloadsStore((s) => Object.values(s.jobs).some((j) => j.state === 'completed'))
  const dismissed = usePrefs((s) => s.setupGuideDismissed)
  const setPrefs = usePrefs((s) => s.set)
  const setView = useUiStore((s) => s.setView)
  const openTokenDialog = useUiStore((s) => s.setTokenDialogOpen)

  if (dismissed || !destinations || !tokenStatus) return null
  const lmstudio = destinations.find((d) => d.kind === 'lmstudio')
  const exo = destinations.find((d) => d.kind === 'exo')

  const steps: Step[] = [
    {
      title: 'Connect LM Studio',
      description: 'GGUF and MLX models land right where LM Studio finds them.',
      done: !!lmstudio?.path,
      action: (
        <Button variant="outline" size="xs" onClick={() => openExternal('https://lmstudio.ai')}>
          Get LM Studio <ExternalLink />
        </Button>
      )
    },
    {
      title: 'Connect exo',
      description: 'Run MLX models across your Macs.',
      done: !!exo?.path,
      optional: true,
      action: (
        <Button
          variant="outline"
          size="xs"
          onClick={() => openExternal('https://github.com/exo-explore/exo')}
        >
          Get exo <ExternalLink />
        </Button>
      )
    },
    {
      title: 'Add a Hugging Face token',
      description: 'Unlocks gated models such as Llama and Gemma.',
      done: !!tokenStatus.isSet,
      optional: true,
      action: (
        <Button variant="outline" size="xs" onClick={() => openTokenDialog(true)}>
          <KeyRound /> Add token
        </Button>
      )
    },
    {
      title: 'Download your first model',
      description: 'Pick a quant that fits this Mac — hfgui recommends one.',
      done: hasFinished,
      action: (
        <Button size="xs" onClick={() => setView('browse')}>
          Browse models
        </Button>
      )
    }
  ]
  const done = steps.filter((s) => s.done).length

  return (
    <Card className="gap-0 py-0 shadow-xs">
      <CardHeader className="border-b py-4 [.border-b]:pb-4">
        <CardTitle>Setup guide</CardTitle>
        <CardDescription className="tabular-nums">
          {done} of {steps.length} done
        </CardDescription>
        <CardAction>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Hide the setup guide"
            onClick={() => setPrefs({ setupGuideDismissed: true })}
          >
            <X />
          </Button>
        </CardAction>
        <Progress value={(done / steps.length) * 100} className="col-span-2 mt-2" />
      </CardHeader>
      <CardContent className="px-0">
        <ol className="divide-y">
          {steps.map((step) => (
            <li key={step.title} className="flex gap-3 px-5 py-3.5">
              <span
                className={cn(
                  'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border',
                  step.done ? 'border-foreground bg-foreground text-background' : 'border-dashed border-muted-foreground/50'
                )}
                aria-hidden
              >
                {step.done && <Check className="size-3" />}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <div className={cn('text-sm font-medium', step.done && 'text-muted-foreground')}>
                  {step.title}
                  {step.optional && !step.done && (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">Optional</span>
                  )}
                  <span className="sr-only">{step.done ? ' — done' : ' — to do'}</span>
                </div>
                {!step.done && (
                  <>
                    <p className="text-xs leading-relaxed text-muted-foreground">{step.description}</p>
                    <div className="pt-1">{step.action}</div>
                  </>
                )}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

/** Trending GGUF models, filtered to what this Mac can actually run. */
function TrendingThatFits() {
  const { data: system } = useSystemInfo()
  const openModel = useUiStore((s) => s.openModel)
  const setView = useUiStore((s) => s.setView)
  const setPrefs = usePrefs((s) => s.set)
  // Same key as Browse's default listing, so the two share one cache entry.
  const query = useModelSearch({ search: '', sort: 'trendingScore', format: 'gguf', pipelineTag: null })
  const models = (query.data?.pages[0]?.models ?? [])
    .filter((m) => !system || (m.sizeBytes != null && ramFit(m.sizeBytes, system.totalMemoryBytes) === 'fits'))
    .slice(0, 6)

  const browseTrending = (): void => {
    setPrefs({ format: 'gguf', task: 'all', sort: 'trendingScore' })
    setView('browse')
  }

  return (
    <Section
      title="Trending models that fit this Mac"
      description="This week’s most popular GGUF models whose recommended quant fits in memory."
      actions={
        <Button variant="ghost" size="sm" onClick={browseTrending}>
          Browse all <ArrowRight />
        </Button>
      }
    >
      {query.isLoading ? (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
          {Array.from({ length: 6 }).map((_, i) => (
            <ModelCardSkeleton key={i} />
          ))}
        </div>
      ) : models.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          {query.isError ? 'Couldn’t reach Hugging Face just now.' : 'No trending models fit right now.'}
        </p>
      ) : (
        <div
          className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]"
          data-testid="overview-trending"
        >
          {models.map((m) => (
            <ModelCard key={m.id} model={m} onClick={() => openModel(m.id)} />
          ))}
        </div>
      )}
    </Section>
  )
}

export function OverviewView() {
  const setView = useUiStore((s) => s.setView)
  const guideDismissed = usePrefs((s) => s.setupGuideDismissed)
  return (
    <Page>
      <PageHeader
        title="Overview"
        description="Downloads, storage and setup at a glance."
        actions={
          <Button size="sm" onClick={() => setView('browse')}>
            <Compass /> Browse models
          </Button>
        }
      />
      <Kpis />
      <div className={cn('grid gap-4', !guideDismissed && 'lg:grid-cols-3')}>
        <RecentDownloads className={guideDismissed ? undefined : 'lg:col-span-2'} />
        <SetupGuide />
      </div>
      <TrendingThatFits />
    </Page>
  )
}
