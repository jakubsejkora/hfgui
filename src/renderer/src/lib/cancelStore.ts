import { create } from 'zustand'
import type { DownloadJobSnapshot } from '@shared/types'
import { jobActions } from './actions'

interface CancelState {
  /** The job awaiting confirmation, if any. */
  job: DownloadJobSnapshot | null
  close(): void
}

export const useCancelStore = create<CancelState>((set) => ({
  job: null,
  close: () => set({ job: null })
}))

/**
 * Cancelling deletes the partial file — after hours on a 40 GB model, one
 * misclick used to throw all of it away. Ask first, unless there is nothing to
 * lose yet.
 */
export function requestCancel(job: DownloadJobSnapshot): void {
  if (job.bytesDone <= 0) {
    void jobActions.cancel(job.jobId)
    return
  }
  useCancelStore.setState({ job })
}
