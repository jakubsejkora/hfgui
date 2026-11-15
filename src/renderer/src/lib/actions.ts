import type { ActionResult } from '@shared/types'
import { ignoreClipboardRepo } from './clipboardMemory'
import { modelUrl } from './hfApi'
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

export const jobActions = {
  pause: (jobId: string) => runAction(window.hfgui.pauseDownload(jobId), 'Couldn’t pause'),
  resume: async (jobId: string): Promise<void> => {
    const result: ActionResult | undefined = await runAction(
      window.hfgui.resumeDownload(jobId),
      'Couldn’t resume'
    )
    if (result && !result.ok) toast('error', result.message)
  },
  cancel: (jobId: string) => runAction(window.hfgui.cancelDownload(jobId), 'Couldn’t cancel'),
  remove: (jobId: string) =>
    runAction(window.hfgui.removeDownload(jobId), 'Couldn’t remove it from the list'),
  retryExo: (jobId: string) =>
    runAction(window.hfgui.retryExoRegistration(jobId), 'Couldn’t reach exo'),
  reveal: (path: string) => runAction(window.hfgui.revealPath(path), 'Couldn’t open Finder'),
  openInLmStudio: (repoId: string) =>
    runAction(window.hfgui.openInLmStudio(repoId), 'Couldn’t open LM Studio')
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
