import { create } from 'zustand'
import type { DownloadEvent, DownloadJobSnapshot } from '@shared/types'

export interface ProgressInfo {
  bytesPerSec: number
  etaSec: number | null
  currentFile: string | null
}

interface DownloadsState {
  jobs: Record<string, DownloadJobSnapshot>
  progress: Record<string, ProgressInfo>
  hydrated: boolean
  hydrate(): Promise<void>
  applyEvent(ev: DownloadEvent): void
}

export const useDownloadsStore = create<DownloadsState>((set, get) => ({
  jobs: {},
  progress: {},
  hydrated: false,

  hydrate: async () => {
    const list = await window.hfgui.listDownloads()
    const jobs: Record<string, DownloadJobSnapshot> = {}
    for (const snap of list) jobs[snap.jobId] = snap
    set({ jobs, hydrated: true })
  },

  applyEvent: (ev) => {
    if (ev.type === 'state') {
      set((s) => ({ jobs: { ...s.jobs, [ev.jobId]: ev.snapshot } }))
      return
    }
    if (ev.type === 'progress') {
      const job = get().jobs[ev.jobId]
      set((s) => ({
        jobs: job
          ? { ...s.jobs, [ev.jobId]: { ...job, bytesDone: ev.bytesDone } }
          : s.jobs,
        progress: {
          ...s.progress,
          [ev.jobId]: {
            bytesPerSec: ev.bytesPerSec,
            etaSec: ev.etaSec,
            currentFile: ev.currentFile
          }
        }
      }))
    }
  }
}))

export const ACTIVE_JOB_STATES = new Set(['queued', 'downloading', 'verifying'])

export function selectActiveCount(jobs: Record<string, DownloadJobSnapshot>): number {
  return Object.values(jobs).filter((j) => ACTIVE_JOB_STATES.has(j.state)).length
}

export function sortedJobs(jobs: Record<string, DownloadJobSnapshot>): DownloadJobSnapshot[] {
  return Object.values(jobs).sort((a, b) => b.createdAt - a.createdAt)
}
