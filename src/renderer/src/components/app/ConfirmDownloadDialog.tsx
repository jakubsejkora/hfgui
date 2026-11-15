import { formatBytes } from '@shared/format'
import { jobActions } from '@/lib/actions'
import { useConfirmStore } from '@/lib/cancelStore'
import { useDownloadsStore } from '@/lib/downloadsStore'
import { useStorageReport } from '@/lib/queries'
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
import { Button } from '@/components/ui/button'

const WHERE = { lmstudio: 'LM Studio', exo: 'exo', custom: 'your folder' } as const

/** The one confirmation for destructive download actions: cancel, discard, delete files. */
export function ConfirmDownloadDialog() {
  const request = useConfirmStore((s) => s.request)
  const close = useConfirmStore((s) => s.close)
  // Read the live job so byte counts keep up while the dialog is open.
  const live = useDownloadsStore((s) => (request ? s.jobs[request.job.jobId] : undefined))
  const { data: report } = useStorageReport()
  const job = live ?? request?.job

  if (!request || !job) return null

  const running = job.state === 'downloading' || job.state === 'queued'
  const finished = job.state === 'completed'
  const held = report?.held[job.jobId] ?? job.bytesDone

  let title: string
  let body: React.ReactNode
  let confirm: string
  let keep = 'Keep it'
  if (request.kind === 'cancel') {
    title = 'Cancel this download?'
    body = (
      <>
        <span className="font-medium text-foreground">{job.displayName}</span> —{' '}
        {formatBytes(job.bytesDone)} of {formatBytes(job.totalBytes)} downloaded so far will be
        deleted. {running && 'To keep it, pause instead.'}
      </>
    )
    confirm = 'Cancel and delete'
    if (running) keep = 'Keep downloading'
  } else if (finished) {
    title = 'Delete this model from disk?'
    body = (
      <>
        Deletes <span className="font-medium text-foreground">{job.displayName}</span> (
        {formatBytes(job.totalBytes)}) from {WHERE[job.destination.kind]}. Other quantizations in
        the same folder are kept.
        {job.destination.kind === 'exo' && ' exo may keep listing the model until you remove it there.'}
      </>
    )
    confirm = 'Delete files'
  } else {
    title = 'Discard this download?'
    body = (
      <>
        <span className="font-medium text-foreground">{job.displayName}</span> leaves the list
        {held > 0 ? <>, and the {formatBytes(held)} it downloaded is deleted.</> : '.'}
      </>
    )
    confirm = 'Discard'
  }

  return (
    <AlertDialog open onOpenChange={(open) => !open && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{keep}</AlertDialogCancel>
          {request.kind === 'cancel' && running && (
            <Button
              variant="outline"
              onClick={() => {
                void jobActions.pause(job.jobId)
                close()
              }}
            >
              Pause instead
            </Button>
          )}
          <AlertDialogAction
            data-testid={request.kind === 'cancel' ? 'cancel-confirm' : 'delete-confirm'}
            variant="destructive"
            onClick={() => {
              if (request.kind === 'cancel') void jobActions.cancel(job.jobId)
              else void jobActions.delete(job.jobId)
            }}
          >
            {confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
