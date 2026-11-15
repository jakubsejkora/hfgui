import { errorCopy } from '@shared/jobStates'
import type { DownloadJobSnapshot, JobState } from '@shared/types'
import { jobActions } from './actions'
import { toast } from './toastStore'
import { useUiStore } from './uiStore'

const WHERE: Record<DownloadJobSnapshot['destination']['kind'], string> = {
  lmstudio: 'LM Studio',
  exo: 'exo',
  custom: 'your models folder'
}

/**
 * The in-app counterpart of the main process's notifications: while hfgui is in
 * front, say when a download finishes or fails, with the obvious next step.
 * (In the background, main posts a macOS notification instead.)
 *
 * Copy note: toasts render on every page, so never the literal "Completed",
 * and never a path.
 */
export function announceTransition(previous: JobState | undefined, job: DownloadJobSnapshot): void {
  if (!previous || previous === job.state || !document.hasFocus()) return
  if (job.state === 'completed') {
    // An update moves into the model's folder right after it finishes.
    const dir = job.update?.pendingMove ?? job.jobDir
    const reveal = job.files.length === 1 ? `${dir}/${job.files[0].path}` : dir
    toast('success', job.update ? 'Update finished' : 'Download finished', {
      description: job.update
        ? `${job.displayName} is up to date. The previous version is kept beside it.`
        : `${job.displayName} is ready in ${WHERE[job.destination.kind]}.`,
      actions:
        job.destination.kind === 'lmstudio'
          ? [{ label: 'Open in LM Studio', onClick: () => void jobActions.openInLmStudio(job.repoId) }]
          : [{ label: 'Show in Finder', onClick: () => void jobActions.reveal(reveal) }]
    })
  } else if (job.state === 'error') {
    const copy = errorCopy(job.error)
    toast('error', 'Download failed', {
      description: `${job.displayName} — ${copy.title}.`,
      actions: [{ label: 'View', onClick: () => useUiStore.getState().setView('downloads') }]
    })
  }
}
