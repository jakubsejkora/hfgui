import { Clock, Download, ExternalLink, Heart, Lock } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { formatBytes, formatCount, relativeTime } from '@shared/format'
import { groupGgufFiles, type QuantGroup } from '@shared/quant'
import type { DownloadDestination, DownloadJobSnapshot, TreeFile } from '@shared/types'
import { modelUrl } from '@/lib/hfApi'
import { useDestinations, useModel, useModelTree, useTokenStatus } from '@/lib/queries'
import { useDownloadsStore } from '@/lib/downloadsStore'
import { toast } from '@/lib/toastStore'
import { useUiStore } from '@/lib/uiStore'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { DestinationPicker } from '@/components/app/DestinationPicker'
import { FileList } from '@/components/app/FileList'
import { QuantGroupList } from '@/components/app/QuantGroupList'
import { RamFitBadge } from '@/components/app/RamFitBadge'
import { TokenDialog } from '@/components/app/TokenDialog'

export function ModelDetailView() {
  const selectedModelId = useUiStore((s) => s.selectedModelId)
  const closeModel = useUiStore((s) => s.closeModel)
  const jobs = useDownloadsStore((s) => s.jobs)

  const { data: model, isLoading: modelLoading } = useModel(selectedModelId)
  const tree = useModelTree(selectedModelId, model ? (model.sha ?? 'main') : null)
  const { data: destinations } = useDestinations()
  const { data: tokenStatus } = useTokenStatus()

  const [destination, setDestination] = useState<DownloadDestination | null>(null)
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false)

  // Reset destination when switching models, then pick a sensible default.
  useEffect(() => setDestination(null), [selectedModelId])
  useEffect(() => {
    if (destination || !model || !destinations) return
    const byKind = (kind: string) => destinations.find((d) => d.kind === kind)
    const candidates =
      model.format === 'mlx' ? ['exo', 'lmstudio', 'custom'] : ['lmstudio', 'custom']
    for (const kind of candidates) {
      const info = byKind(kind)
      if (info?.path) {
        setDestination({ kind: info.kind, baseDir: info.path })
        return
      }
    }
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
          j.repoId === selectedModelId &&
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
    void start(group.files, `${model!.name} · ${group.label}`)
  }

  const isGated = !!model && model.gated !== false
  const treeGated = tree.isError && /gated|401|403/i.test((tree.error as Error)?.message ?? '')

  return (
    <>
      <Sheet open={!!selectedModelId} onOpenChange={(o) => !o && closeModel()}>
        {modelLoading || !model ? (
          <div className="flex flex-col gap-4 p-6">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <>
            <div className="border-border flex flex-col gap-2 border-b px-6 pt-6 pb-4">
              <div className="flex items-center gap-2 pr-10">
                <SheetTitle className="selectable min-w-0 truncate text-lg leading-tight font-semibold">
                  {model.name}
                </SheetTitle>
                <Badge variant={model.format === 'gguf' ? 'accent' : model.format === 'mlx' ? 'mlx' : 'default'}>
                  {model.format === 'other' ? model.pipelineTag ?? 'model' : model.format.toUpperCase()}
                </Badge>
                {isGated && (
                  <Badge variant="warning">
                    <Lock className="h-3 w-3" /> gated
                  </Badge>
                )}
              </div>
              <div className="text-muted flex items-center gap-3 text-xs">
                <span className="selectable">{model.author}</span>
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
                <button
                  onClick={() => void window.hfgui.openExternal(modelUrl(model.id))}
                  className="text-muted hover:text-text ml-auto flex cursor-pointer items-center gap-1 underline"
                >
                  Open on HF <ExternalLink className="h-3 w-3" />
                </button>
              </div>
            </div>

            <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
              <section className="flex flex-col gap-2">
                <h3 className="text-faint text-[11px] font-semibold tracking-wider uppercase">
                  Download to
                </h3>
                <DestinationPicker
                  format={model.format}
                  value={destination}
                  onChange={setDestination}
                />
              </section>

              {isGated && !tokenStatus?.isSet && (
                <div className="border-warning/25 bg-warning/10 flex items-center gap-3 rounded-xl border p-3">
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
                <h3 className="text-faint text-[11px] font-semibold tracking-wider uppercase">
                  {model.format === 'gguf' ? 'Quantizations' : 'Files'}
                </h3>

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
                  <QuantGroupList
                    groups={gguf.groups}
                    jobFor={(g) => jobForFiles(g.files)}
                    onDownload={downloadGroup}
                    downloadDisabled={!destination}
                  />
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="border-border bg-surface-2 flex items-center gap-3 rounded-xl border px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold">
                          Whole repository
                          {model.format === 'mlx' && ' (exo needs every file)'}
                        </div>
                        <div className="text-faint text-[11px]">
                          {mlxFiles.length} files · {formatBytes(mlxTotal)}
                        </div>
                      </div>
                      <RamFitBadge sizeBytes={mlxTotal} />
                      {(() => {
                        const job = jobForFiles(mlxFiles)
                        return job && job.state !== 'completed' ? (
                          <Badge variant="accent">
                            {job.totalBytes > 0
                              ? `${Math.round((job.bytesDone / job.totalBytes) * 100)}%`
                              : job.state}
                          </Badge>
                        ) : job?.state === 'completed' ? (
                          <Badge variant="success">Downloaded</Badge>
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
                LM Studio picks up new models when you reopen it (or its My Models page). exo
                loads complete model folders automatically.
              </p>
            </div>
          </>
        )}
      </Sheet>
      <TokenDialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen} />
    </>
  )
}
