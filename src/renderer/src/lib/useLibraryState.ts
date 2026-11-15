import { isInProgress } from '@shared/jobStates'
import { jobFraction, useDownloadsStore } from './downloadsStore'

/**
 * Whether a repo is already in the library: `'done'` once any download of it
 * finished, a 0–100 percentage while one is running, else null. Returns a
 * primitive so a card only re-renders when its own answer changes.
 */
export function useLibraryState(repoId: string): 'done' | number | null {
  return useDownloadsStore((s) => {
    let done = false
    let pct: number | null = null
    for (const job of Object.values(s.jobs)) {
      if (job.repoId !== repoId) continue
      if (isInProgress(job.state)) pct = Math.max(pct ?? 0, Math.floor(jobFraction(job) * 100))
      else if (job.state === 'completed') done = true
    }
    return pct ?? (done ? 'done' : null)
  })
}
