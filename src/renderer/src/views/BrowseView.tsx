import { ArrowUpDown, Search, SearchX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useModelSearch } from '@/lib/queries'
import type { FormatFilter, SortKey } from '@/lib/hfApi'
import { useUiStore } from '@/lib/uiStore'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

export function BrowseView() {
  const openModel = useUiStore((s) => s.openModel)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('trendingScore')
  const [format, setFormat] = useState<FormatFilter>('gguf')
  const [task, setTask] = useState('all')

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const query = useModelSearch({
    search,
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
      <div className="border-border flex flex-col gap-3 border-b px-6 pt-6 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="text-faint pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search Hugging Face models…"
              className="h-10 rounded-xl pl-9"
              data-testid="search-input"
            />
          </div>
          <Select
            value={sort}
            onValueChange={(v) => setSort(v as SortKey)}
            options={SORT_OPTIONS}
            icon={<ArrowUpDown className="text-faint h-3.5 w-3.5" />}
            className="h-10 w-48 rounded-xl"
            ariaLabel="Sort by"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-surface-2 border-border flex items-center gap-0.5 rounded-full border p-0.5">
            {FORMAT_CHIPS.map((chip) => (
              <button
                key={chip.label}
                onClick={() => setFormat(chip.value)}
                className={cn(
                  'h-6.5 cursor-pointer rounded-full px-3 text-xs font-medium transition-colors',
                  format === chip.value
                    ? 'bg-accent text-black'
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
            className="h-8 w-44 rounded-full text-xs"
            ariaLabel="Task"
          />
          {query.isFetching && !query.isFetchingNextPage && (
            <span className="text-faint ml-auto text-xs">Loading…</span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {query.isLoading ? (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="h-[104px] rounded-xl" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <p className="text-muted text-sm">{(query.error as Error).message}</p>
            <Button size="sm" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </div>
        ) : models.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <SearchX className="text-faint h-8 w-8" />
            <p className="text-muted text-sm">No models found — try a different search or filter.</p>
          </div>
        ) : (
          <>
            <div
              className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]"
              data-testid="model-grid"
            >
              {models.map((model) => (
                <ModelCard key={model.id} model={model} onClick={() => openModel(model.id)} />
              ))}
            </div>
            <div ref={sentinelRef} className="h-10" />
            {query.isFetchingNextPage && (
              <div className="text-faint pb-4 text-center text-xs">Loading more…</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
