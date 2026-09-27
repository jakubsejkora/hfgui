import {
  Clock,
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
import { useEffect, useMemo, useState } from 'react'
import { defaultDestination } from '@shared/destinationRules'
import { formatBytes, formatCount, relativeTime } from '@shared/format'
import { groupGgufFiles, type QuantGroup } from '@shared/quant'
import type { DownloadDestination, DownloadJobSnapshot, TreeFile } from '@shared/types'
import { HfApiError, modelUrl } from '@/lib/hfApi'
import { useDestinations, useModel, useModelTree, useTokenStatus } from '@/lib/queries'
import { useDownloadsStore } from '@/lib/downloadsStore'
import { toast } from '@/lib/toastStore'
import { useUiStore } from '@/lib/uiStore'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Artwork, NodesEmblem } from '@/components/ui/sleeve'
import { DestinationPicker } from '@/components/app/DestinationPicker'
import { FileList } from '@/components/app/FileList'
import { JobStateChip, QuantGroupList } from '@/components/app/QuantGroupList'
import { RamFitBadge } from '@/components/app/RamFitBadge'
import { TokenDialog } from '@/components/app/TokenDialog'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-faint text-[11px] font-semibold tracking-wider uppercase">{children}</h3>
  )
}

/**
 * A repo can now arrive from a pasted link, so it may simply not exist, or be
 * private, or the network may be down. Without this branch the sheet would sit
 * on a skeleton forever — the failure mode that only shows up once arbitrary
 * repo ids can be opened.
 *
 * Note the Hub answers 401, not 404, for a repo that does not exist: it will
 * not disclose whether a name is unused or private. So one message has to
 * cover both, rather than guessing and being confidently wrong.
 */
