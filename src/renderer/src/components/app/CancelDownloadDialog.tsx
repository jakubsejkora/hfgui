import { formatBytes } from '@shared/format'
import { jobActions } from '@/lib/actions'
import { useCancelStore } from '@/lib/cancelStore'
import { useDownloadsStore } from '@/lib/downloadsStore'
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

export function CancelDownloadDialog() {
  const pending = useCancelStore((s) => s.job)
  const close = useCancelStore((s) => s.close)
  // Read the live job so the byte count keeps up while the dialog is open.
  const live = useDownloadsStore((s) => (pending ? s.jobs[pending.jobId] : undefined))
  const job = live ?? pending
  const running = job?.state === 'downloading' || job?.state === 'queued'

  return (
    <AlertDialog open={!!pending} onOpenChange={(open) => !open && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this download?</AlertDialogTitle>
          <AlertDialogDescription>
            {job && (
              <>
                <span className="font-medium text-foreground">{job.displayName}</span> —{' '}
                {formatBytes(job.bytesDone)} of {formatBytes(job.totalBytes)} downloaded so far will be
                deleted. {running && 'To keep it, pause instead.'}
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{running ? 'Keep downloading' : 'Keep it'}</AlertDialogCancel>
          {running && job && (
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
            data-testid="cancel-confirm"
            variant="destructive"
            onClick={() => {
              if (job) void jobActions.cancel(job.jobId)
            }}
          >
            Cancel and delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
