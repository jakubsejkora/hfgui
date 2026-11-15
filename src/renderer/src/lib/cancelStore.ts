import { create } from 'zustand'
import type { DownloadJobSnapshot } from '@shared/types'
import { jobActions } from './actions'

/** A destructive download action waiting for confirmation. */
export type ConfirmKind =
  /** Stop a running/paused download and delete what it downloaded. */
  | 'cancel'
  /** Remove a download and delete its data: a finished model's files, or partial data. */
  | 'delete'

interface ConfirmState {
  request: { kind: ConfirmKind; job: DownloadJobSnapshot } | null
  close(): void
}

export const useConfirmStore = create<ConfirmState>((set) => ({
  request: null,
  close: () => set({ request: null })
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
  useConfirmStore.setState({ request: { kind: 'cancel', job } })
}

/** Delete a download's data from disk — always confirmed. */
export function requestDelete(job: DownloadJobSnapshot): void {
  useConfirmStore.setState({ request: { kind: 'delete', job } })
}
