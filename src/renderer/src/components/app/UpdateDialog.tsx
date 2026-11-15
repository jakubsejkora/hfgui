import { RefreshCw } from 'lucide-react'
import { useEffect, useId, useState, type ReactNode } from 'react'
import { describeChanges } from '@shared/changes'
import { formatBytes } from '@shared/format'
import { jobActions } from '@/lib/actions'
import { usePrefs } from '@/lib/prefsStore'
import { useUpdates } from '@/lib/queries'
import { useUpdateDialog } from '@/lib/updateDialog'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Spinner } from '@/components/ui/spinner'

type Choice = 'replace' | 'keep'

function Option({ value, selected, title, children }: { value: Choice; selected: boolean; title: string; children: ReactNode }) {
  const id = useId()
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-colors',
        selected ? 'border-foreground/60 bg-muted/40 ring-1 ring-foreground/60' : 'hover:bg-muted/30'
      )}
    >
      <RadioGroupItem id={id} value={value} className="mt-0.5" data-testid={`update-${value}`} />
      <span className="grid gap-1">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs leading-relaxed text-muted-foreground">{children}</span>
      </span>
    </label>
  )
}

/**
 * Before an update starts: what changed, what it costs, and whether the
 * current version stays. The choice is remembered for next time.
 */
export function UpdateDialog() {
  const job = useUpdateDialog((s) => s.job)
  const close = useUpdateDialog((s) => s.close)
  const status = useUpdates().data?.[job?.jobId ?? '']
  const keepsOld = usePrefs((s) => s.updateKeepsOld)
  const setPrefs = usePrefs((s) => s.set)
  const [choice, setChoice] = useState<Choice>(keepsOld ? 'keep' : 'replace')
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    setChoice(usePrefs.getState().updateKeepsOld ? 'keep' : 'replace')
    setStarting(false)
  }, [job?.jobId])

  if (!job) return null
  const update = status?.status === 'available' ? status : null
  const folder = job.jobDir.split('/').pop()
  const published = update?.lastModified
    ? new Date(update.lastModified).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null

  const start = async (): Promise<void> => {
    setStarting(true)
    setPrefs({ updateKeepsOld: choice === 'keep' })
    const started = await jobActions.update(job, choice === 'keep', update?.fetchBytes)
    setStarting(false)
    if (started) close()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !starting && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update {job.displayName}?</DialogTitle>
          <DialogDescription>
            {update ? (
              <>
                The {describeChanges(update.changed)} changed{published && <> on {published}</>}. Only the changed
                files download: {formatBytes(update.fetchBytes)}. Updates start right away, even while other
                downloads wait their turn.
              </>
            ) : (
              'A newer version is on Hugging Face.'
            )}
          </DialogDescription>
        </DialogHeader>
        <RadioGroup value={choice} onValueChange={(v) => setChoice(v as Choice)} className="gap-2" aria-label="The current version">
          <Option value="replace" selected={choice === 'replace'} title="Replace it">
            The model’s folder gets the new version, and the old files are deleted once it’s in place.
          </Option>
          <Option value="keep" selected={choice === 'keep'} title="Keep both versions">
            The current version moves to <span className="font-mono">{folder}@{job.revision.slice(0, 7)}</span>.
            Files that didn’t change are shared, so it takes almost no extra space.
          </Option>
        </RadioGroup>
        <DialogFooter>
          <Button variant="outline" disabled={starting} onClick={close}>
            Cancel
          </Button>
          <Button disabled={starting} onClick={() => void start()} data-testid="update-confirm">
            {starting ? <Spinner /> : <RefreshCw />}
            {starting ? 'Starting…' : 'Update'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
