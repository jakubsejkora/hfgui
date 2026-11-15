import { errorCopy, isBusy } from '@shared/jobStates'
import type { DownloadEvent, DownloadJobSnapshot, JobState } from '@shared/types'

/*
 * What the Dock and Notification Center say about downloads. Pure on purpose —
 * no electron import — so the transition rules are unit-tested; index.ts wires
 * the real Notification, Dock badge and progress bar in.
 */

export interface DownloadNotice {
  jobId: string
  title: string
  body: string
}

export interface NotifierDeps {
  /** The user's Settings switch. */
  enabled(): boolean
  /** In the foreground the renderer shows an in-app toast instead. */
  appFocused(): boolean
  notify(notice: DownloadNotice): void
  /** Dock badge text; '' clears it. */
  setBadge(text: string): void
  /** Dock progress bar, 0–1; -1 removes it. */
  setProgress(fraction: number): void
}

const DESTINATION: Record<DownloadJobSnapshot['destination']['kind'], string> = {
  lmstudio: 'LM Studio',
  exo: 'exo',
  custom: 'your models folder'
}

export function noticeFor(job: DownloadJobSnapshot): DownloadNotice | null {
  if (job.state === 'completed') {
    return job.update
      ? {
          jobId: job.jobId,
          title: 'Update finished',
          body: `${job.displayName} is up to date. The previous version is kept beside it.`
        }
      : {
          jobId: job.jobId,
          title: 'Download finished',
          body: `${job.displayName} is ready in ${DESTINATION[job.destination.kind]}.`
        }
  }
  if (job.state === 'error') {
    const copy = errorCopy(job.error)
    return { jobId: job.jobId, title: 'Download failed', body: `${job.displayName} — ${copy.title}.` }
  }
  return null
}

interface Live {
  state: JobState
  bytesDone: number
  totalBytes: number
}

export function createNotifier(deps: NotifierDeps, initial: DownloadJobSnapshot[]) {
  const jobs = new Map<string, Live>()
  for (const j of initial) jobs.set(j.jobId, { state: j.state, bytesDone: j.bytesDone, totalBytes: j.totalBytes })
  let progressDirty = true
  let lastBadge: string | null = null

  const refreshBadge = (): void => {
    let busy = 0
    for (const j of jobs.values()) if (isBusy(j.state)) busy++
    const text = busy > 0 ? String(busy) : ''
    if (text !== lastBadge) {
      lastBadge = text
      deps.setBadge(text)
    }
  }

  return {
    handle(ev: DownloadEvent): void {
      if (ev.type === 'removed') {
        jobs.delete(ev.jobId)
        refreshBadge()
        progressDirty = true
        return
      }
      if (ev.type === 'progress') {
        const live = jobs.get(ev.jobId)
        if (live) {
          live.bytesDone = ev.bytesDone
          live.totalBytes = ev.totalBytes
          progressDirty = true
        }
        return
      }
      if (ev.type === 'updates') return
      const { snapshot } = ev
      const previous = jobs.get(ev.jobId)?.state
      jobs.set(ev.jobId, {
        state: snapshot.state,
        bytesDone: snapshot.bytesDone,
        totalBytes: snapshot.totalBytes
      })
      refreshBadge()
      progressDirty = true
      // Only a real transition counts. exo registration re-sends `completed`
      // for finished jobs (on every launch, too), and must stay silent.
      if (previous === undefined || previous === snapshot.state) return
      const notice = noticeFor(snapshot)
      if (notice && deps.enabled() && !deps.appFocused()) deps.notify(notice)
    },

    /** Call about once a second: progress events arrive several times a second per job. */
    tick(): void {
      if (!progressDirty) return
      progressDirty = false
      let done = 0
      let total = 0
      for (const j of jobs.values()) {
        if (!isBusy(j.state)) continue
        done += j.bytesDone
        total += j.totalBytes
      }
      deps.setProgress(total > 0 ? Math.min(1, done / total) : -1)
    }
  }
}
