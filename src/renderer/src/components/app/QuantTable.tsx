import { ArrowDownToLine, Check } from 'lucide-react'
import { Fragment, useMemo } from 'react'
import { formatBytes } from '@shared/format'
import { recommendQuant, type QuantGroup } from '@shared/quant'
import type { DownloadJobSnapshot } from '@shared/types'
import { useSystemInfo } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Dot, FitBadge } from './badges'
import { JobChip } from './JobChip'
import { Tip } from './Tip'

interface QuantTableProps {
  groups: QuantGroup[]
  jobFor(group: QuantGroup): DownloadJobSnapshot | undefined
  onDownload(group: QuantGroup): void
  pendingKey: string | null
  downloadDisabled: boolean
}

/**
 * One row per quantization, smallest first, companion files last. Every row
 * renders its button: the e2e drivers click the first `download-*` and look up
 * `download-F16` by name.
 */
export function QuantTable({ groups, jobFor, onDownload, pendingKey, downloadDisabled }: QuantTableProps) {
  const { data: sys } = useSystemInfo()
  const main = groups.filter((g) => !g.isExtra)
  const extras = groups.filter((g) => g.isExtra)
  const recommendedKey = useMemo(
    () => (sys ? recommendQuant(groups, sys.totalMemoryBytes) : null),
    [groups, sys]
  )

  const row = (group: QuantGroup) => {
    const job = jobFor(group)
    const recommended = group.key === recommendedKey
    const pending = pendingKey === group.key
    return (
      <TableRow key={group.key} className={cn(recommended && 'bg-muted/40 hover:bg-muted/60')}>
        <TableCell className="max-w-0 py-2.5 pl-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[13px] font-semibold">{group.label}</span>
            {recommended && (
              <Tip
                content={`The best quality-for-size that fits this Mac's ${formatBytes(sys?.totalMemoryBytes ?? 0)} of memory`}
              >
                <Badge className="gap-1">
                  <Check className="size-3" />
                  Recommended
                </Badge>
              </Tip>
            )}
            {group.partCount > 1 && group.isComplete && (
              <Badge variant="secondary" className="font-normal">
                {group.partCount} parts
              </Badge>
            )}
            {!group.isComplete && (
              <Tip content="This variant is missing parts on Hugging Face and would not load — check the repo.">
                <Badge variant="outline" className="gap-1.5 text-destructive">
                  <Dot tone="danger" />
                  {group.partCount}/{group.expectedParts} parts
                </Badge>
              </Tip>
            )}
          </div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground" title={group.key}>
            {group.key.split('/').pop()}
          </div>
        </TableCell>
        <TableCell className="text-right font-medium tabular-nums">{formatBytes(group.totalSize)}</TableCell>
        <TableCell>
          <FitBadge sizeBytes={group.totalSize} />
        </TableCell>
        <TableCell className="pr-4 text-right">
          {job ? (
            <span className="inline-flex justify-end">
              <JobChip job={job} />
            </span>
          ) : group.isComplete ? (
            <Button
              variant={recommended ? 'default' : 'outline'}
              size="sm"
              disabled={downloadDisabled || pending}
              onClick={() => onDownload(group)}
              data-testid={`download-${group.label}`}
            >
              {pending ? <Spinner /> : <ArrowDownToLine />}
              Download
            </Button>
          ) : null}
        </TableCell>
      </TableRow>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border">
      <Table className="table-fixed">
        <TableHeader className="bg-muted/40 [&_th]:text-xs [&_th]:text-muted-foreground">
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">Quantization</TableHead>
            <TableHead className="w-24 text-right">Size</TableHead>
            <TableHead className="w-28">Fit</TableHead>
            <TableHead className="w-44 pr-4 text-right">
              <span className="sr-only">Action</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {main.map(row)}
          {extras.length > 0 && (
            <Fragment>
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="bg-muted/30 py-2 pl-4 text-xs font-medium text-muted-foreground">
                  Companion files — vision projector, importance matrix
                </TableCell>
              </TableRow>
              {extras.map(row)}
            </Fragment>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
