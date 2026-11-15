import { useQuery } from '@tanstack/react-query'
import { create } from 'zustand'
import { RELEASES_URL, releaseUrl } from '@shared/project'
import type { AppUpdateStatus } from '@shared/types'
import { openExternal, runAction } from './actions'
import { selectBusyCount, useDownloadsStore } from './downloadsStore'
import { queryClient } from './queryClient'
import { toast } from './toastStore'

/*
 * hfgui's own updates, as the window sees them. Main owns the state (see
 * src/main/appUpdater.ts) and pushes every change; this caches it for the
 * sidebar card, Settings → About and the restart dialog.
 */

const KEY = ['app-update']

export function useAppUpdate() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => window.hfgui.getAppUpdate(),
    staleTime: Infinity
  })
}

/** The version announced this session, so a ready update is toasted once. */
let announced: string | null = null

/** A status from main: cache it, and say so once when a new version is ready. */
export function applyAppUpdate(status: AppUpdateStatus): void {
  queryClient.setQueryData(KEY, status)
  if (status.status !== 'ready' || announced === status.version) return
  announced = status.version
  toast('info', `hfgui ${status.version} is ready`, {
    description: 'It installs the next time you quit — or restart now.',
    actions: [
      { label: 'What’s new', onClick: () => openReleaseNotes(status.version) },
      { label: 'Restart', onClick: requestRestart, testid: 'app-update-toast-restart' }
    ]
  })
}

/** A release's notes on GitHub, or the list of releases. */
export function openReleaseNotes(version?: string): void {
  openExternal(version ? releaseUrl(version) : RELEASES_URL)
}

/** Asked when restarting would interrupt downloads. */
export const useRestartDialog = create<{ open: boolean; setOpen(open: boolean): void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open })
}))

/** Restart into the new version — asking first if downloads are in flight. */
export function requestRestart(): void {
  if (selectBusyCount(useDownloadsStore.getState()) > 0) useRestartDialog.getState().setOpen(true)
  else void restartNow()
}

export async function restartNow(): Promise<boolean> {
  const result = await runAction(window.hfgui.installAppUpdate(), 'Couldn’t restart')
  if (result && !result.ok) toast('error', result.message)
  return result?.ok === true
}

export async function checkAppUpdateNow(): Promise<void> {
  const status = await runAction(window.hfgui.checkAppUpdate(), 'Couldn’t check for updates')
  if (status) queryClient.setQueryData(KEY, status)
}
