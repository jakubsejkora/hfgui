import { ArrowDownToLine, CheckCircle2, CircleAlert, Compass, Loader } from 'lucide-react'
import { formatSpeed } from '@shared/format'
import { compareJobs, jobGroup, type JobGroup } from '@shared/jobStates'
import type { DownloadJobSnapshot } from '@shared/types'
import { jobActions } from '@/lib/actions'
import { totalSpeed, useDownloadsStore } from '@/lib/downloadsStore'
import { usePrefs, type DownloadsTab } from '@/lib/prefsStore'
import { toast } from '@/lib/toastStore'
import { useUiStore } from '@/lib/uiStore'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DownloadsTable } from '@/components/app/DownloadsTable'
import { Page, PageHeader } from '@/components/app/Page'

const TAB_GROUP: Record<Exclude<DownloadsTab, 'all'>, JobGroup> = {
  'in-progress': 'in-progress',
  finished: 'completed',
  failed: 'failed'
}

/*
 * Copy note: the e2e drivers wait for the text "Completed" here and expect it
 * to be a finished row's status, so no tab, heading or summary on this page may
 * say "completed" — finished jobs are "finished" everywhere but their badge.
 * The empty state must keep the exact words "No downloads yet.".
 */
const EMPTY: Record<DownloadsTab, { icon: typeof Compass; title: string; description: string }> = {
  all: {
    icon: ArrowDownToLine,
    title: 'No downloads yet.',
    description: 'Models you download land here, with live progress and Finder access.'
  },
  'in-progress': {
    icon: Loader,
    title: 'Nothing downloading',
    description: 'Start a download from Browse, or drag a model card onto a destination.'
  },
  finished: {
    icon: CheckCircle2,
    title: 'Nothing finished yet',
    description: 'Finished downloads stay listed here until you clear them.'
  },
  failed: {
    icon: CircleAlert,
    title: 'No failed downloads',
    description: 'Anything that fails or is stopped shows up here, ready to retry.'
  }
}

export function DownloadsView() {
  const jobs = useDownloadsStore((s) => s.jobs)
  const hydrated = useDownloadsStore((s) => s.hydrated)
  const speed = useDownloadsStore((s) => totalSpeed(s.jobs, s.progress))
  const tab = usePrefs((s) => s.downloadsTab)
  const setPrefs = usePrefs((s) => s.set)
  const setView = useUiStore((s) => s.setView)

  const all = Object.values(jobs).sort(compareJobs)
  const byGroup = (g: JobGroup): DownloadJobSnapshot[] => all.filter((j) => jobGroup(j.state) === g)
  const inProgress = byGroup('in-progress')
  const finished = byGroup('completed')
  const failed = byGroup('failed')
  const visible = tab === 'all' ? all : byGroup(TAB_GROUP[tab])

  const clearFinished = (): void => {
    for (const job of finished) void jobActions.remove(job.jobId)
    toast('info', `Cleared ${finished.length} from the list`, {
      description: 'The model files stay where they are.'
    })
  }

  const summary = [
    inProgress.length > 0 && `${inProgress.length} in progress`,
    speed > 0 && formatSpeed(speed),
    finished.length > 0 && `${finished.length} finished`,
    failed.length > 0 && `${failed.length} need attention`
  ].filter(Boolean)

  const empty = EMPTY[tab]
  const EmptyIcon = empty.icon

  return (
    <Page>
      <PageHeader
        title="Downloads"
        description={
          summary.length > 0
            ? summary.join(' · ')
            : 'Everything hfgui has fetched, and what is still on its way.'
        }
        actions={
          finished.length > 0 && (
            <Button variant="outline" size="sm" onClick={clearFinished}>
              Clear finished
            </Button>
          )
        }
      />

      <Tabs value={tab} onValueChange={(v) => setPrefs({ downloadsTab: v as DownloadsTab })}>
        <TabsList>
          <TabsTrigger value="all">
            All <Count n={all.length} />
          </TabsTrigger>
          <TabsTrigger value="in-progress">
            In progress <Count n={inProgress.length} />
          </TabsTrigger>
          <TabsTrigger value="finished">
            Finished <Count n={finished.length} />
          </TabsTrigger>
          <TabsTrigger value="failed">
            Failed <Count n={failed.length} />
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {!hydrated ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : visible.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <EmptyIcon />
            </EmptyMedia>
            <EmptyTitle>{empty.title}</EmptyTitle>
            <EmptyDescription>{empty.description}</EmptyDescription>
          </EmptyHeader>
          {tab === 'all' && (
            <EmptyContent>
              <Button size="sm" onClick={() => setView('browse')}>
                <Compass /> Browse models
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <DownloadsTable jobs={visible} />
      )}
    </Page>
  )
}

function Count({ n }: { n: number }) {
  if (n === 0) return null
  return (
    <Badge variant="secondary" className="ml-1 h-5 min-w-5 rounded-full px-1.5 tabular-nums">
      {n}
    </Badge>
  )
}
