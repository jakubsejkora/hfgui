import { create } from 'zustand'
import { isBusy, isInProgress } from '@shared/jobStates'
import type { DownloadEvent, DownloadJobSnapshot } from '@shared/types'

export interface ProgressInfo {
  bytesPerSec: number
  etaSec: number | null
  currentFile: string | null
  /** When this sample arrived — a stalled connection simply stops sending them. */
  at: number
}

interface DownloadsState {
  jobs: Record<string, DownloadJobSnapshot>
  /** Live speed/ETA, only for jobs that are actually downloading. */
  progress: Record<string, ProgressInfo>
  hydrated: boolean
  hydrate(): Promise<void>
  applyEvent(ev: DownloadEvent): void
}

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record
  const { [key]: _drop, ...rest } = record
  return rest
}

export const useDownloadsStore = create<DownloadsState>((set, get) => ({
  jobs: {},
  progress: {},
  hydrated: false,

  hydrate: async () => {
    try {
      const list = await window.hfgui.listDownloads()
      const listed: Record<string, DownloadJobSnapshot> = {}
      for (const snap of list) listed[snap.jobId] = snap
      // An event that raced ahead of the list is newer than the list's copy.
      set((s) => ({ jobs: { ...listed, ...s.jobs }, hydrated: true }))
    } catch {
      set({ hydrated: true })
    }
  },

  applyEvent: (ev) => {
    if (ev.type === 'state') {
      set((s) => ({
        jobs: { ...s.jobs, [ev.jobId]: ev.snapshot },
        // Speed and ETA describe a running transfer. Keeping them past it showed
        // "8 MB/s · 5m left" on queued jobs and inflated the combined speed.
        progress: ev.snapshot.state === 'downloading' ? s.progress : without(s.progress, ev.jobId)
      }))
      return
    }
    if (ev.type === 'removed') {
      set((s) => ({ jobs: without(s.jobs, ev.jobId), progress: without(s.progress, ev.jobId) }))
      return
    }
    // progress
    const job = get().jobs[ev.jobId]
    if (!job || job.state !== 'downloading') return
    set((s) => ({
      // Drivers read bytesDone live through __hfguiTest.getJobs().
      jobs: { ...s.jobs, [ev.jobId]: { ...job, bytesDone: ev.bytesDone } },
      progress: {
        ...s.progress,
        [ev.jobId]: {
          bytesPerSec: ev.bytesPerSec,
          etaSec: ev.etaSec,
          currentFile: ev.currentFile,
          at: Date.now()
        }
      }
    }))
  }
}))

/** Jobs that will progress without the user doing anything (sidebar + Dock badge). */
export function selectBusyCount(s: DownloadsState): number {
  let n = 0
  for (const job of Object.values(s.jobs)) if (isBusy(job.state)) n++
  return n
}

export function selectInProgressCount(s: DownloadsState): number {
  let n = 0
  for (const job of Object.values(s.jobs)) if (isInProgress(job.state)) n++
  return n
}

/** Combined live speed of every running download, bytes/sec. */
export function totalSpeed(
  jobs: Record<string, DownloadJobSnapshot>,
  progress: Record<string, ProgressInfo>
): number {
  let sum = 0
  for (const job of Object.values(jobs)) {
    if (job.state === 'downloading') sum += progress[job.jobId]?.bytesPerSec ?? 0
  }
  return sum
}

/** No progress sample for this long means the transfer is stalled, not slow. */
export const STALL_MS = 5000

export function jobFraction(job: Pick<DownloadJobSnapshot, 'bytesDone' | 'totalBytes'>): number {
  return job.totalBytes > 0 ? Math.min(1, job.bytesDone / job.totalBytes) : 0
}
