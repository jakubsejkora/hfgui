import { CircleArrowUp } from 'lucide-react'
import { useState } from 'react'
import { requestRestart, restartNow, useAppUpdate, useRestartDialog } from '@/lib/appUpdate'
import { selectBusyCount, useDownloadsStore } from '@/lib/downloadsStore'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Spinner } from '@/components/ui/spinner'

/**
 * Sidebar footer card while a new version of hfgui waits to be installed. It
 * installs on quit regardless; the card is the way to have it now. The whole
 * card is the button — the sidebar is too narrow for a label and a button side
 * by side.
 *
 * Wording note: rendered on every page (see AppSidebar) — never "Completed",
 * "No downloads yet.", "Remove from list", "Users" or a path.
 */
export function AppUpdateCard() {
  const { data: status } = useAppUpdate()
  if (status?.status !== 'ready') return null
  return (
    <button
      type="button"
      onClick={requestRestart}
      data-testid="app-update-card"
      className="mx-2 flex cursor-pointer items-center gap-2.5 rounded-lg border border-sidebar-border bg-background/60 px-3 py-2.5 text-left text-xs transition-colors hover:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none dark:bg-sidebar-accent/40 dark:hover:bg-sidebar-accent"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
        <CircleArrowUp className="size-4" aria-hidden />
      </span>
      <span className="grid min-w-0 flex-1 leading-tight">
        <span className="font-medium">Restart to update</span>
        <span className="truncate text-muted-foreground">hfgui {status.version} is ready</span>
      </span>
    </button>
  )
}

/** Restarting would interrupt downloads: say what happens to them first. */
export function RestartDialog() {
  const open = useRestartDialog((s) => s.open)
  const setOpen = useRestartDialog((s) => s.setOpen)
  const busy = useDownloadsStore(selectBusyCount)
  const { data: status } = useAppUpdate()
  const [restarting, setRestarting] = useState(false)
  const version = status?.status === 'ready' ? status.version : null

  const restart = async (): Promise<void> => {
    setRestarting(true)
    // On success hfgui quits; nothing after this runs.
    if (!(await restartNow())) {
      setRestarting(false)
      setOpen(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !restarting && setOpen(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Restart to update?</AlertDialogTitle>
          <AlertDialogDescription>
            {busy === 1 ? 'A download is' : `${busy} downloads are`} in progress. {busy === 1 ? 'It pauses' : 'They pause'}{' '}
            for the restart and {busy === 1 ? 'picks' : 'pick'} up where {busy === 1 ? 'it' : 'they'} left off once
            hfgui{version ? ` ${version}` : ''} opens.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={restarting}>Not now</AlertDialogCancel>
          <AlertDialogAction
            data-testid="app-update-restart-confirm"
            disabled={restarting}
            onClick={(e) => {
              // Keep the dialog up, saying so, until hfgui quits.
              e.preventDefault()
              void restart()
            }}
          >
            {restarting && <Spinner />}
            {restarting ? 'Restarting…' : 'Restart'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
