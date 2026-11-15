import { formatBytes } from '@shared/format'
import type { ActionResult, DownloadJobSnapshot } from '@shared/types'
import { ignoreClipboardRepo } from './clipboardMemory'
import { modelUrl } from './hfApi'
import { queryClient } from './queryClient'
import { toast } from './toastStore'

/**
 * Run an IPC action and say so when it fails. Buttons used to `void` these
 * promises, so a rejected call vanished without a word.
 */
export async function runAction<T>(work: Promise<T>, failure: string): Promise<T | undefined> {
  try {
    return await work
  } catch (error) {
    toast('error', `${failure} — ${(error as Error).message}`)
    return undefined
  }
}

/** Disk usage changed: re-read it now rather than waiting for a download event. */
function refreshStorage(): void {
  void queryClient.invalidateQueries({ queryKey: ['storage-report'] })
  void queryClient.invalidateQueries({ queryKey: ['disk-space'] })
}

export const jobActions = {
  pause: (jobId: string) => runAction(window.hfgui.pauseDownload(jobId), 'Couldn’t pause'),
  resume: async (jobId: string): Promise<void> => {
    const result: ActionResult | undefined = await runAction(
      window.hfgui.resumeDownload(jobId),
      'Couldn’t resume'
    )
    if (result && !result.ok) toast('error', result.message)
  },
  cancel: async (jobId: string): Promise<void> => {
    await runAction(window.hfgui.cancelDownload(jobId), 'Couldn’t cancel')
    refreshStorage()
  },
  remove: (jobId: string) =>
    runAction(window.hfgui.removeDownload(jobId), 'Couldn’t remove it from the list'),
  retryExo: (jobId: string) =>
    runAction(window.hfgui.retryExoRegistration(jobId), 'Couldn’t reach exo'),
  reveal: (path: string) => runAction(window.hfgui.revealPath(path), 'Couldn’t open Finder'),
  openInLmStudio: (repoId: string) =>
    runAction(window.hfgui.openInLmStudio(repoId), 'Couldn’t open LM Studio'),

  /** Remove from the list and delete the data — a model's files, or partial data. */
  delete: async (jobId: string): Promise<void> => {
    const result = await runAction(window.hfgui.deleteDownload(jobId), 'Couldn’t delete it')
    refreshStorage()
    if (!result) return
    if (!result.ok) {
      toast('error', result.message)
      return
    }
    toast('success', result.freedBytes > 0 ? `Freed ${formatBytes(result.freedBytes)}` : 'Removed', {
      description:
        result.keptShared > 0
          ? `Kept ${result.keptShared === 1 ? 'a file' : `${result.keptShared} files`} another download in the list also uses.`
          : undefined
    })
  },

  /** A finished model whose files went missing: fetch it again, then drop the stale row. */
  redownload: async (job: DownloadJobSnapshot): Promise<void> => {
    const result = await runAction(
      window.hfgui.startDownload({
        repoId: job.repoId,
        revision: job.revision,
        displayName: job.displayName,
        format: job.format,
        files: job.files.map((f) => ({ path: f.path, size: f.size, sha256: f.sha256 ?? null })),
        destination: job.destination
      }),
      'Couldn’t start the download'
    )
    if (!result) return
    if (!result.ok) {
      toast('error', result.message)
      return
    }
    await window.hfgui.removeDownload(job.jobId).catch(() => {})
    refreshStorage()
    toast('success', `Downloading ${job.displayName} again`)
  },

  /** Delete data of unfinished downloads that are no longer in the list. */
  cleanLeftovers: async (): Promise<void> => {
    const result = await runAction(window.hfgui.cleanLeftovers(), 'Couldn’t clean up')
    refreshStorage()
    if (!result) return
    toast('success', result.freedBytes > 0 ? `Freed ${formatBytes(result.freedBytes)}` : 'Nothing left to clean up', {
      description:
        result.files > 0
          ? `Deleted ${result.files} ${result.files === 1 ? 'file' : 'files'} from downloads that never finished.`
          : undefined
    })
  }
}

export function openExternal(url: string): void {
  void runAction(window.hfgui.openExternal(url), 'Couldn’t open the browser')
}

export function openOnHub(repoId: string): void {
  openExternal(modelUrl(repoId))
}

export async function copyText(text: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast('success', `${label} copied`)
  } catch {
    toast('error', 'Couldn’t write to the clipboard')
  }
}

/** Copy a model's Hub link without the clipboard chip offering it straight back. */
export function copyModelLink(repoId: string): Promise<void> {
  ignoreClipboardRepo(repoId)
  return copyText(modelUrl(repoId), 'Link')
}
