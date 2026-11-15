import { ERROR_COPY } from '@shared/jobStates'
import type { DownloadJobSnapshot, JobState } from '@shared/types'
import { jobActions } from './actions'
import { toast } from './toastStore'
import { useUiStore } from './uiStore'

const WHERE: Record<DownloadJobSnapshot['destination']['kind'], string> = {
  lmstudio: 'LM Studio',
  exo: 'exo',
  custom: 'your folder'
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
    const reveal = job.files.length === 1 ? `${job.jobDir}/${job.files[0].path}` : job.jobDir
    toast('success', 'Download finished', {
      description: `${job.displayName} is ready in ${WHERE[job.destination.kind]}.`,
      actions:
        job.destination.kind === 'lmstudio'
          ? [{ label: 'Open in LM Studio', onClick: () => void jobActions.openInLmStudio(job.repoId) }]
          : [{ label: 'Show in Finder', onClick: () => void jobActions.reveal(reveal) }]
    })
  } else if (job.state === 'error') {
    const copy = job.error ? ERROR_COPY[job.error.code] : ERROR_COPY.unknown
    toast('error', 'Download failed', {
      description: `${job.displayName} — ${copy.title}.`,
      actions: [{ label: 'View', onClick: () => useUiStore.getState().setView('downloads') }]
    })
  }
}
