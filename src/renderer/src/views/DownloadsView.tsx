import { ArrowDownToLine } from 'lucide-react'
import type { DownloadJobSnapshot } from '@shared/types'
import { sortedJobs, useDownloadsStore } from '@/lib/downloadsStore'
import { useUiStore } from '@/lib/uiStore'
import { Button } from '@/components/ui/button'
import { DownloadRow } from '@/components/app/DownloadRow'

function Section({ title, jobs, extra }: { title: string; jobs: DownloadJobSnapshot[]; extra?: React.ReactNode }) {
  const progress = useDownloadsStore((s) => s.progress)
  if (jobs.length === 0) return null
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <h2 className="text-faint text-[11px] font-semibold tracking-wider uppercase">
          {title} · {jobs.length}
        </h2>
        <div className="ml-auto">{extra}</div>
      </div>
      {jobs.map((job) => (
        <DownloadRow key={job.jobId} job={job} progress={progress[job.jobId]} />
      ))}
    </section>
  )
}

export function DownloadsView() {
  const jobs = useDownloadsStore((s) => s.jobs)
  const setView = useUiStore((s) => s.setView)
  const all = sortedJobs(jobs)

  const active = all.filter((j) =>
    ['queued', 'downloading', 'verifying', 'paused'].includes(j.state)
  )
  const stopped = all.filter((j) => j.state === 'error' || j.state === 'cancelled')
  const completed = all.filter((j) => j.state === 'completed')

  const clearCompleted = (): void => {
    for (const job of completed) void window.hfgui.removeDownload(job.jobId)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-border border-b px-6 pt-6 pb-4">
        <h1 className="text-[15px] font-semibold">Downloads</h1>
      </div>
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
        {all.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <ArrowDownToLine className="text-faint h-8 w-8" />
            <p className="text-muted text-sm">No downloads yet.</p>
            <Button size="sm" onClick={() => setView('browse')}>
              Browse models
            </Button>
          </div>
        ) : (
          <>
            <Section title="Active" jobs={active} />
            <Section title="Stopped" jobs={stopped} />
            <Section
              title="Completed"
              jobs={completed}
              extra={
                completed.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearCompleted}>
                    Clear all
                  </Button>
                )
              }
            />
          </>
        )}
      </div>
    </div>
  )
}
