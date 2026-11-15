import { Lock } from 'lucide-react'
import { formatBytes } from '@shared/format'
import { ramFit, type RamFit } from '@shared/fit'
import { JOB_STATE_LABEL } from '@shared/jobStates'
import type { JobState, ModelFormat } from '@shared/types'
import { useSystemInfo } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Tip } from './Tip'

/**
 * Status colours mean what people expect: green all good (and going, when it
 * pulses), amber needs attention, red a problem stopped it, grey waiting or
 * the user's own doing. The brand's signal red is the logo's, never a status.
 */
export type Tone = 'success' | 'warning' | 'danger' | 'neutral'

const DOT: Record<Tone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
  neutral: 'bg-muted-foreground/60'
}

export function Dot({ tone, pulse, className }: { tone: Tone; pulse?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-1.5 shrink-0 rounded-full', DOT[tone], pulse && 'live-dot', className)}
    />
  )
}

/** Outline pill with a coloured dot — the one status shape used everywhere. */
export function StatusPill({
  tone,
  pulse,
  children,
  className
}: {
  tone: Tone
  pulse?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <Badge variant="outline" className={cn('gap-1.5 font-medium text-foreground/85', className)}>
      <Dot tone={tone} pulse={pulse} />
      {children}
    </Badge>
  )
}

const JOB_TONE: Record<JobState, Tone> = {
  downloading: 'success',
  verifying: 'success',
  queued: 'neutral',
  paused: 'warning',
  completed: 'success',
  error: 'danger',
  cancelled: 'neutral'
}

export function JobStatusBadge({ state, stalled }: { state: JobState; stalled?: boolean }) {
  return (
    <StatusPill tone={stalled ? 'warning' : JOB_TONE[state]} pulse={state === 'downloading' && !stalled}>
      {stalled ? 'Waiting for data' : JOB_STATE_LABEL[state]}
    </StatusPill>
  )
}

const FIT_COPY: Record<RamFit, { tone: Tone; label: string }> = {
  fits: { tone: 'success', label: 'Fits RAM' },
  tight: { tone: 'warning', label: 'Tight fit' },
  'too-big': { tone: 'danger', label: 'Too big' }
}

/** Rough "will it run": weights must fit in unified memory with headroom. */
export function FitBadge({ sizeBytes }: { sizeBytes: number }) {
  const { data: sys } = useSystemInfo()
  if (!sys || sizeBytes <= 0) return null
  const { tone, label } = FIT_COPY[ramFit(sizeBytes, sys.totalMemoryBytes)]
  return (
    <Tip content={`${formatBytes(sizeBytes)} of weights on a Mac with ${formatBytes(sys.totalMemoryBytes)} of memory`}>
      <span className="inline-flex">
        <StatusPill tone={tone}>{label}</StatusPill>
      </span>
    </Tip>
  )
}

export function FormatBadge({ format, className }: { format: ModelFormat; className?: string }) {
  if (format === 'other') return null
  return (
    <Badge
      variant="outline"
      className={cn('rounded-md px-1.5 font-mono text-[10.5px] tracking-wide text-muted-foreground', className)}
    >
      {format.toUpperCase()}
    </Badge>
  )
}

export function GatedBadge() {
  return (
    <Tip content="Gated: accept the license on huggingface.co and add a token to download.">
      <Badge variant="outline" className="rounded-md px-1.5 text-[10.5px] text-muted-foreground">
        <Lock /> Gated
      </Badge>
    </Tip>
  )
}

/** A progress bar says what its status dot says: green going, amber on hold or stalled, grey waiting. */
export function progressColor(state: JobState, stalled = false): string {
  if ((state === 'downloading' || state === 'verifying') && !stalled) return 'bg-success'
  if (state === 'paused' || stalled) return 'bg-warning'
  return 'bg-muted-foreground/50'
}
