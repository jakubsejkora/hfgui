import { create } from 'zustand'
import type { DownloadJobSnapshot } from '@shared/types'

/** The finished download whose update the user is about to start. */
export const useUpdateDialog = create<{
  job: DownloadJobSnapshot | null
  open(job: DownloadJobSnapshot): void
  close(): void
}>((set) => ({
  job: null,
  open: (job) => set({ job }),
  close: () => set({ job: null })
}))