function ResolveError({
  repoId,
  error,
  hasToken,
  onRetry,
  onSetToken
}: {
  repoId: string
  error: Error
  hasToken: boolean
  onRetry(): void
  onSetToken(): void
}) {
  const closeModel = useUiStore((s) => s.closeModel)
  const setSearch = useUiStore((s) => s.setSearch)
  const status = error instanceof HfApiError ? error.status : 0
  const missing = status === 401 || status === 403 || status === 404
  const name = repoId.split('/').pop() ?? repoId

  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-4 px-10 text-center"
      data-testid="sheet-error"
      data-error-code={missing ? 'missing' : 'network'}
    >
      <div className="sleeve h-[104px] w-[180px] p-2">
        <div className="border-border-strong bezel grain flex h-full w-full items-center justify-center border border-dashed">
          {missing ? (
            <SearchX className="text-faint h-6 w-6" />
          ) : (
            <WifiOff className="text-faint h-6 w-6" />
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="selectable font-mono text-[13px] font-medium">{repoId}</p>
        <p className="text-muted max-w-sm text-sm leading-relaxed">
          {!missing
            ? error.message
            : hasToken
              ? "isn't reachable. Check the spelling — or your token may not have access to it."
              : "isn't reachable. Check the spelling; if it's a private or gated repo you'll need a token."}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {missing ? (
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              setSearch(name)
              closeModel()
            }}
          >
            <Search className="h-3.5 w-3.5" />
            Search the Hub for “{name}”
          </Button>
        ) : (
          <Button size="sm" variant="primary" onClick={onRetry}>
            <RotateCcw className="h-3.5 w-3.5" />
            Try again
          </Button>
        )}
        {missing && !hasToken && (
          <Button size="sm" onClick={onSetToken}>
            <KeyRound className="h-3.5 w-3.5" />
            Add a token
          </Button>
        )}
        <Button size="sm" onClick={() => void window.hfgui.openExternal(modelUrl(repoId))}>
          Open on HF
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

export function ModelDetailView() {
  const selectedModelId = useUiStore((s) => s.selectedModelId)
  const closeModel = useUiStore((s) => s.closeModel)
  const jobs = useDownloadsStore((s) => s.jobs)

  const modelQuery = useModel(selectedModelId)
  const model = modelQuery.data
  // The Hub is case-insensitive on lookup but case-preserving in `id`. Always
  // work from the canonical id so a pasted "Org/Model" shares a cache entry and
  // matches jobs started from search results.
  const repoId = model?.id ?? selectedModelId
  const tree = useModelTree(model?.id ?? null, model ? (model.sha ?? 'main') : null)
  const { data: destinations } = useDestinations()
  const { data: tokenStatus } = useTokenStatus()

  const [destination, setDestination] = useState<DownloadDestination | null>(null)
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false)

  // Reset destination when switching models, then pick a sensible default.
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

  const mlxFiles = useMemo(
    () => (tree.data ? tree.data.filter((f) => f.path !== '.gitattributes') : []),
    [tree.data]
  )
  const mlxTotal = mlxFiles.reduce((sum, f) => sum + f.size, 0)

  const jobList = Object.values(jobs)
  const jobForFiles = (files: TreeFile[]): DownloadJobSnapshot | undefined => {
    const first = files[0]?.path
    return jobList
      .filter(
        (j) =>
          j.repoId === model?.id &&
          j.files.some((f) => f.path === first) &&
          j.state !== 'cancelled' &&
          j.state !== 'error'
      )
      .sort((a, b) => b.createdAt - a.createdAt)[0]
  }

  const start = async (files: TreeFile[], displayName: string): Promise<void> => {
    if (!model || !destination) return
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
    } else {
      toast('error', result.message)
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
    void start(group.files, `${model!.name} · ${group.label}`)
  }

  const isGated = !!model && model.gated !== false
  const treeGated = tree.isError && /gated|401|403/i.test((tree.error as Error)?.message ?? '')

  return (
    <>
      <Sheet open={!!selectedModelId} onOpenChange={(o) => !o && closeModel()}>
        {modelQuery.isError && repoId ? (
          <ResolveError
            repoId={repoId}
            error={modelQuery.error as Error}
            hasToken={!!tokenStatus?.isSet}
            onRetry={() => void modelQuery.refetch()}
            onSetToken={() => setTokenDialogOpen(true)}
          />
        ) : !model ? (
          <div className="flex flex-col gap-4 p-4">
            <Skeleton className="h-40 w-full" />
            <p className="text-faint selectable px-2 font-mono text-[11px]">Resolving {repoId}…</p>
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <>
            <div className="p-4 pb-0">
              <div className="sleeve p-2">
                <Artwork repoId={model.id} size="hero">
                  <div className="scrim relative flex h-full flex-col justify-between p-5">
                    <div className="relative z-[1] flex items-start justify-between gap-3 pr-12">
                      <NodesEmblem />
                      <div className="flex shrink-0 items-center gap-1.5">
                        {isGated && (
                          <Badge variant="glass">
                            <Lock className="h-3 w-3" /> gated
                          </Badge>
                        )}
                        <Badge variant="glass">
                          {model.format === 'other'
                            ? (model.pipelineTag ?? 'model')
                            : model.format.toUpperCase()}
                        </Badge>
                      </div>
                    </div>
                    <div className="relative z-[1] min-w-0">
                      <SheetTitle asChild>
                        <h2
                          className="selectable truncate text-[32px] leading-none font-light tracking-[-0.04em] text-white"
                          style={{ textShadow: '0 2px 12px rgb(0 0 0 / 0.35)' }}
                        >
                          {model.name}
                        </h2>
                      </SheetTitle>
                      <div className="tnum mt-2.5 flex items-center gap-3 text-[13px] text-white/80">
                        <span className="selectable truncate font-medium">{model.author}</span>
                        <span className="flex items-center gap-1">
                          <Download className="h-3 w-3" />
                          {formatCount(model.downloads)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Heart className="h-3 w-3" />
                          {formatCount(model.likes)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {relativeTime(model.lastModified)}
                        </span>
                      </div>
                    </div>
                  </div>
                </Artwork>
              </div>
            </div>

            <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
              <section className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <SectionLabel>Download to</SectionLabel>
                  <button
                    onClick={() => void window.hfgui.openExternal(modelUrl(model.id))}
                    className="text-muted hover:text-text ml-auto flex cursor-pointer items-center gap-1 text-[11px] underline"
                  >
                    Open on HF <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
                <DestinationPicker
                  format={model.format}
                  value={destination}
                  onChange={setDestination}
                />
              </section>

              {isGated && !tokenStatus?.isSet && (
                <div className="border-warning/25 bg-warning/10 rounded-bezel flex items-center gap-3 border p-3">
                  <p className="text-warning min-w-0 flex-1 text-xs leading-relaxed">
                    Gated model — accept its license on huggingface.co, then add a token so
                    downloads work.
                  </p>
                  <Button size="sm" onClick={() => setTokenDialogOpen(true)}>
                    Set token
                  </Button>
                </div>
              )}

              <section className="flex flex-col gap-2">
                <SectionLabel>{model.format === 'gguf' ? 'Quantizations' : 'Files'}</SectionLabel>

                {tree.isLoading ? (
                  <div className="flex flex-col gap-2">
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                  </div>
                ) : tree.isError ? (
                  <p className="text-muted text-xs leading-relaxed">
                    {treeGated
                      ? 'File list unavailable — this gated model needs an accepted license and a token (Settings → Hugging Face token).'
                      : `Could not load files: ${(tree.error as Error).message}`}
                  </p>
                ) : gguf && gguf.groups.length > 0 ? (
                  <>
                    <p className="text-faint -mt-1 text-[11px] leading-relaxed">
                      Q4_K_M-class quants are the usual sweet spot — smaller saves RAM but loses
                      quality, larger is slower and heavier.
                    </p>
                    <QuantGroupList
                      groups={gguf.groups}
                      jobFor={(g) => jobForFiles(g.files)}
                      onDownload={downloadGroup}
                      downloadDisabled={!destination}
                    />
                  </>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="slot flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold">
                          Whole repository
                          {model.format === 'mlx' && ' (exo needs every file)'}
                        </div>
                        <div className="text-faint tnum text-[11px]">
                          {mlxFiles.length} files · {formatBytes(mlxTotal)}
                        </div>
                      </div>
                      <RamFitBadge sizeBytes={mlxTotal} />
                      {(() => {
                        const job = jobForFiles(mlxFiles)
                        return job ? (
                          <JobStateChip job={job} />
                        ) : (
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={!destination || mlxFiles.length === 0}
                            onClick={() => void start(mlxFiles, model.name)}
                            data-testid="download-all"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Download all
                          </Button>
                        )
                      })()}
                    </div>
                    {mlxFiles.length > 0 && <FileList files={mlxFiles} />}
                  </div>
                )}

                {gguf && gguf.others.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-faint cursor-pointer text-[11px] font-medium">
                      Other files in this repo ({gguf.others.length})
                    </summary>
                    <div className="mt-2">
                      <FileList files={gguf.others} />
                    </div>
                  </details>
                )}
              </section>

              <p className="text-faint mt-auto text-[11px] leading-relaxed">
                Finished LM Studio downloads get an Open in LM Studio button — no relaunch
                needed. exo models register automatically and appear in its dashboard.
              </p>
            </div>
          </>
        )}
      </Sheet>
      <TokenDialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen} />
    </>
  )
}
