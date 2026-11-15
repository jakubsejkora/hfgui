import { ArrowUpDown, LayoutGrid, List, RotateCcw, SearchX, WifiOff } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { parseModelRef } from '@shared/modelRef'
import type { FormatFilter, SortKey } from '@/lib/hfApi'
import { usePrefs, type BrowseLayout } from '@/lib/prefsStore'
import { useBrowseQuery } from '@/lib/queries'
import { useScrollRoot } from '@/lib/scrollRoot'
import { useUiStore } from '@/lib/uiStore'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ModelCard, ModelCardSkeleton } from '@/components/app/ModelCard'
import { ModelTable } from '@/components/app/ModelTable'
import { Page, PageHeader } from '@/components/app/Page'

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
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

const formatValue = (f: FormatFilter): string => f ?? 'all'
const formatFromValue = (v: string): FormatFilter => (v === 'gguf' || v === 'mlx' ? v : null)

/** Where Browse was scrolled to, kept across visits to other pages this session. */
let savedScrollTop = 0

export function BrowseView() {
  const openModel = useUiStore((s) => s.openModel)
  const search = useUiStore((s) => s.search)
  const setSearch = useUiStore((s) => s.setSearch)
  const { format, task, sort, layout, set: setPrefs } = usePrefs()
  const scrollRoot = useScrollRoot()

  const [debounced, setDebounced] = useState(search)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // A pasted URL is a jump, not a query — feeding it to the Hub's `search=`
  // param would guarantee an empty grid behind the omnibox's Open button.
  const pastedUrl = useMemo(() => parseModelRef(debounced)?.fromUrl === true, [debounced])
  const query = useBrowseQuery(pastedUrl ? '' : debounced)
  const models = query.data?.pages.flatMap((p) => p.models) ?? []
  // Results from the previous filter stay up while the new ones load; say so.
  const stale = query.isPlaceholderData

  // Infinite scroll. The observer must be rooted at the scrolling element: with
  // the default (viewport) root, the overflow container clips the sentinel and
  // the 600 px prefetch margin never applied.
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
      { root: scrollRoot?.current ?? null, rootMargin: '600px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage, models.length, scrollRoot])

  // Come back to where you were after visiting a model's page or Downloads.
  const restored = useRef(false)
  useLayoutEffect(() => {
    const root = scrollRoot?.current
    if (!root || restored.current || models.length === 0) return
    restored.current = true
    root.scrollTop = savedScrollTop
  }, [models.length, scrollRoot])
  useEffect(() => {
    const root = scrollRoot?.current
    return () => {
      if (root) savedScrollTop = root.scrollTop
    }
  }, [scrollRoot])

  const clearFilters = (): void => {
    setSearch('')
    setPrefs({ format: null, task: 'all' })
  }

  return (
    <Page className="max-w-[1600px] gap-4">
      <PageHeader
        title="Browse"
        description={
          debounced && !pastedUrl
            ? `Results for “${debounced}” on the Hugging Face Hub`
            : 'Open models on the Hugging Face Hub, sized for this Mac.'
        }
      />

      {/* Sticky so filters stay in reach while scrolling a long result list. */}
      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-2 bg-background/95 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={formatValue(format)}
          onValueChange={(v) => v && setPrefs({ format: formatFromValue(v) })}
          aria-label="Format"
        >
          <ToggleGroupItem value="gguf" className="px-3">
            GGUF
          </ToggleGroupItem>
          <ToggleGroupItem value="mlx" className="px-3">
            MLX
          </ToggleGroupItem>
          <ToggleGroupItem value="all" className="px-3">
            All
          </ToggleGroupItem>
        </ToggleGroup>

        <Select value={task} onValueChange={(v) => setPrefs({ task: v })}>
          <SelectTrigger size="sm" className="w-44" aria-label="Task">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TASK_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {query.isFetching && !query.isFetchingNextPage && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Spinner className="size-3.5" /> Updating…
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Select value={sort} onValueChange={(v) => setPrefs({ sort: v as SortKey })}>
            <SelectTrigger size="sm" className="w-48" aria-label="Sort by">
              <span className="flex items-center gap-2">
                <ArrowUpDown className="size-4 text-muted-foreground" />
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent align="end">
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={layout}
            onValueChange={(v) => v && setPrefs({ layout: v as BrowseLayout })}
            aria-label="Layout"
          >
            <ToggleGroupItem value="grid" aria-label="Grid" data-testid="layout-grid">
              <LayoutGrid />
            </ToggleGroupItem>
            <ToggleGroupItem value="table" aria-label="Table" data-testid="layout-table">
              <List />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {query.isLoading ? (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
          {Array.from({ length: 12 }).map((_, i) => (
            <ModelCardSkeleton key={i} />
          ))}
        </div>
      ) : query.isError ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <WifiOff />
            </EmptyMedia>
            <EmptyTitle>Couldn’t reach Hugging Face</EmptyTitle>
            <EmptyDescription>{(query.error as Error).message}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              <RotateCcw /> Try again
            </Button>
          </EmptyContent>
        </Empty>
      ) : models.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchX />
            </EmptyMedia>
            <EmptyTitle>No models found</EmptyTitle>
            <EmptyDescription>Try a different search, or widen the filters.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Clear search and filters
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className={cn('transition-opacity', stale && 'opacity-60')} aria-busy={stale}>
          {layout === 'table' ? (
            <ModelTable models={models} onOpen={openModel} />
          ) : (
            <div
              className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]"
              data-testid="model-grid"
            >
              {models.map((model) => (
                <ModelCard key={model.id} model={model} onClick={() => openModel(model.id)} />
              ))}
            </div>
          )}
          <div ref={sentinelRef} className="h-10" />
          {query.isFetchingNextPage && (
            <div className="flex items-center justify-center gap-2 pb-4 text-xs text-muted-foreground">
              <Spinner className="size-3.5" /> Loading more
            </div>
          )}
        </div>
      )}
    </Page>
  )
}
