import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Compass,
  Cpu,
  FolderOpen,
  HardDrive,
  Layers,
  Play,
  X
} from 'lucide-react'
import type { ReactNode } from 'react'
import { comfortableModelBytes, ramFit } from '@shared/fit'
import { formatBytes, formatSpeed, timeAgo } from '@shared/format'
import { compareJobs, isInProgress, isRunning } from '@shared/jobStates'
import type { DownloadJobSnapshot } from '@shared/types'
import { jobActions } from '@/lib/actions'
import { jobFraction, totalSpeed, useDownloadsStore } from '@/lib/downloadsStore'
import { usePrefs } from '@/lib/prefsStore'
import {
  useDefaultDestination,
  useDiskSpace,
  useModelSearch,
  useStorageReport,
  useSystemInfo
} from '@/lib/queries'
import { useUiStore } from '@/lib/uiStore'
import { cn, destinationHolding } from '@/lib/utils'
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
import { Dot, JobStatusBadge, progressColor } from '@/components/app/badges'
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
  const target = useDefaultDestination('gguf')
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
            {running ? <Dot tone="success" pulse className="size-2" /> : <ArrowDownToLine />}
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
            `On the drive with ${destinationHolding(target)}`
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
            indicatorClassName={progressColor(job.state)}
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

const GUIDE_TOPICS: Array<{ section: string; title: string; icon: typeof BookOpen }> = [
  { section: 'formats', title: 'GGUF or MLX?', icon: Layers },
  { section: 'sizes', title: 'Which size fits this Mac?', icon: Cpu },
  { section: 'location', title: 'Where your models go', icon: FolderOpen },
  { section: 'running', title: 'Running a model', icon: Play }
]

/** New to this? A way into the Guide — dismissible, and never a to-do list. */
function GuideCard() {
  const dismissed = usePrefs((s) => s.guideCardDismissed)
  const setPrefs = usePrefs((s) => s.set)
  const openGuide = useUiStore((s) => s.openGuide)
  if (dismissed) return null

  return (
    <Card className="gap-0 py-0 shadow-xs">
      <CardHeader className="border-b py-4 [.border-b]:pb-4">
        <CardTitle>New to local models?</CardTitle>
        <CardDescription>The basics, in a few minutes.</CardDescription>
        <CardAction>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Hide this card"
            onClick={() => setPrefs({ guideCardDismissed: true })}
          >
            <X />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">
        <ul className="divide-y">
          {GUIDE_TOPICS.map(({ section, title, icon: Icon }) => (
            <li key={section}>
              <button
                type="button"
                onClick={() => openGuide(section)}
                className="flex w-full items-center gap-3 px-5 py-3 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1">{title}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="border-t px-5 py-3 [.border-t]:pt-3">
        <Button variant="link" size="xs" className="h-auto px-0" onClick={() => openGuide()}>
          Read the whole guide
        </Button>
      </CardFooter>
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
  const guideDismissed = usePrefs((s) => s.guideCardDismissed)
  return (
    <Page>
      <PageHeader
        title="Overview"
        description="Downloads and storage at a glance."
        actions={
          <Button size="sm" onClick={() => setView('browse')}>
            <Compass /> Browse models
          </Button>
        }
      />
      <Kpis />
      <div className={cn('grid gap-4', !guideDismissed && 'lg:grid-cols-3')}>
        <RecentDownloads className={guideDismissed ? undefined : 'lg:col-span-2'} />
        <GuideCard />
      </div>
      <TrendingThatFits />
    </Page>
  )
}
