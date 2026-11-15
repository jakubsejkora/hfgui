import {
  ArrowDownToLine,
  ChevronRight,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Heart,
  KeyRound,
  Lock,
  RotateCcw,
  Search,
  SearchX,
  WifiOff
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { defaultDestination } from '@shared/destinationRules'
import { formatParams } from '@shared/fit'
import { formatBytes, formatCount, relativeTime } from '@shared/format'
import { groupGgufFiles, type QuantGroup } from '@shared/quant'
import type { DownloadDestination, DownloadJobSnapshot, TreeFile } from '@shared/types'
import { copyModelLink, openOnHub } from '@/lib/actions'
import { useDownloadsStore } from '@/lib/downloadsStore'
import { HfApiError, type ModelDetail } from '@/lib/hfApi'
import { useDestinations, useInvalidate, useModel, useModelTree, useTokenStatus } from '@/lib/queries'
import { toast } from '@/lib/toastStore'
import { useUiStore } from '@/lib/uiStore'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { FitBadge, FormatBadge } from '@/components/app/badges'
import { DestinationPicker } from '@/components/app/DestinationPicker'
import { FileList } from '@/components/app/FileList'
import { JobChip } from '@/components/app/JobChip'
import { ModelAvatar } from '@/components/app/ModelAvatar'
import { QuantTable } from '@/components/app/QuantTable'
import { Tip } from '@/components/app/Tip'

/**
 * A repo can arrive from a pasted link, so it may simply not exist, or be
 * private, or the network may be down. Without this branch the sheet would sit
 * on a skeleton forever.
 *
 * The Hub answers 401, not 404, for a repo that does not exist: it will not
 * disclose whether a name is unused or private. So one message has to cover
 * both, rather than guessing and being confidently wrong.
 */
function ResolveError({
  repoId,
  error,
  hasToken,
  onRetry
}: {
  repoId: string
  error: Error
  hasToken: boolean
  onRetry(): void
}) {
  const closeModel = useUiStore((s) => s.closeModel)
  const setSearch = useUiStore((s) => s.setSearch)
  const openTokenDialog = useUiStore((s) => s.setTokenDialogOpen)
  const status = error instanceof HfApiError ? error.status : 0
  const missing = status === 401 || status === 403 || status === 404
  const name = repoId.split('/').pop() ?? repoId

  return (
    <Empty
      className="flex-1"
      data-testid="sheet-error"
      data-error-code={missing ? 'missing' : 'network'}
    >
      <EmptyHeader>
        <EmptyMedia variant="icon">{missing ? <SearchX /> : <WifiOff />}</EmptyMedia>
        <EmptyTitle className="selectable font-mono text-base">{repoId}</EmptyTitle>
        <EmptyDescription>
          {!missing
            ? error.message
            : hasToken
              ? "Isn't reachable. Check the spelling — or your token may not have access to it."
              : "Isn't reachable. Check the spelling; if it's a private or gated repo you'll need a token."}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row flex-wrap justify-center">
        {missing ? (
          <Button
            size="sm"
            onClick={() => {
              setSearch(name)
              closeModel()
            }}
          >
            <Search /> Search the Hub for “{name}”
          </Button>
        ) : (
          <Button size="sm" onClick={onRetry}>
            <RotateCcw /> Try again
          </Button>
        )}
        {missing && !hasToken && (
          <Button size="sm" variant="outline" onClick={() => openTokenDialog(true)}>
            <KeyRound /> Add a token
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => openOnHub(repoId)}>
          Open on Hugging Face <ExternalLink />
        </Button>
      </EmptyContent>
    </Empty>
  )
}

function Fact({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-full min-w-0' : 'min-w-0'}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium">{children}</dd>
    </div>
  )
}

function ModelFacts({ model }: { model: ModelDetail }) {
  const openModel = useUiStore((s) => s.openModel)
  const facts: ReactNode[] = []
  const params = formatParams(model.params)
  if (params) facts.push(<Fact key="p" label="Parameters">{params}</Fact>)
  if (model.contextLength)
    facts.push(
      <Fact key="c" label="Context">
        {model.contextLength >= 1024
          ? `${Math.round(model.contextLength / 1024)}K tokens`
          : `${model.contextLength} tokens`}
      </Fact>
    )
  if (model.architecture) facts.push(<Fact key="a" label="Architecture">{model.architecture}</Fact>)
  if (model.license) facts.push(<Fact key="l" label="License">{model.license}</Fact>)
  if (model.baseModel && model.baseModel !== model.id)
    facts.push(
      <Fact key="b" label="Base model" wide>
        <button
          type="button"
          onClick={() => openModel(model.baseModel!)}
          className="max-w-full cursor-pointer truncate underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
          title={model.baseModel}
        >
          {model.baseModel}
        </button>
      </Fact>
    )
  if (facts.length === 0) return null
  return (
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-x-6 gap-y-3 rounded-lg border px-4 py-3">
      {facts}
    </dl>
  )
}

function SheetSection({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}

export function ModelDetailView() {
  const selectedModelId = useUiStore((s) => s.selectedModelId)
  const closeModel = useUiStore((s) => s.closeModel)
  const openTokenDialog = useUiStore((s) => s.setTokenDialogOpen)
  const invalidate = useInvalidate()

  const modelQuery = useModel(selectedModelId)
  const model = modelQuery.data
  // The Hub is case-insensitive on lookup but case-preserving in `id`. Always
  // work from the canonical id so a pasted "Org/Model" shares a cache entry and
  // matches jobs started from search results.
  const repoId = model?.id ?? selectedModelId
  const tree = useModelTree(model?.id ?? null, model ? (model.sha ?? 'main') : null)
  const { data: destinations } = useDestinations()
  const { data: tokenStatus } = useTokenStatus()

  // Only this repo's jobs: subscribing to the whole map re-rendered the sheet
  // on every progress tick of every download.
  const repoJobs = useDownloadsStore(
    useShallow((s) => Object.values(s.jobs).filter((j) => j.repoId === repoId))
  )

  const [destination, setDestination] = useState<DownloadDestination | null>(null)
  const [pendingKey, setPendingKey] = useState<string | null>(null)

  // Reset destination when switching models, then pick a sensible default. An
  // explicit pick is never overridden.
  useEffect(() => setDestination(null), [selectedModelId])
  useEffect(() => {
    if (destination || !model || !destinations) return
    const info = defaultDestination(model.format, destinations)
    if (info?.path) setDestination({ kind: info.kind, baseDir: info.path })
  }, [destination, model, destinations])

  const gguf = useMemo(
    () => (model?.format === 'gguf' && tree.data ? groupGgufFiles(tree.data) : null),
    [model?.format, tree.data]
  )
  const repoFiles = useMemo(
    () => (tree.data ? tree.data.filter((f) => f.path !== '.gitattributes') : []),
    [tree.data]
  )
  const repoTotal = repoFiles.reduce((sum, f) => sum + f.size, 0)

  /** The latest job for these files at the selected destination. */
  const jobFor = (files: TreeFile[]): DownloadJobSnapshot | undefined => {
    const first = files[0]?.path
    return repoJobs
      .filter(
        (j) =>
          j.files.some((f) => f.path === first) &&
          (!destination ||
            (j.destination.kind === destination.kind && j.destination.baseDir === destination.baseDir))
      )
      .sort((a, b) => b.createdAt - a.createdAt)[0]
  }

  const start = async (key: string, files: TreeFile[], displayName: string): Promise<void> => {
    if (!model || !destination || pendingKey) return
    setPendingKey(key)
    try {
      const result = await window.hfgui.startDownload({
        repoId: model.id,
        revision: model.sha ?? 'main',
        displayName,
        format: model.format,
        files,
        destination
      })
      if (result.ok) {
        toast('success', `Added “${displayName}” to downloads`)
        // Main remembers the custom folder; show it everywhere.
        if (destination.kind === 'custom') invalidate(['settings', 'destinations'])
      } else {
        toast('error', result.message)
      }
    } catch (error) {
      toast('error', `Couldn’t start the download — ${(error as Error).message}`)
    } finally {
      setPendingKey(null)
    }
  }

  const downloadGroup = (group: QuantGroup): void => {
    if (!group.isComplete) {
      toast(
        'error',
        `${group.label} is missing parts on Hugging Face (${group.partCount}/${group.expectedParts}) — downloading it would produce a broken model`
      )
      return
    }
    void start(group.key, group.files, `${model!.name} · ${group.label}`)
  }

  const isGated = !!model && model.gated !== false
  const treeGated = tree.isError && /gated|401|403/i.test((tree.error as Error)?.message ?? '')
  const wholeRepoJob = model && !gguf ? jobFor(repoFiles) : undefined

  return (
    <Sheet open={!!selectedModelId} onOpenChange={(o) => !o && closeModel()}>
      <SheetContent
        side="right"
        className="w-[680px] max-w-[94vw] gap-0 p-0 outline-none sm:max-w-[680px]"
        // A toast's action button sits outside the sheet; clicking it must not
        // count as "click outside" and close the sheet underneath.
        onInteractOutside={(e) => {
          if ((e.target as Element | null)?.closest?.('[data-slot="toaster"]')) e.preventDefault()
        }}
        // Focus the panel, not its first button: that button has a tooltip, and a
        // tooltip opened by focus pops up on every open — and takes the first
        // Escape for itself, leaving the sheet open. Tab still enters the content.
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement | null)?.focus()
        }}
      >
        {modelQuery.isError && repoId ? (
          <>
            <SheetTitle className="sr-only">{repoId}</SheetTitle>
            <SheetDescription className="sr-only">This model could not be loaded.</SheetDescription>
            <ResolveError
              repoId={repoId}
              error={modelQuery.error as Error}
              hasToken={!!tokenStatus?.isSet}
              onRetry={() => void modelQuery.refetch()}
            />
          </>
        ) : !model ? (
          <div className="flex flex-col gap-6 p-6">
            <SheetTitle className="sr-only">Loading {repoId}</SheetTitle>
            <SheetDescription className="sr-only">Fetching model details.</SheetDescription>
            <div className="flex items-center gap-4">
              <Skeleton className="size-12 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            </div>
            <p className="selectable font-mono text-xs text-muted-foreground">Resolving {repoId}…</p>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <>
            <header className="flex flex-col gap-4 border-b px-6 pt-6 pb-5">
              <div className="flex items-start gap-4 pr-8">
                <ModelAvatar repoId={model.id} size="lg" />
                <div className="min-w-0 flex-1">
                  <SheetTitle className="selectable truncate text-lg leading-tight font-semibold">
                    {model.name}
                  </SheetTitle>
                  <SheetDescription className="selectable mt-1 truncate">{model.author}</SheetDescription>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <FormatBadge format={model.format} />
                    {model.pipelineTag && (
                      <Badge variant="secondary" className="rounded-md font-normal">
                        {model.pipelineTag}
                      </Badge>
                    )}
                    {isGated && (
                      <Badge variant="outline" className="rounded-md text-muted-foreground">
                        <Lock /> Gated
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground tabular-nums">
                <span className="flex items-center gap-1">
                  <Download className="size-3.5" /> {formatCount(model.downloads)} downloads
                </span>
                <span className="flex items-center gap-1">
                  <Heart className="size-3.5" /> {formatCount(model.likes)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="size-3.5" /> Updated {relativeTime(model.lastModified)}
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                  <Tip content="Copy link">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="Copy link"
                      onClick={() => void copyModelLink(model.id)}
                    >
                      <Copy />
                    </Button>
                  </Tip>
                  <Button variant="outline" size="sm" onClick={() => openOnHub(model.id)}>
                    Open on Hugging Face <ExternalLink />
                  </Button>
                </div>
              </div>
            </header>

            <div className="flex flex-1 flex-col gap-8 overflow-y-auto px-6 py-6">
              <ModelFacts model={model} />

              <SheetSection title="Save to">
                <DestinationPicker format={model.format} value={destination} onChange={setDestination} />
              </SheetSection>

              {isGated && !tokenStatus?.isSet && (
                <Alert>
                  <Lock />
                  <AlertTitle>This model is gated</AlertTitle>
                  <AlertDescription>
                    <p>Accept its license on huggingface.co, then add a token so downloads work.</p>
                    <Button size="sm" variant="outline" className="mt-2" onClick={() => openTokenDialog(true)}>
                      <KeyRound /> Add token
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              <SheetSection
                title={gguf && gguf.groups.length > 0 ? 'Quantizations' : 'Files'}
                description={
                  gguf && gguf.groups.length > 0
                    ? 'Q4_K_M-class quants are the usual sweet spot — smaller saves memory but loses quality; larger is slower and heavier.'
                    : undefined
                }
              >
                {!destination && !tree.isLoading && !tree.isError && (
                  <p className="text-xs text-muted-foreground">
                    Choose where to save this model above to enable downloads.
                  </p>
                )}
                {tree.isLoading ? (
                  <div className="flex flex-col gap-2">
                    <Skeleton className="h-11 w-full" />
                    <Skeleton className="h-11 w-full" />
                    <Skeleton className="h-11 w-full" />
                  </div>
                ) : tree.isError ? (
                  <Alert variant="destructive">
                    <AlertTitle>File list unavailable</AlertTitle>
                    <AlertDescription>
                      {treeGated
                        ? 'This gated model needs an accepted license and a token (Settings → Hugging Face).'
                        : `Could not load files: ${(tree.error as Error).message}`}
                    </AlertDescription>
                  </Alert>
                ) : gguf && gguf.groups.length > 0 ? (
                  <QuantTable
                    groups={gguf.groups}
                    jobFor={(g) => jobFor(g.files)}
                    onDownload={downloadGroup}
                    pendingKey={pendingKey}
                    downloadDisabled={!destination}
                  />
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3 rounded-xl border p-4">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">
                          Whole repository
                          {model.format === 'mlx' && (
                            <span className="font-normal text-muted-foreground"> · exo needs every file</span>
                          )}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                          {repoFiles.length} files · {formatBytes(repoTotal)}
                        </div>
                      </div>
                      <FitBadge sizeBytes={repoTotal} />
                      {wholeRepoJob ? (
                        <JobChip job={wholeRepoJob} />
                      ) : (
                        <Button
                          size="sm"
                          disabled={!destination || repoFiles.length === 0 || pendingKey !== null}
                          onClick={() => void start('__repo__', repoFiles, model.name)}
                          data-testid="download-all"
                        >
                          {pendingKey === '__repo__' ? <Spinner /> : <ArrowDownToLine />}
                          Download all
                        </Button>
                      )}
                    </div>
                    {repoFiles.length > 0 && (
                      <Collapsible>
                        <CollapsibleTrigger className="group flex cursor-pointer items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                          <ChevronRight className="size-3.5 transition-transform group-data-[state=open]:rotate-90" />
                          Show {repoFiles.length} files
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pt-2">
                          <FileList files={repoFiles} />
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </div>
                )}

                {gguf && gguf.others.length > 0 && (
                  <Collapsible>
                    <CollapsibleTrigger className="group flex cursor-pointer items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                      <ChevronRight className="size-3.5 transition-transform group-data-[state=open]:rotate-90" />
                      Other files in this repo ({gguf.others.length})
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2">
                      <FileList files={gguf.others} />
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </SheetSection>

              <p className="mt-auto text-xs leading-relaxed text-muted-foreground">
                Finished LM Studio downloads get an Open in LM Studio button — no relaunch needed. exo
                models register automatically and appear in its dashboard.
              </p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
