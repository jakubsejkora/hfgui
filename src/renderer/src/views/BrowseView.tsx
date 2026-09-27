import { ArrowUpDown, SearchX } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { parseModelRef } from '@shared/modelRef'
import { useModelSearch } from '@/lib/queries'
import type { FormatFilter, SortKey } from '@/lib/hfApi'
import { useUiStore } from '@/lib/uiStore'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ModelCard } from '@/components/app/ModelCard'

const SORT_OPTIONS = [
  { value: 'trendingScore', label: 'Trending' },
  { value: 'downloads', label: 'Most downloaded' },
  { value: 'likes', label: 'Most liked' },
  { value: 'lastModified', label: 'Recently updated' }
]

const TASK_OPTIONS = [
  { value: 'all', label: 'All tasks' },
  { value: 'text-generation', label: 'Text generation' },
  { value: 'image-text-to-text', label: 'Vision (VLM)' },
  { value: 'automatic-speech-recognition', label: 'Speech to text' },
  { value: 'text-to-speech', label: 'Text to speech' },
  { value: 'feature-extraction', label: 'Embeddings' }
]

const FORMAT_CHIPS: Array<{ value: FormatFilter; label: string }> = [
  { value: 'gguf', label: 'GGUF' },
  { value: 'mlx', label: 'MLX' },
  { value: null, label: 'All' }
]

/** An empty sleeve — the app's own visual language doing the talking. */
function EmptySleeve({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <div className="sleeve h-[104px] w-[180px] p-2">
        <div className="border-border-strong bezel grain flex h-full w-full items-center justify-center border border-dashed">
          <SearchX className="text-faint h-6 w-6" />
        </div>
      </div>
      {children}
    </div>
  )
}

export function BrowseView() {
  const openModel = useUiStore((s) => s.openModel)
  const search = useUiStore((s) => s.search)
  const [debounced, setDebounced] = useState(search)
  const [sort, setSort] = useState<SortKey>('trendingScore')
  const [format, setFormat] = useState<FormatFilter>('gguf')
  const [task, setTask] = useState('all')

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // A pasted URL is a jump, not a query — feeding it to the Hub's `search=`
  // param would guarantee an empty grid behind the omnibox's Open button.
  const pastedUrl = useMemo(() => parseModelRef(debounced)?.fromUrl === true, [debounced])

  const query = useModelSearch({
    search: pastedUrl ? '' : debounced,
    sort,
    format,
    pipelineTag: task === 'all' ? null : task
  })

  const models = query.data?.pages.flatMap((p) => p.models) ?? []

  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && query.hasNextPage && !query.isFetchingNextPage) {
          void query.fetchNextPage()
        }
      },
      { rootMargin: '600px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage, models.length])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-6 pt-2 pb-4">
        <div className="slot flex items-center gap-0.5 rounded-full p-1">
          {FORMAT_CHIPS.map((chip) => (
            <button
              key={chip.label}
              onClick={() => setFormat(chip.value)}
              className={cn(
                'h-7 cursor-pointer rounded-full px-3.5 text-xs font-medium transition-colors',
                format === chip.value
                  ? 'bg-accent text-accent-fg shadow-accent/20 shadow-md'
                  : 'text-muted hover:text-text'
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <Select
          value={task}
          onValueChange={setTask}
          options={TASK_OPTIONS}
          className="h-9 w-44 rounded-full text-xs"
          ariaLabel="Task"
        />
        <Select
          value={sort}
          onValueChange={(v) => setSort(v as SortKey)}
          options={SORT_OPTIONS}
          icon={<ArrowUpDown className="text-faint h-3.5 w-3.5" />}
          className="ml-auto h-9 w-48 rounded-full text-xs"
          ariaLabel="Sort by"
        />
        {query.isFetching && !query.isFetchingNextPage && (
          <span className="text-faint text-[11px] font-medium tracking-wide uppercase">
            Loading…
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-5">
        {query.isLoading ? (
          <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="rounded-sleeve h-[88px]" />
            ))}
          </div>
        ) : query.isError ? (
          <EmptySleeve>
            <p className="text-muted text-sm">{(query.error as Error).message}</p>
            <Button size="sm" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </EmptySleeve>
        ) : models.length === 0 ? (
          <EmptySleeve>
            <p className="text-muted text-sm">No models found — try a different search or filter.</p>
          </EmptySleeve>
        ) : (
          <>
            <div
              className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]"
              data-testid="model-grid"
            >
              {models.map((model) => (
                <ModelCard key={model.id} model={model} onClick={() => openModel(model.id)} />
              ))}
            </div>
            <div ref={sentinelRef} className="h-10" />
            {query.isFetchingNextPage && (
              <div className="text-faint pb-4 text-center text-[11px] tracking-wide uppercase">
                Loading more…
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
